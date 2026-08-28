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
const connectedUsers = new Map();
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
  
    if (!sessionMap) {
      result.set(tableId, 0)
      continue;
    };
    
    for (const table of sessionMap.values()) {
      const freeSitCount = table.getFreesit();
      
      if(freeSitCount > 0 && freeSitCount <= Number(table.maxSeats)) {
        result.set(tableId, Number(table.maxSeats) - Number(freeSitCount));
      }else if(freeSitCount > Number(table.maxSeats)) {
        result.set(tableId, 0);
      }
    }
  }
  return result;
}

function findTableWithAvailableSeat(tableId) {
    const sessionMap = pokerTables.get(tableId);
    if (!sessionMap) return null;

    for (const table of sessionMap.values()) {
        if (table.hasSeatAvailable()) return table;
    }

    return null;
}

function findTable(tableId) {
  const sessionMap = pokerTables.get(tableId);
  if (!sessionMap) return null;
  
  for (table of sessionMap.values()) {
    if (table) return table;
  }
}

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
        cors: {
          origin: "*"
        }
    })  
    socketServer.use(authenticateSocket);
    
    const tableLocks = new Map();
    const exitTimes = new Map();

    socketServer.on("connection", async (socket) => {
          socket.on('user-connected', async (userData) => {
            try {
                // Récupérer les infos complètes de l'utilisateur
                const user = await User.findByPk(userData.userId);
                
                if (user) {
                    connectedUsers.set(socket.id, {
                        socketId: socket.id,
                        userId: user.id,
                        username: user.username,
                        name: user.name,
                        connectedAt: new Date()
                    });

                    console.log(`👤 ${user.username} connecté. Total: ${connectedUsers.size}`);

                    // Envoyer la liste mise à jour à TOUS les clients
                    socketServer.emit('online-users-update', Array.from(connectedUsers.values()));
                }
            } catch (error) {
                console.error('❌ Erreur lors de la connexion utilisateur:', error);
            }
        });

        // ═══════════════════════════════════════════════════════
        // ✨ AJOUT : Envoyer la liste des utilisateurs en ligne
        // ═══════════════════════════════════════════════════════
        socket.on('get-online-users', () => {
            socket.emit('online-users-update', Array.from(connectedUsers.values()));
        });
        socket.on('joinAnyTable', async ({ tableId, userId, playerCave }) => {
          
          try{
            if (tableLocks.get(tableId)) {
               return socket.emit('joinError', { message: 'La table est temporairement verouillée, réessayez.' });
            }
            
            const exitTime = exitTimes.get(Number(userId));
            const now = Date.now();
            const maxExitTime = 1000 * 60 * 0.5;
            
            if (exitTime && now - exitTime.date < maxExitTime && exitTime.tableId === tableId) {
         //      return socket.emit('joinError', { message: `Vous venez de quitter la table. Veuillez attendre ${formatTime(maxExitTime - (now - exitTime.date))}`})
            }
          
            tableLocks.set(tableId, true);
            
            console.log('join : table =>', tableId, ', user =>', userId, ', cave =>', playerCave);
            
            const found = findPlayerInAllTables(userId, tableId);
            
            if(found) {
              console.log('[JOIN TABLE] player found !');
              const { table, player } = found;
              let idlePlayers = idlePlayersMap.get(table.tableInfo.id) || [];
              console.log('[JOIN TABLE] idle players map :', idlePlayersMap);

              console.log('[JOIN TABLE] Checking idle players', idlePlayers);
              if (idlePlayers.find(id => id === Number(userId))) {
                console.log('[JOIN TABLE] Player is idle:', userId);
                socket.emit('joinError', { message: 'Vous étiez inactif, vous devez rejoindre à nouveau.' });
                idlePlayers = idlePlayers.filter(id => id !== Number(userId));
                idlePlayersMap.set(Number(tableId), idlePlayers);
                table.disconnectTimers.delete(Number(userId));
                
                console.log('[JOIN TABLE] Start remove timer for removing player');
                setTimeout(() => {
                  table.removePlayer(socket.id);
                }, 3000);
                return;
              }

              const oldSocketId = player.socketio.id;
              player.socketio = socket;
              table.players.delete(oldSocketId);
              table.players.set(socket.id, player);
              table.handleReconnect(player.user.id);
              table.broadcastState();
              
              const disconnected = disconnectedPlayers.get(table.id);
              if (disconnected) {
                disconnected.delete(userId);
                // Supprimer aussi tout joueur qui avait ce seatIndex
                for (const [uid, p] of disconnected.entries()) {
                  if (p.seatIndex === player.seatIndex) {
                    disconnected.delete(uid);
                  }
                }
              }
              console.log('[JOIN TABLE] stopped !');
              
              return;
            }

            console.log('[JOIN TABLE] player not found in table');
           // let table = findTableWithAvailableSeat(tableId);
            let table = findTable(tableId);
            if (!table) { 
              table = await createNewTable(tableId);
            }

            let idlePlayers = idlePlayersMap.get(Number(tableId)) || [];
            idlePlayers = idlePlayers.filter(id => id !== Number(userId));
            idlePlayersMap.set(Number(tableId), idlePlayers);
            table.disconnectTimers.delete(Number(userId));

            console.log('[JOIN TABLE] disconnectTimers', table.disconnectTimers);
            console.log('[JOIN TABLE] idlePlayersMap', idlePlayersMap);
            
            const solde = await Soldes.findOne({ where: { userId } });

            if (!solde) {
              return socket.emit('joinError', { message: 'Informations introuvables' });
            }

            if (solde.montant < playerCave) {
              return socket.emit('joinError', { message: 'Solde insuffisant' });    
            }

            const joinedTables = playerTables.get(Number(userId));
            console.log('[JOIN TABLE] joined tables', joinedTables);
            const playerCaves = playerCavesMap.get(Number(userId)) || [];

            if (joinedTables !== undefined && joinedTables.length > 0) {
              let currentPlayerTotalCaves = 0;
              for (let tableId of joinedTables) {
                console.log('[JOIN PLAYER] joined table', tableId);
                const cave = playerCaves.find(cave => parseInt(cave.tableId) === parseInt(tableId));
                if (cave !== undefined) currentPlayerTotalCaves += cave.cave;
              }

              console.log('[JOIN TABLE] current player total caves', currentPlayerTotalCaves);

              if (currentPlayerTotalCaves + Number(playerCave) > solde.montant) {
                return socket.emit('joinError', { message: 'Solde insuffisant' });
              }
            }

            const user =  await User.findByPk(userId);
            const player = new PokerPlayer(socket, user, playerCave);
            
            let seatIndex = null;
            for (let i = 0; i < table.maxSeats; i++) {
               if (!table.seatTaken.has(i)) {
                 seatIndex = i;
                 break;
               }
            }
            
            console.log('Join : seatIndex =>', JSON.stringify(seatIndex));
            
            if (seatIndex === null) {
              return socket.emit('joinError', { message: 'La table est plein, veuillez choisir une autre.' });
            }
            
            const result = table.addPlayer(player, seatIndex);
            const ownTables = playerTables.get(player.user.id) || [];
            ownTables.push(tableId);
            
            playerTables.set(player.user.id, ownTables);
            
            console.log('[JOIN TABLE] player table', playerTables);
            
            const disconnected = disconnectedPlayers.get(table.id);
            if (disconnected) {
              disconnected.delete(userId);
              for (const [uid, p] of disconnected.entries()) {
                if (p.seatIndex === player.seatIndex) {
                  disconnected.delete(uid);
                }
              }
            }
          } catch(err) {
            console.error(err);
          } finally {
            tableLocks.set(tableId, false);
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
          }catch (err) {
            console.error('player action error', err);
            
            socket.emit('playerActionError', { message: err.message || 'Une erreur est survenue lors de l’action du joueur.' });
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

              const stack = table.table?.seats()[player.seatIndex]?.stack ?? 0;
              const userId = player.user.id;
            //  const solde = await Soldes.findOne({ where: { userId } });
             // const newSoldeAmount = Number(solde.montant);
             // await Soldes.update({ montant: Number(newSoldeAmount) }, { where: { userId } });
              
              console.log('Exit : User id', userId);
              exitTimes.set(userId, {
                date: Date.now(),
                tableId: tableId,
              });

            } catch (ignored) {
              console.error(ignored);
              console.log("error quit solde");
              console.log("erreur lors de rajout de solde");
            }
            
            let ownTables = playerTables.get(player.user.id) ?? [];
            ownTables = ownTables.filter(table => table !== tableId);
            playerTables.set(player.user.id, ownTables);
            
            console.log('[QUIT] player tables', playerTables);
            table.removePlayer(socket.id);       
            table.broadcastState();
            socket.emit("quitsuccess", {});
          } catch (err) {
            console.error('Error', err);
            socket.emit("quiterror", {tableId, tableSessionId});
          }
        });
       
       socket.on('sendChatMessage', ({ tableId, tableSessionId, message }) => {
    // Validation du message
    if (!message || message.trim().length === 0) return;
    if (message.length > 200) return;

    try {
        // Récupérer la session de table
        const sessionMap = pokerTables.get(tableId);
        if (!sessionMap) {
            socket.emit('chatError', { message: 'Table introuvable' });
            return;
        }

        // Récupérer la table spécifique
        const table = sessionMap.get(tableSessionId);
        if (!table || !table.players) {
            socket.emit('chatError', { message: 'Session de table introuvable' });
            return;
        }

        // Récupérer le joueur
        const player = table.players.get(socket.id);
        if (!player || !player.user) {
            socket.emit('chatError', { message: 'Joueur introuvable' });
            return;
        }

        // Récupérer les infos du joueur
        const userId = player.user.id;
        const username = player.user.username;

        // ✅ CORRECTION ICI : Utiliser socket.broadcast.to() ou trouver io
        // Option 1 : Envoyer à tous SAUF l'émetteur
        socket.broadcast.to(`table-${tableId}`).emit('chatMessage', {
            userId: userId,
            username: username,
            message: message.trim(),
            timestamp: new Date()
        });

        // Envoyer aussi au socket émetteur
        socket.emit('chatMessage', {
            userId: userId,
            username: username,
            message: message.trim(),
            timestamp: new Date()
        });

    } catch (error) {
        console.error('Erreur lors de l\'envoi du message chat:', error);
        socket.emit('chatError', { message: 'Erreur lors de l\'envoi du message' });
    }
});

        socket.on('disconnect', async () => {
          try {
            for (const [tableId, sessionMap] of pokerTables.entries()) {
              for (const [tableSessionId, table] of sessionMap.entries()) {
                const player = table.players.get(socket.id);
                if (player) {
                  table.handleDisconnect(player.user.id, socket.id);
                  if(!disconnectedPlayers.get(tableSessionId)) {
                    disconnectedPlayers.set(tableSessionId, new Map())
                  }
                  disconnectedPlayers.get(tableSessionId).set(player.user.id, player);
                  console.log('[DISCONNECT] disconnect', player.seatIndex, player.user.name);
                  

                  exitTimes.set(player.user.id, {
                    date: Date.now(),
                    tableId: tableId,
                  });
                  
                  table.broadcastState();
                  break;
                }
              }
            }  
            
          } catch (error) {
             console.error("[DISCONNECT] ERR", error);
          }
        });

    });

    return httpServer;
}

module.exports = { serverSocket, getFreeSits, findPlayerInAllTables,connectedUsers };