const socketIo = require("socket.io");
const http = require("http");
const PokerPlayer = require('./game/pokerPlayers')
const LudoPlayer = require('./game/ludoPlayers')
const PokerTable = require("./game/pokerTables"); 
const LudoTable = require("./game/ludoTables"); 
const Table = require("./model/Table");
const LudoGame = require("./model/LudoGame");
const User = require("./model/User");
const authenticateSocket = require('./middleware/socketMiddleware');
const Soldes = require("./model/Soldes");
const sequelize = require("./config/Db");
const disconnectedPlayers = require('./data/SharedData');
const playerTables = require('./game/playerTables');
const playerCavesMap = require('./game/playerCaves');
const idlePlayersMap = require('./game/idlePlayers');

async function debitLudoEntry(userId, amount) {
    return sequelize.transaction(async transaction => {
        const solde = await Soldes.findOne({
            where: { userId },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!solde) throw new Error('Solde joueur introuvable');

        const currentBalance = Number(solde.montant);
        const cave = Number(amount);
        if (!Number.isFinite(currentBalance) || currentBalance < cave) {
            throw new Error('Solde insuffisant pour cette cave');
        }

        solde.montant = currentBalance - cave;
        await solde.save({ transaction });
        return Number(solde.montant);
    });
}

async function creditLudoEntry(userId, amount) {
    return sequelize.transaction(async transaction => {
        const solde = await Soldes.findOne({
            where: { userId },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!solde) throw new Error('Solde joueur introuvable');

        solde.montant = Number(solde.montant || 0) + Number(amount || 0);
        await solde.save({ transaction });
        return Number(solde.montant);
    });
}

async function settleLudoWinner(table, winner) {
    const players = table.seats.filter(Boolean);
    const winnerSeat = players.find(seat => seat.userId === winner.user.id);
    if (!winnerSeat || players.length !== 2) throw new Error('Joueurs Ludo invalides');
    const totalCave = players.reduce((sum, seat) => sum + Number(seat.cave || 0), 0);
    const rake = Math.floor(totalCave * Number(table.rakeRate || 0.10));
    const prizePool = totalCave - rake;
    const loserSeat = players.find(seat => seat.userId !== winner.user.id);
    let winnerBalance;
    let loserBalance;

    await sequelize.transaction(async transaction => {
        const winnerSolde = await Soldes.findOne({ where: { userId: winnerSeat.userId }, transaction, lock: transaction.LOCK.UPDATE });
        const loserSolde = await Soldes.findOne({ where: { userId: loserSeat.userId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!winnerSolde || !loserSolde) throw new Error('Solde joueur introuvable');
        // Les caves ont déjà été débitées à l'entrée de la table.
        // À la fin, seul le gagnant reçoit le pot net.
        winnerSolde.montant = Number(winnerSolde.montant || 0) + prizePool;
        await winnerSolde.save({ transaction });
        winnerBalance = Number(winnerSolde.montant);
        loserBalance = Number(loserSolde.montant);
    });

    const result = { winnerId: winnerSeat.userId, totalCave, rake, prizePool, winnerBalance, loserBalance };
    for (const player of table.players.values()) {
        const isWinner = Number(player.user.id) === Number(winnerSeat.userId);
        player.socketio.emit('ludoGameFinished', {
            ...result,
            isWinner,
            updatedBalance: isWinner ? winnerBalance : loserBalance,
        });
    }
    return result;
}

async function refundLudoSoloExit(player) {
    return sequelize.transaction(async transaction => {
        const solde = await Soldes.findOne({
            where: { userId: player.user.id },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!solde) throw new Error('Solde joueur introuvable');
        solde.montant = Number(solde.montant || 0) + Number(player.chips || 0);
        await solde.save({ transaction });
        player.socketio.emit('soldeUpdated', { montant: Number(solde.montant) });
    });
}

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
    const sessionMap = pokerTables.get(String(tableId));
    if (!sessionMap) return null;
    for (const table of sessionMap.values()) {
        if (table.hasSeatAvailable()) return table;
    }
    return null;
}
//find table by id without checking for free seats
function findTable(tableId) {
  const sessionMap = pokerTables.get(String(tableId));
  if (!sessionMap) return null;
  for (const table of sessionMap.values()) {
    if (table) return table;
  }
  return null;
}

// Cette fonction sera redéfinie après la création du serveur socket
let getConnectionStats = () => ({
    totalConnected: 0,
    tableStats: {}
});

const isLudoGame = (gameType) => String(gameType || '').trim().toLowerCase() === 'ludo';

async function createNewTable(tableId) {
    const tableInfo = await Table.findByPk(tableId);
    if (!tableInfo) return null;
    
    let newTable;
    if (isLudoGame(tableInfo.gameType)) {
        newTable = new LudoTable(tableInfo.get ? tableInfo.get({ plain: true }) : tableInfo);
        newTable.onWinner = settleLudoWinner;
        newTable.onSoloQuit = refundLudoSoloExit;
        newTable.persistState = async (state) => {
            await LudoGame.upsert({
                tableId: Number(state.tableId),
                sessionId: state.sessionId,
                status: state.settled ? 'finished' : state.gameStarted ? 'playing' : 'waiting',
                gameState: state,
            });
        };
        newTable.clearPersistentState = async () => {
            await LudoGame.destroy({ where: { tableId: Number(tableId) } });
        };
        const savedGame = await LudoGame.findOne({ where: { tableId: Number(tableId) } });
        if (savedGame?.gameState) {
            newTable.restorePersistentState(savedGame.gameState);
        }
    } else {
        newTable = new PokerTable(tableInfo.get ? tableInfo.get({ plain: true }) : tableInfo);
    }
    
    const tKey = String(tableId);
    if (!pokerTables.has(tKey)) {
        pokerTables.set(tKey, new Map());
    }
    pokerTables.get(tKey).set(newTable.id, newTable);
    return newTable;
}

function findPlayerInAllTables(userId, tableId) {
    const targetTableId = String(tableId);
    const targetUserId = Number(userId);

    for (const [tId, sessionMap] of pokerTables.entries()) {
        if (String(tId) === targetTableId) {
            for (const [tableSessionId, table] of sessionMap.entries()) {
                const disconnectedPlayersSession = disconnectedPlayers.get(tableSessionId);
                for (const [disconnectedUserId, playerReconnected] of disconnectedPlayersSession?.entries() ?? []) {
                    if (Number(disconnectedUserId) === targetUserId) {
                        disconnectedPlayersSession.delete(disconnectedUserId);
                        if (disconnectedPlayersSession.size === 0) {
                            disconnectedPlayers.delete(tableSessionId);
                        }
                        return { table, player: playerReconnected };
                    }
                }
                for (const player of table.players.values()) {
                    if (Number(player.user?.id) === targetUserId) {
                        return { table, player };
                    }
                }
            }
        }
    }
    return null;
}

function findActiveTable(userId, requestedTableId) {
    const targetUserId = Number(userId);
    const targetTableId = String(requestedTableId);

    for (const [tableId, sessionMap] of pokerTables.entries()) {
        if (String(tableId) === targetTableId) continue;

        for (const table of sessionMap.values()) {
            const activePlayer = [...table.players.values()].find((player) => (
                Number(player.user?.id) === targetUserId
            ));
            const savedSeat = Array.isArray(table.seats)
                ? table.seats.find((seat) => Number(seat?.userId) === targetUserId)
                : null;
            if (activePlayer || savedSeat) return table;
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
        
                socket.on('joinAnyTable', async (data) => {
                    console.log('[DEBUG] joinAnyTable full data object:', JSON.stringify(data));

                    // Try different ways to access tableId in case of weird payload structure
                    const tableId = data.tableId || data.tableid || data.id; 
                    const userId = data.userId || data.userid;
                    const playerCave = data.playerCave || data.cave;
                    const preferredColor = data.color;

                    console.log('[DEBUG] Extracted: tableId=', tableId, ', userId=', userId, ', cave=', playerCave);

                    let release = null;
                    try {
                        release = await acquireLock(tableId);

                        // ... rest of the logic using these extracted variables
                        console.log('join : table =>', tableId, ', user =>', userId, ', cave =>', playerCave);

                const activeTable = findActiveTable(userId, tableId);
                if (activeTable) {
                    return socket.emit('joinError', {
                        message: 'Vous êtes déjà sur une autre table. Quittez-la avant de rejoindre celle-ci.',
                    });
                }
                
                const found = findPlayerInAllTables(userId, tableId);
                
                if(found) {
                    console.log('[JOIN TABLE] player found !');
                    const { table, player } = found;

                    // Permettre au joueur de modifier sa couleur avant que
                    // la partie ne commence (utile après une reconnexion).
                    if (isLudoGame(table.tableInfo.gameType) && preferredColor && preferredColor !== player.color) {
                        const newSeatIndex = table.colors.indexOf(preferredColor);
                        const occupiedByOther = newSeatIndex < 0 || (table.seats[newSeatIndex] && table.seats[newSeatIndex].userId !== player.user.id);
                        if (table.gameStarted || occupiedByOther) {
                            return socket.emit('joinError', { message: 'Cette couleur est déjà prise ou la partie a commencé.' });
                        }
                        const oldSeatIndex = table.seats.findIndex(seat => seat && seat.userId === player.user.id);
                        if (oldSeatIndex >= 0) table.seats[oldSeatIndex] = null;
                        player.color = preferredColor;
                        table.seats[newSeatIndex] = { userId: player.user.id, name: player.user.name, cave: player.chips, color: preferredColor };
                    }
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

                if (!table) {
                    return socket.emit('joinError', { message: 'Table introuvable' });
                }

                // Le montant de la table en base est la source de secours.
                // Le frontend peut ne pas transmettre la cave lorsqu'on ouvre
                // directement une partie Ludo depuis /ludo/:tableId.
                const requestedCave = Number(playerCave);
                const tableCave = Number(table.tableInfo?.cave);
                const parsedCave = Number.isFinite(requestedCave) && requestedCave > 0
                    ? requestedCave
                    : tableCave;
                if (!Number.isFinite(parsedCave) || parsedCave <= 0) {
                    return socket.emit('joinError', { message: 'Cave invalide pour cette table.' });
                }
                const numUserId = Number(userId);

                // ... (existing checks)

                const user = await User.findByPk(numUserId);
                if (!user) return socket.emit('joinError', { message: 'Utilisateur introuvable' });

                let result;
                let player;
                if (isLudoGame(table.tableInfo.gameType)) {
                    // Logic Ludo
                    let balanceAfterEntry;
                    let restoredPlayer;
                    let previousRoundDebit;
                    socket.join(`table-${tableId}`);
                    restoredPlayer = table.restorePlayer(socket, user);
                    if (restoredPlayer) {
                        result = restoredPlayer;
                    }
                    if (!restoredPlayer) {
                    const occupiedSeats = table.seats.filter(Boolean);
                    const previousSeat = table.settled && occupiedSeats.length === 1
                        ? occupiedSeats[0]
                        : null;
                    if (previousSeat) {
                        try {
                            previousRoundDebit = {
                                userId: Number(previousSeat.userId),
                                cave: Number(previousSeat.cave || 0),
                            };
                            previousRoundDebit.balance = await debitLudoEntry(
                                previousRoundDebit.userId,
                                previousRoundDebit.cave,
                            );
                        } catch (error) {
                            previousRoundDebit = null;
                            return socket.emit('joinError', { message: error.message });
                        }
                    }
                    try {
                        balanceAfterEntry = await debitLudoEntry(numUserId, parsedCave);
                    } catch (error) {
                        if (previousRoundDebit) {
                            await creditLudoEntry(previousRoundDebit.userId, previousRoundDebit.cave);
                        }
                        return socket.emit('joinError', { message: error.message });
                    }
                    result = table.addPlayer(socket, user, parsedCave, preferredColor);
                    player = table.players.get(socket.id); // Récupérer le joueur créé
                    if (!result || result.error) {
                        await creditLudoEntry(numUserId, parsedCave);
                        if (previousRoundDebit) {
                            await creditLudoEntry(previousRoundDebit.userId, previousRoundDebit.cave);
                        }
                        return socket.emit('joinError', { message: result?.error || 'Impossible de s\'installer à la table.' });
                    }
                    const previousPlayer = [...table.players.values()].find(
                        candidate => Number(candidate.user.id) === previousRoundDebit?.userId,
                    );
                    if (previousPlayer && previousRoundDebit) {
                        previousPlayer.socketio.emit('soldeUpdated', { montant: previousRoundDebit.balance });
                    }
                    socket.emit('soldeUpdated', { montant: balanceAfterEntry });
                    }
                    player = table.players.get(socket.id);
                    await table.savePersistentState();
                } else {
                    // Logic Poker
                    player = new PokerPlayer(socket, user, parsedCave);
                    let seatIndex = null;
                    for (let i = 0; i < table.maxSeats; i++) {
                        if (!table.seatTaken.has(i)) { seatIndex = i; break; }
                    }
                    if (seatIndex === null) {
                        return socket.emit('joinError', { message: 'La table est pleine.' });
                    }
                    result = table.addPlayer(player, seatIndex);
                }

                if (!result || result.error) {
                    return socket.emit('joinError', { message: result?.error || 'Impossible de s\'installer à la table.' });
                }
                
                socket.join(`table-${tableId}`);
                console.log(`✅ Player ${userId} joined chat room: table-${tableId}`);
                if (isLudoGame(table.tableInfo.gameType)) table.broadcastState();
                
                const ownTables = playerTables.get(player.user.id) || [];
                if (!ownTables.includes(tableId)) {
                    ownTables.push(tableId);
                }
                playerTables.set(player.user.id, ownTables);
                
                // ✅ Mettre à jour playerCavesMap pour le suivi des caves
                let playerCavesVal = playerCavesMap.get(numUserId) || [];
                playerCavesVal = playerCavesVal.filter(c => String(c.tableId) !== String(tableId));
                playerCavesVal.push({ tableId: String(tableId), cave: parsedCave });
                playerCavesMap.set(numUserId, playerCavesVal);
                
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

                table.broadcastState();

            } catch(err) {
                console.error(err);
            } finally {
             //   tableLocks.set(tableId, false);
                lockPromises.delete(tableId); // supprime le lock
                release();                    // débloque le prochain en attente
            }
        });

        socket.on('joinTableSession', async ({ tableId, tableSessionId, userId, playerCave }) => {
            // Délégué directement vers les vérifications de table existante ou nouvelle
            socket.emit('joinAnyTable', { tableId, userId, playerCave });
        });

        socket.on('add_agent', ({ tableId, tableSessionId, chips }) => {
            console.log(`[ADD AGENT] Table: ${tableId}, Session: ${tableSessionId}`);
            const sessionMap = pokerTables.get(String(tableId));
            if (!sessionMap) return;
            const table = sessionMap.get(tableSessionId);
            if (!table) return;
            
            table.addAgent(chips || 1000);
            table.broadcastState();
        });

        socket.on("ludoAction", async ({tableId, tableSessionId, action, data}) => {
            console.log('# Ludo action');
            try {
                const sessionMap = pokerTables.get(String(tableId));
                if (!sessionMap) {
                    socket.emit('ludoActionError', { message: 'table not found' });
                    return;
                }
                const ludoTable = sessionMap.get(tableSessionId);
                if (!ludoTable) {
                    socket.emit('ludoActionError', { message: 'table session not found' });
                    return;
                }
                await ludoTable.ludoAction(socket, action, data);
            } catch (err) {
                console.error('ludo action error', err);
                socket.emit('ludoActionError', { message: err.message || 'Une erreur est survenue lors de l\'action du joueur.' });
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

        // socket.on('recave', async ({ tableId, amount }) => {
        //     console.log(`[RECAVE] User ${socket.id} recave ${amount} on table ${tableId}`);
        //     try {
        //         // Trouver le joueur dans l'une des tables
        //         let foundPlayer = null;
        //         let foundTable = null;
        //         for (const sessionMap of pokerTables.values()) {
        //             for (const pokerTable of sessionMap.values()) {
        //                 const player = pokerTable.players.get(socket.id);
        //                 if (player && String(pokerTable.tableInfo.id) === String(tableId)) {
        //                     foundPlayer = player;
        //                     foundTable = pokerTable;
        //                     break;
        //                 }
        //             }
        //             if (foundPlayer) break;
        //         }
        //         if (!foundPlayer || !foundTable) {
        //             return socket.emit('recaveError', { message: 'Joueur ou table introuvable' });
        //         }
        //         // 1. Vérifier le solde en DB
        //         const solde = await Soldes.findOne({ where: { userId: foundPlayer.user.id } });
        //         if (!solde || solde.montant < amount) {
        //             return socket.emit('recaveError', { message: 'Solde insuffisant' });
        //         }
        //         // AJOUT : Vérifier qu'aucune main n'est en cours
        //         if (foundTable.table.isHandInProgress()) {
        //             return socket.emit('recaveError', { message: 'Action impossible pendant la main' });
        //         }
        //         // 2. Mettre à jour le solde en DB
        //         await Soldes.update(
        //             { montant: Number(solde.montant) - Number(amount) }, 
        //             { where: { userId: foundPlayer.user.id } }
        //         );
        //         // 3. Mettre à jour le stack du joueur
        //         const table = foundTable.table;
        //         const seatIndex = foundPlayer.seatIndex;
        //         // Mettre à jour le stack dans le moteur poker-ts
        //         // On doit d'abord faire lever le joueur pour pouvoir modifier son stack
        //         table.standUp(seatIndex);
        //                         // On récupère le stack actuel
        //         const currentStack = foundPlayer.chips; 
        //         // On calcule le nouveau total
        //         const newStack =  Number(amount);
        //         // On asseoit le joueur avec le NOUVEAU TOTAL
        //         table.sitDown(seatIndex, newStack);
        //         // Mettre à jour le stack local du joueur et la map des caves
        //         foundPlayer.chips = newStack;
        //         foundTable.caves.set(foundPlayer.user.id, foundPlayer.chips);
        //         // 4. Mettre à jour playerCavesMap
        //         let playerCavesVal = playerCavesMap.get(foundPlayer.user.id) || [];
        //         let caveObj = playerCavesVal.find(cave => String(cave.tableId) === String(tableId));
        //         if (caveObj) {
        //             caveObj.cave = foundPlayer.chips;
        //         } else {
        //             playerCavesVal.push({ tableId: tableId, cave: foundPlayer.chips });
        //         }
        //         playerCavesMap.set(foundPlayer.user.id, playerCavesVal);
        //         foundTable.broadcastState();
        //         console.log(`[RECAVE] Succès: ${foundPlayer.user.name} a recavé ${foundPlayer.chips} jetons.`);
        //     } catch (err) {
        //         console.error('[RECAVE] ERR', err);
        //         socket.emit('recaveError', { message: 'Erreur lors de la recave' });
        //     }
        socket.on('rebuy', async ({ tableId, amount }) => {
            try {
                // Trouver le joueur dans l'une des tables
                let foundPlayer = null;
                let foundTable = null;
                for (const sessionMap of pokerTables.values()) {
                    for (const pokerTable of sessionMap.values()) {
                        const player = pokerTable.players.get(socket.id);
                        if (player && String(pokerTable.tableInfo.id) === String(tableId)) {
                            foundPlayer = player;
                            foundTable = pokerTable;
                            break;
                        }
                    }
                    if (foundPlayer) break;
                }

                if (!foundPlayer || !foundTable) {
                    return socket.emit('rebuyError', { message: 'Joueur ou table introuvable' });
                }

                const rebuyAmount = Number(amount);
                if (isNaN(rebuyAmount) || rebuyAmount <= 0) {
                    return socket.emit('rebuyError', { message: 'Montant de recave invalide' });
                }

                // 1. Vérifier le solde en DB
                const solde = await Soldes.findOne({ where: { userId: foundPlayer.user.id } });
                if (!solde || Number(solde.montant) < rebuyAmount) {
                    return socket.emit('rebuyError', { message: 'Solde insuffisant' });
                }

                // Vérifier les caves sur les autres tables
                const joinedTables = playerTables.get(Number(foundPlayer.user.id)) || [];
                const playerCaves = playerCavesMap.get(Number(foundPlayer.user.id)) || [];
                let otherCaves = 0;
                for (let tid of joinedTables) {
                    if (String(tid) !== String(tableId)) {
                        const c = playerCaves.find(cave => String(cave.tableId) === String(tid));
                        if (c) otherCaves += Number(c.cave);
                    }
                }
                if (otherCaves + rebuyAmount > Number(solde.montant)) {
                    return socket.emit('rebuyError', { message: 'Solde insuffisant sur les tables actives' });
                }

                // Vérifier qu'aucune main n'est en cours
                if (foundTable.table.isHandInProgress()) {
                    return socket.emit('rebuyError', { message: 'Action impossible pendant la main' });
                }

                // 2. Mettre à jour le stack du joueur dans le moteur poker-ts
                const table = foundTable.table;
                const seatIndex = foundPlayer.seatIndex;

                try {
                    const seats = table.seats();
                    if (seats[seatIndex] !== null) {
                        table.standUp(seatIndex);
                    }
                } catch (ignored) {}

                const newStack = rebuyAmount;

                // On asseoit le joueur avec le nouveau total
                table.sitDown(seatIndex, newStack);

                // Mettre à jour le stack local du joueur et la map des caves
                foundPlayer.chips = newStack;
                foundTable.caves.set(foundPlayer.user.id, newStack);

                // 3. Mettre à jour playerCavesMap
                let playerCavesVal = playerCavesMap.get(Number(foundPlayer.user.id)) || [];
                let caveObj = playerCavesVal.find(cave => String(cave.tableId) === String(tableId));

                if (caveObj) {
                    caveObj.cave = newStack;
                } else {
                    playerCavesVal.push({
                        tableId: String(tableId),
                        cave: newStack
                    });
                }

                playerCavesMap.set(Number(foundPlayer.user.id), playerCavesVal);

                // 4. Diffusion forcée de l'état mis à jour
                foundTable.broadcastState();

                // 5. Relancer la vérification de démarrage si la table attendait des joueurs
                foundTable.checkStartConditions();

                console.log(`[REBUY] Succès: ${foundPlayer.user.name} a rebuy ${newStack} jetons.`);
            } catch (err) {
                console.error('[REBUY] ERR', err);
                socket.emit('rebuyError', { message: 'Erreur lors du rebuy' });
            }
        });
        socket.on('quit', async ({ tableId, tableSessionId, force }) => {
            try {
                const sessionMap = pokerTables.get(tableId);
                if (!sessionMap) return;
                const table = sessionMap.get(tableSessionId);
                if (!table || !table.players) return;
                const player = table.players.get(socket.id);
                if (!player) return;
                
                console.log('Exit player', player.seatIndex);

                try {
                    // Bypass quiteDate check if force is true
                    if (!force && player.quiteDate && Date.now() <= player.quiteDate.getTime() && table.seatTaken.size > 1) {
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

                            // ✅ FIX : passer socket.id pour que handleDisconnect retrouve le joueur
                            // Si le joueur a stack=0 (fin de main, pas de recave), le retirer immédiatement
                            const seatIndex = player.seatIndex;
                            const currentStack = seatIndex !== undefined ? (table.table.seats()[seatIndex]?.stack ?? 0) : 0;

                            if (currentStack === 0) {
                                // Joueur à 0 → retrait immédiat, pas de timer de reconnexion
                                console.log(`🗑️ Joueur ${player.user.id} retiré immédiatement (stack=0)`);
                                table.removePlayer(socket.id).then(() => table.broadcastState());
                            } else {
                                // Joueur avec des jetons → garder la place pour reconnexion
                                table.handleDisconnect(player.user.id, socket.id);
                            }
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
