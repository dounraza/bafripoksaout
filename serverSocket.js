const socketIo = require("socket.io");
const http = require("http");
const PokerPlayer = require('./game/pokerPlayers')
const PokerTable = require("./game/pokerTables"); 
const Table = require("./model/Table");
const User = require("./model/User");
const authenticateSocket = require('./middleware/socketMiddleware');
const Soldes = require("./model/Soldes");
const disconnectedPlayers = require('./data/SharedData');
const playerTables = require('./game/playerTables');
const playerCavesMap = require('./game/playerCaves');
const idlePlayersMap = require('./game/idlePlayers');

const pokerTables = new Map();
const lockPromises = new Map(); 
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');
  return `${paddedMinutes}:${paddedSeconds}`;
}

function getFreeSits(tableIds) {
  const result = new Map(); 
  for(const tableId of tableIds) {
    const sessionMap = pokerTables.get(String(tableId));
    if (!sessionMap) { result.set(tableId, 0); continue; }
    for (const table of sessionMap.values()) {
      const freeSitCount = table.getFreesit();
      if(freeSitCount > 0 && freeSitCount <= Number(table.maxSeats)) {
        result.set(tableId, Number(table.maxSeats) - Number(freeSitCount));
      } else if(freeSitCount > Number(table.maxSeats)) {
        result.set(tableId, 0);
      }
    }
  }
  return result;
}
async function acquireLock(tableId) {
    // Tant qu'un lock existe sur cette table, on attend qu'il se libère
    while (lockPromises.get(tableId)) {
        await lockPromises.get(tableId); // on attend la fin du joueur précédent
    }
    
    // On crée notre propre lock (une Promise non résolue)
    let resolve;
    const p = new Promise(r => resolve = r);
    lockPromises.set(tableId, p); // on bloque la table pour nous
    
    return resolve; // on retourne la fonction pour se "déverrouiller" plus tard
}
function findTableWithAvailableSeat(tableId) {
    const sessionMap = pokerTables.get(tableId);
    if (!sessionMap) return null;
    for (const table of sessionMap.values()) {
        if (table.hasSeatAvailable()) return table;
    }
    return null;
}
//find table by id without checking for free seats
function findTable(tableId) {
  const sessionMap = pokerTables.get(tableId);
  if (!sessionMap) return null;
  for (table of sessionMap.values()) {
    if (table) return table;
  }
}

// Cette fonction sera redéfinie après la création du serveur socket
let getConnectionStats = () => ({
    totalConnected: 0,
    tableStats: {}
});

async function createNewTable(tableId) {
    const tableInfo = await Table.findByPk(tableId);
    const newTable = new PokerTable(tableInfo);
    if (!pokerTables.has(tableId)) {
        pokerTables.set(tableId, new Map());
    }
    pokerTables.get(tableId).set(newTable.id, newTable);
    return newTable;
}

function findPlayerInAllTables(userId, tableId) {
    console.log('[FIND IN ALL TABLE] table id', tableId);
    const sessionMap = pokerTables.get(tableId);
    console.log('[FIND IN ALL TABLE] session map', sessionMap);
    if (!sessionMap) return null;
    
    for (const [tableSessionId, table] of sessionMap.entries()) {
        const disconnectedPlayersSession = disconnectedPlayers.get(tableSessionId);
        for(const [disconnectedUserId, playerReconnected] of disconnectedPlayersSession?.entries() ?? []) {
          if (disconnectedUserId === Number(userId)) {
              disconnectedPlayersSession.delete(disconnectedUserId);
              if (disconnectedPlayersSession.size === 0) {
                  disconnectedPlayers.delete(tableSessionId);
              }
              return { table, player: playerReconnected };
          }
        }
    }
    
    for (const table of sessionMap.values()) {
        for (const player of table.players.values()) {
            if (player.user.id == userId) {
                return { table, player };
            }
        }
    }
    return null;
}

const serverSocket = (app) => {
    const httpServer = http.createServer(app);
    const socketServer = socketIo(httpServer, {
        cors: { origin: "*" }
    });
    // socketServer.use(authenticateSocket);
    
    socketServer.on('error', (err) => {
        console.error('Socket.io server error:', err);
    });

    let connectedUsers = new Map(); // Store all connected users
    let tableUsers = new Map(); // Store users by table

    const exitTimes = new Map();
    const tableChatHistory = new Map();
    const MAX_MESSAGES_PER_TABLE = 100;
    let connectedUsersCount = 0;
    
    socketServer.on("connection", (socket) => {
        console.log(`👤 Utilisateur connecté: ${socket.id}`);

        socket.on('error', (err) => {
            console.error(`Socket error for ${socket.id}:`, err);
        });

        socket.on("user_connected", (userData) => {
            connectedUsers.set(socket.id, {
                socketId: socket.id,
                userId: userData.userId,
                username: userData.username,
                connectedAt: new Date(),
            });

            // ✅ Envoyer à TOUS les clients (broadcast)
            socketServer.emit("users_count_update", {
                total: connectedUsers.size,
                users: Array.from(connectedUsers.values()),
            });

            console.log(`✅ ${userData.username} connecté. Total: ${connectedUsers.size}`);
        });

        socket.on("join_table", ({ tableId, userId, username }) => {
            socket.join(`table_${tableId}`);
            
            if (!tableUsers.has(tableId)) {
                tableUsers.set(tableId, new Set());
            }
            tableUsers.get(tableId).add(userId);

            socketServer.to(`table_${tableId}`).emit("table_users_update", {
                tableId,
                count: tableUsers.get(tableId).size,
                users: Array.from(tableUsers.get(tableId)),
            });

            console.log(`🎲 ${username} a rejoint la table ${tableId}`);
        });

        socket.on("leave_table", ({ tableId, userId }) => {
            socket.leave(`table_${tableId}`);
            
            if (tableUsers.has(tableId)) {
                tableUsers.get(tableId).delete(userId);
                
                socketServer.to(`table_${tableId}`).emit("table_users_update", {
                    tableId,
                    count: tableUsers.get(tableId).size,
                });
            }
        });

        // Émettre le nombre à tous les clients
        socketServer.emit('connectedUsersUpdate', { count: connectedUsersCount });
        
                socket.on('joinAnyTable', async ({ tableId, userId, playerCave }) => {
                            let release = null; // ✅ déclaré en dehors du try
                        try {
                                release = await acquireLock(tableId); // attend son tour
                // if (tableLocks.get(tableId)) {
                //     return socket.emit('joinError', { message: 'La table est temporairement verouillée, réessayez.' });
                // }
                
                const exitTime = exitTimes.get(Number(userId));
                const now = Date.now();
                const maxExitTime = 1000 * 60 * 0.5;
                
                if (exitTime && now - exitTime.date < maxExitTime && exitTime.tableId === tableId) {
                    // return socket.emit('joinError', { message: `Vous venez de quitter la table. Veuillez attendre ${formatTime(maxExitTime - (now - exitTime.date))}`})
                }
            
                // tableLocks.set(tableId, true);
                console.log('join : table =>', tableId, ', user =>', userId, ', cave =>', playerCave);
                
                const found = findPlayerInAllTables(userId, tableId);
                
                if(found) {
                    console.log('[JOIN TABLE] player found !');
                    const { table, player } = found;
                    let idlePlayers = idlePlayersMap.get(table.tableInfo.id) || [];

                    if (idlePlayers.find(id => id === Number(userId))) {
                        console.log('[JOIN TABLE] Player is idle:', userId);
                        socket.emit('joinError', { message: 'Vous étiez inactif, vous devez rejoindre à nouveau.' });
                        idlePlayers = idlePlayers.filter(id => id !== Number(userId));
                        idlePlayersMap.set(Number(tableId), idlePlayers);
                        table.disconnectTimers.delete(Number(userId));
                        setTimeout(() => { table.removePlayer(socket.id); }, 3000);
                        return;
                    }

                    const oldSocketId = player.socketio.id;
                    player.socketio = socket;
                    table.players.delete(oldSocketId);
                    table.players.set(socket.id, player);
                    
                    socket.join(`table-${tableId}`);
                    console.log(`✅ Player ${userId} rejoined chat room: table-${tableId}`);
                    
                    table.handleReconnect(player.user.id);
                    table.broadcastState();
                    
                    const disconnected = disconnectedPlayers.get(table.id);
                    if (disconnected) {
                        disconnected.delete(userId);
                        for (const [uid, p] of disconnected.entries()) {
                            if (p.seatIndex === player.seatIndex) disconnected.delete(uid);
                        }
                    }

                    // ✅ Envoyer l'historique du chat au joueur qui reconnecte
                    const chatHistory = tableChatHistory.get(tableId) || [];
                    if (chatHistory.length > 0) {
                        socket.emit('chatHistory', { messages: chatHistory });
                    }

                    console.log('[JOIN TABLE] stopped !');
                    return;
                }

                console.log('[JOIN TABLE] player not found in table');
                let table = findTable(tableId);
                if (!table) { 
                    table = await createNewTable(tableId);
                }

                let idlePlayers = idlePlayersMap.get(Number(tableId)) || [];
                idlePlayers = idlePlayers.filter(id => id !== Number(userId));
                idlePlayersMap.set(Number(tableId), idlePlayers);
                table.disconnectTimers.delete(Number(userId));
                
                const solde = await Soldes.findOne({ where: { userId } });
                if (!solde) return socket.emit('joinError', { message: 'Informations introuvables' });
                if (solde.montant < playerCave) return socket.emit('joinError', { message: 'Solde insuffisant' });    

                const joinedTables = playerTables.get(Number(userId));
                const playerCaves = playerCavesMap.get(Number(userId)) || [];

                if (joinedTables !== undefined && joinedTables.length > 0) {
                    let currentPlayerTotalCaves = 0;
                    for (let tableId of joinedTables) {
                        const cave = playerCaves.find(cave => parseInt(cave.tableId) === parseInt(tableId));
                        if (cave !== undefined) currentPlayerTotalCaves += cave.cave;
                    }
                    if (currentPlayerTotalCaves + Number(playerCave) > solde.montant) {
                        return socket.emit('joinError', { message: 'Solde insuffisant' });
                    }
                }

                const user = await User.findByPk(userId);
                const player = new PokerPlayer(socket, user, playerCave);
                
                let seatIndex = null;
                for (let i = 0; i < table.maxSeats; i++) {
                    if (!table.seatTaken.has(i)) { seatIndex = i; break; }
                }
                
                if (seatIndex === null) {
                    return socket.emit('joinError', { message: 'La table est plein, veuillez choisir une autre.' });
                }
                
                const result = table.addPlayer(player, seatIndex);
                
                socket.join(`table-${tableId}`);
                console.log(`✅ Player ${userId} joined chat room: table-${tableId}`);
                
                const ownTables = playerTables.get(player.user.id) || [];
                // ownTables.push(tableId);
                if (!ownTables.includes(tableId)) {
                    ownTables.push(tableId);
                }
                playerTables.set(player.user.id, ownTables);
                
                const disconnected = disconnectedPlayers.get(table.id);
                if (disconnected) {
                    disconnected.delete(userId);
                    for (const [uid, p] of disconnected.entries()) {
                        if (p.seatIndex === player.seatIndex) disconnected.delete(uid);
                    }
                }

                // ✅ Envoyer l'historique du chat au joueur qui vient de rejoindre
                const chatHistory = tableChatHistory.get(tableId) || [];
                if (chatHistory.length > 0) {
                    socket.emit('chatHistory', { messages: chatHistory });
                    console.log(`📚 Historique envoyé à ${userId}: ${chatHistory.length} messages`);
                }

            } catch(err) {
                console.error(err);
            } finally {
             //   tableLocks.set(tableId, false);
                lockPromises.delete(tableId); // supprime le lock
                release();                    // débloque le prochain en attente
            }
        });

        socket.on("playerAction", async ({tableId, tableSessionId, playerSeats, action, bet}) => {
            console.log('# Player action');
            try {
                const pokerTable = pokerTables.get(tableId)?.get(tableSessionId);
                if (!pokerTable) {
                    socket.emit('playerActionError', { message: 'table not found' });
                    return;
                }  
                await pokerTable.playerAction(socket, playerSeats, action, bet, disconnectedPlayers);
                pokerTable.broadcastState();
            } catch (err) {
                console.error('player action error', err);
                socket.emit('playerActionError', { message: err.message || 'Une erreur est survenue lors de l\'action du joueur.' });
            }
        });

        socket.on('quit', async ({ tableId, tableSessionId }) => {
            try {
                const sessionMap = pokerTables.get(tableId);
                if (!sessionMap) return;
                const table = sessionMap.get(tableSessionId);
                if (!table || !table.players) return;
                const player = table.players.get(socket.id);
                if (!player) return;
                
                console.log('Exit player', player.seatIndex);

                try {
                    if (player.quiteDate && Date.now() <= player.quiteDate.getTime() && table.seatTaken.size > 1) {
                        const timeLeftMs = player.quiteDate.getTime() - Date.now();
                        const minutes = Math.floor(timeLeftMs / 60000);
                        const seconds = Math.floor((timeLeftMs % 60000) / 1000);
                        socket.emit("timeerror", {
                            message: "Action refusée. Le joueur est encore actif.",
                            timeLeftMs,
                            formatted: `${minutes}m ${seconds}s restantes`
                        });
                        return;
                    }

                    const userId = player.user.id;
                    console.log('Exit : User id', userId);
                    exitTimes.set(userId, { date: Date.now(), tableId: tableId });
                } catch (ignored) {
                    console.error(ignored);
                }
                
                let ownTables = playerTables.get(player.user.id) ?? [];
                ownTables = ownTables.filter(table => table !== tableId);
                playerTables.set(player.user.id, ownTables);
                
                socket.leave(`table-${tableId}`);
                console.log(`❌ Player ${player.user.id} left chat room: table-${tableId}`);
                
                table.removePlayer(socket.id);       
                table.broadcastState();
                socket.emit("quitsuccess", {});
            } catch (err) {
                console.error('Error', err);
                socket.emit("quiterror", {tableId, tableSessionId});
            }
        });
       
        socket.on('sendChatMessage', (data) => {
            const { tableId, message } = data;

            // ✅ FIX : Résoudre le nom depuis pokerTables car socket.username
            // n'est jamais assigné (l'event 'joinTable' n'est pas émis côté client)
            let senderName = 'Inconnu';
            let senderId = null;

            outer:
            for (const sessionMap of pokerTables.values()) {
                for (const table of sessionMap.values()) {
                    const player = table.players.get(socket.id);
                    if (player) {
                        senderName = player.user.name || player.user.username || player.user.email || 'Inconnu';
                        senderId = player.user.id;
                        break outer;
                    }
                }
            }

            console.log(`💬 Message de ${senderName} (${senderId}) sur table ${tableId}:`, message);

            const chatMessage = {
                userId: senderId,
                username: senderName,
                message: message,
                timestamp: new Date(),
            };

            if (!tableChatHistory.has(tableId)) {
                tableChatHistory.set(tableId, []);
            }
            const history = tableChatHistory.get(tableId);
            history.push(chatMessage);
            if (history.length > MAX_MESSAGES_PER_TABLE) {
                history.shift();
                console.log(`🗑️ Message le plus ancien supprimé pour la table ${tableId}`);
            }
            console.log(`💾 Historique table ${tableId}: ${history.length}/${MAX_MESSAGES_PER_TABLE} messages`);

            // ✅ FIX : Bonne room avec préfixe "table-" (cohérent avec socket.join)
            socketServer.to(`table-${tableId}`).emit('chatMessage', chatMessage);
        });

        socket.on('leaveTable', (data) => {
            const { tableId } = data;
            console.log(`👋 Joueur quitte la table ${tableId}`);
            socket.leave(`table-${tableId}`);
            
            const sessionMap = pokerTables.get(tableId);
            const playersCount = sessionMap
                ? [...sessionMap.values()].reduce((sum, t) => sum + t.players.size, 0)
                : 0;
            
            if (playersCount === 0) {
                console.log(`🧹 Table ${tableId} vide, suppression de l'historique`);
                tableChatHistory.delete(tableId);
            }
        });

        // ✅ ÉCOUTER l'événement disconnect (ne pas l'émettre)
        socket.on("disconnect", (reason) => {
            const user = connectedUsers.get(socket.id);
            
            if (user) {
                console.log(`❌ ${user.username} déconnecté (raison: ${reason})`);
                
                connectedUsers.delete(socket.id);
                
                // Nettoyer les tables
                tableUsers.forEach((users, tableId) => {
                    if (users.has(user.userId)) {
                        users.delete(user.userId);
                        socketServer.to(`table_${tableId}`).emit("table_users_update", {
                            tableId,
                            count: users.size,
                        });
                    }
                });

                socketServer.emit("users_count_update", {
                    total: connectedUsers.size,
                });
                for (const [tid, sessionMap] of pokerTables.entries()) {
                    for (const [sessionId, table] of sessionMap.entries()) {
                        if (table.players.has(socket.id)) {
                            const player = table.players.get(socket.id);
                            console.log(`💀 Joueur ${player.user.id} déconnecté de la table ${tid}`);
                            table.handleDisconnect(player.user.id); // selon ta logique métier
                        }
                    }
                 }
            }
        });

    });

    // ✅ Redéfinir la fonction pour accéder aux données en temps réel
    getConnectionStats = () => {
        const stats = {
            totalConnected: connectedUsers.size,
            connectedUsersList: Array.from(connectedUsers.values()).map(u => ({
                socketId: u.socketId,
                userId: u.userId,
                username: u.username,
                connectedAt: u.connectedAt
            })),
            tableStats: {}
        };
        
        for (const [tableId, userSet] of tableUsers.entries()) {
            stats.tableStats[tableId] = userSet.size;
        }
        
        return stats;
    };

    return httpServer;
}

module.exports = { serverSocket, getFreeSits, findPlayerInAllTables, getConnectionStats, findTable };