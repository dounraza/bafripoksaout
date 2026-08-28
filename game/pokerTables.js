const Poker = require('poker-ts');
const crypto = require('crypto');
const Soldes = require("../model/Soldes");
const pokerHandSolver = require('pokersolver').Hand;
const disconnectedPlayers = require('../data/SharedData');
const utilCompletion = require('../data/UtilsPokerTable');
const HistoriqueMain = require('../model/HistoriqueMain');
const Table = require("../model/Table");
const playerTablesMap = require('./playerTables');
const playerCavesMap = require('./playerCaves');
const idlePlayersMap = require('./idlePlayers');
const { solveOmahaHand } = require('./omahaLogic');
const OmahaAgent = require('./omahaAgent');

class PokerTable {
    constructor(tableInfo) {
        this.players = new Map();
        this.seatTaken = new Set();
        this.maxSeats = 9;
        this.table = new Poker.Table({
            ante: 0,
            smallBlind: tableInfo.smallBlind,
            bigBlind: tableInfo.bigBlind
        });    
        this.tableInfo = tableInfo;
        this.gameType = tableInfo.gameType || 'holdem';
        this.id = crypto.randomUUID();
        this.currentRoundActions = [];
        this.foldedPlayers = new Set();
        this.activePlayers = 0;
        this.lastPots = [];
        this.autoFoldTimeout = null;
        this.holeCards = [];
        this.holeCardsToShow = [];
        this.omahaCommunityCards = null; // Store pre-dealt community cards for Omaha
        this.manualPots = [];
        this.roundIndex = 0;
        this.playerInHandInitial = new Set();
        this.lastActPlayer = null;
        this.quitImmediately = [];
        this.removedPlayers = new Map();
        this.isShowDownInProgress = false;
        
        this.caves = new Map();
        this.avatarsMaxNb = 19;
        this.avatars = [];

        this.disconnectTimers = new Map(); // Map to hold disconnect timers for each player (userId -> timeoutId)
    }

    handleDisconnect(userId, socketId) {
        try {
            if (this.disconnectTimers.has(Number(userId))) return;
            const player = this.players.get(socketId);
            const timeoutId = setTimeout(async () => {
                const idlePlayers = idlePlayersMap.get(this.tableInfo.id) || [];
                if (!idlePlayers.find(id => id !== player.user.id)) {
                    idlePlayers.push(player.user.id);
                }
                idlePlayersMap.set(this.tableInfo.id, idlePlayers);
            }, 30 * 60 * 1000); // 30 minutes
            this.disconnectTimers.set(userId, timeoutId);
        } catch (err) {
            console.error('[DISCONNECT] Error handling disconnect for user:', userId, err);
        }
    }

    handleReconnect(userId) {
        const timeoutId = this.disconnectTimers.get(userId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.disconnectTimers.delete(userId);
            let idlePlayers = idlePlayersMap.get(this.tableInfo.id) || [];
            idlePlayers = idlePlayers.filter(id => id !== userId);
            idlePlayersMap.set(this.tableInfo.id, idlePlayers);
        }
    }
    
    async endGame() {
        try {
            const table = this.table;
            const pokerTable = this;
            const tableSessionId = this.id;
            let completeCard = false;
            
            if (table.areBettingRoundsCompleted()) {
                const preShowdownStacks = table.seats().map(seat => seat?.stack ?? 0);
                let comms = table.communityCards().map(c => `${c.rank}${c.suit[0]}`);
                
                // For Omaha, use the pre-dealt cards to ensure no duplicates
                if (this.gameType === 'omaha' && this.omahaCommunityCards) {
                    if (pokerTable.countActivePlayers() > 1) {
                        comms = this.omahaCommunityCards;
                    } else {
                        comms = this.omahaCommunityCards.slice(0, comms.length);
                    }
                }
    
                if(pokerTable.countActivePlayers() > 1 && comms.length < 5) {
                    completeCard = true;
                }
                    
                const communityCard = utilCompletion.completeToFiveCards(comms, pokerTable.holeCards, completeCard);
    
                const holdeCards = pokerTable.holeCardsToShow;
                const activeHands = holdeCards.map((hole, index) => {
                    if (hole == null|| hole.length === 0) return null;
                    if(pokerTable.foldedPlayers.has(index)) return null;
    
                    let hand;
                    if (pokerTable.gameType === 'omaha') {
                        // console.log("[DEBUG] Omaha hand evaluation:", { hole, communityCard });
                        hand = solveOmahaHand(hole, communityCard);
                        if (!hand && pokerTable.countActivePlayers() === 1) {
                            hand = {
                                playerIndex: index,
                                descr: 'win',
                                rank: 0,
                                // Add placeholder methods to prevent TypeErrors
                                qualifiesHigh: () => true,
                                loseTo: () => false, // Assuming it should not lose if it's the only hand
                                compare: (otherHand) => {
                                    if (this.rank === otherHand.rank) return 0;
                                    return this.rank > otherHand.rank ? 1 : -1;
                                }
                            };
                        }
                    } else {
                        const fullCards = [...hole, ...communityCard];
                        hand = pokerHandSolver.solve(fullCards);
                    }
                    
                    if (hand) hand.playerIndex = index;
                    return hand;
                }).filter(h => h !== null);
    
                const allCards = holdeCards.map((card, index) => {
                    if(card === null || card.length === 0) return [];
                    if(pokerTable.foldedPlayers.has(index)) return [];
                    return card;
                });
    
                const pkwinners = pokerHandSolver.winners(activeHands);
                const mainWinners = pkwinners.map(w => w.playerIndex);
                 
                const {combined, orphanPots} = pokerTable.restorePots();
                const { updatedStacks, detailedWinners } = await this.distributeWinnings(preShowdownStacks, combined, activeHands, orphanPots, mainWinners);
                table.showdown();
                pokerTable.isShowDownInProgress = true;
                await pokerTable.replacePlayer(updatedStacks);
    
                const winStates = table.seats().map((seat, index) => {
                    return {
                        seat: index,
                        handName: !(pokerTable.foldedPlayers.size + 1 === pokerTable.activePlayers) ? 'Lose': 'all fold',
                        isWinner: false
                    };
                });
                
                detailedWinners.forEach((winner) => {
                    const index = winner.playerIndex;
                    winStates[index].handName = !(pokerTable.foldedPlayers.size + 1 === pokerTable.activePlayers) ? winner.descr: 'win';
                    winStates[index].isWinner = true;
                });
    
                const playerNames = Array(this.maxSeats).fill(null);
                for (const player of this.players.values()) {
                    if (player.seatIndex !== undefined) {
                        playerNames[player.seatIndex] = player.user.name;
                        const solde = await Soldes.findOne({ where: { userId: player.user.id } });
                        const cave = this.caves.get(player.user.id);
                        const stack = updatedStacks[player.seatIndex];
                        solde.montant = Number(solde.montant) - Number(cave) + Number(stack);
                        await solde.save();
                        this.caves.set(player.user.id, stack);
                    }
                }
                    
                const data = pokerTable.prepareHistoriqueMain(communityCard, pokerTable.holeCards, pokerTable.foldedPlayers, detailedWinners, playerNames);
                    
                try {
                    await HistoriqueMain.create({
                        table_name: data.table_name,
                        cartes_communaute: data.cartes_communaute,
                        main_joueurs: data.main_joueurs,
                        foldes: data.foldes,
                        gagnants: data.gagnants
                    });
                } catch (error) {
                    console.error("❌ Erreur lors de l’enregistrement de l’historique :", error);
                }
    
                const result = {
                    allCards: !(pokerTable.foldedPlayers.size + 1 === pokerTable.activePlayers) ? allCards : [],
                    winStates: winStates,
                    communityCards: communityCard
                }
                    
                pokerTable.broadcastWin(result);
                pokerTable.broadcastState();
    
                pokerTable.foldedPlayers = new Set();
                
                for(const player of pokerTable.removedPlayers.values()) {
                    this.removePlayer(player.socketio.id);
                }

                for (const player of this.players.values()) {
                    if (idlePlayersMap.get(this.tableInfo.id)?.find(id => id === player.user.id)) {
                        this.removePlayer(player.socketio.id);
                    }
                }
                
                setTimeout(() => {
                    for(const player of pokerTable.removedPlayers.values()) {
                        player.send("quitsuccess", {});
                    }
                    for (const player of this.players.values()) {
                        if (idlePlayersMap.get(this.tableInfo.id)?.find(id => id === player.user.id)) {
                            player.send('quitsuccess', {});
                        }
                    }
                    pokerTable.broadcastState();
                }, 15000);
    
                setTimeout(async () => {
                    try {
                        function sleep(ms) {
                            return new Promise(resolve => setTimeout(resolve, ms));
                        }
                        this.shareCards();
                        await sleep(5000);
                        pokerTable.startGame();   
                    } catch (err) { }
                    pokerTable.broadcastState();
                    pokerTable.isShowDownInProgress = false;
                }, 15000);
            }else {
                pokerTable.broadcastState(true);
            }
        } catch (error) {
          console.error('Error', error);
        }
    }

    shareCards() {
        for (const player of this.players.values()) {
            player.send("shareCards", {message: "share cards"});
        }
    }

    countActivePlayers() {
        return this.playerInHandInitial.size - this.foldedPlayers.size;
    }

    async distributeWinnings(preShowdownStacks, pots, activeHands, orphanPots = 0, mainWinners = []) {
        const updatedStacks = [...preShowdownStacks];
        const detailedWinners = [];
        for (const pot of pots) {
            const eligibleIndexes = pot.eligiblePlayers;
            const activeHandsOfPot = activeHands.filter(hand => eligibleIndexes.includes(hand.playerIndex));
            const potWinners = pokerHandSolver.winners(activeHandsOfPot); 
            const winnerIndexes = potWinners.map(w => w.playerIndex);

            if (winnerIndexes.length === 0 || pot.size == 0) continue;

            if(pot.eligiblePlayers.length > 1) {
                for (const winner of potWinners) {  
                    detailedWinners.push({
                        playerIndex: winner.playerIndex,
                        descr: winner.descr
                    });
                }
            }
            
            const rakeSize = pot.isRakeable ? 0.05 : 0 
            const rake = Math.floor(pot.size * rakeSize);
            const netPot = pot.size - rake;
            const amountPerReceiver = Math.floor(netPot / winnerIndexes.length);
            const remainder = netPot % winnerIndexes.length;

            for (const index of winnerIndexes) {
                updatedStacks[index] += amountPerReceiver;
            }
            if (remainder > 0) {
                updatedStacks[winnerIndexes[0]] += remainder;
            }

            if (orphanPots > 0 && mainWinners.length > 0) {
                const share = Math.floor(orphanPots / mainWinners.length);
                let remainder = orphanPots % mainWinners.length;
                for (const winnerIndex of mainWinners) {
                    updatedStacks[winnerIndex] += share;
                    if (remainder > 0) {
                        updatedStacks[winnerIndex] += 1;
                        remainder--;
                    }
                }
            }
        }
        return { updatedStacks, detailedWinners };
    }

    async playerAction(socket, playerSeats, action, bet, disconnectedPlayers) {
        try {
            const table = this.table;
            const pokerTable = this;    
            const tableSessionId = this.id;
            
            if(table.isHandInProgress()) {
                if(table.isBettingRoundInProgress()) {
                    if(table.playerToAct() !== playerSeats) {
                        if(socket != null) {
                            socket.emit('playerActionError', { message: 'not your turn' });
                        }
                        return;
                    }else {
                        if (action == 'fold') {
                            if(!pokerTable.foldedPlayers.has(playerSeats)) {
                                pokerTable.foldedPlayers.add(playerSeats);
                            }
                            pokerTable.holeCardsToShow[playerSeats] = null;
                        }    
                        table.actionTaken(action, bet);
                        pokerTable.cancelAutoFoldTimer();
                        pokerTable.currentRoundActions = pokerTable.currentRoundActions.filter(
                            action => action.playerId !== playerSeats
                        );
                        pokerTable.currentRoundActions.push({
                            playerId: playerSeats,
                            action: action,
                            amount: table.seats()[playerSeats].betSize
                        });
                    }
                    let actionTaken = false;
                    let loopSafetyCounter = 0;
                    do {
                        actionTaken = false;
                        const disconnected = disconnectedPlayers.get(tableSessionId);
                        if (disconnected) {
                            for (const [uid, p] of (disconnected.entries() || [])) {
                                const seatDisconnected = p.seatIndex;
                                const currentPlayer = this.getPlayer(seatDisconnected);
                                try {
                                    if(table.playerToAct() === Number(seatDisconnected) && currentPlayer?.user?.id === uid) {
                                        if(!pokerTable.foldedPlayers.has(seatDisconnected)) {
                                            pokerTable.foldedPlayers.add(seatDisconnected);
                                        }
                                        pokerTable.holeCardsToShow[seatDisconnected] = null;
                                        table.actionTaken('fold');
                                        actionTaken = true;
                                        pokerTable.currentRoundActions = pokerTable.currentRoundActions.filter(
                                            action => action.playerId !== seatDisconnected
                                        );
                                        pokerTable.currentRoundActions.push({
                                            playerId: seatDisconnected,
                                            action: 'fold',
                                            amount: 0
                                        });
                                    }
                                } catch (ignored) {
                                    actionTaken = false;
                                }
                            }
                        }
                        loopSafetyCounter++;
                        if (loopSafetyCounter > 10) break;
                    } while (actionTaken);
                } 
                if(!table.isBettingRoundInProgress()) {
                    if (!pokerTable.manualPots[pokerTable.roundIndex]) {
                        pokerTable.manualPots[pokerTable.roundIndex] = [];
                    }
                    const seats = table.seats() || [];
                    for (let i = 0; i < seats.length; i++) {
                        if (seats[i]) {
                            const manualPot = pokerTable.manualPots[pokerTable.roundIndex];
                            const existingEntry = manualPot.find(entry => entry.seatIndex === i);
                            if (existingEntry) {
                                existingEntry.betSize = seats[i].betSize;
                            } else {
                                manualPot.push({ seatIndex: i, betSize: seats[i].betSize });
                            }
                        }
                    }
                    pokerTable.currentRoundActions = [];
                    pokerTable.roundIndex += 1;
                    if(!table.areBettingRoundsCompleted()) {
                        table.endBettingRound();
                    }
                }
                
                if (table.areBettingRoundsCompleted()) {
                    this.endGame();
                }else {
                    pokerTable.broadcastState(true);
                }
            }
        } catch (error) {
            console.error('[PLAYER ACTION] Error', error);
        }
    }

    getFreesit() {
        return Number(this.maxSeats) - Number(this.seatTaken.size);
    }

    cleanPots(pots, foldedPlayers) {
        const cleanedPots = [];
        let orphanPotSize = 0;
        for (const pot of pots) {
            const eligiblePlayersBeforeFilter = pot.eligiblePlayers.length;
            pot.eligiblePlayers = pot.eligiblePlayers.filter(p => !foldedPlayers.includes(p));
            if (pot.eligiblePlayers.length === 0) {
                orphanPotSize += pot.size;
            } else {
                pot.isRakeable = eligiblePlayersBeforeFilter > 1;
                cleanedPots.push(pot);
            }
        }
        return {cleanedPots, orphanPotSize};
    }

    restorePots() {
        const allRoundPots = [];
        let orphanPots = 0;
        for (let roundIndex = 0; roundIndex < this.manualPots.length; roundIndex++) {
            const roundBets = this.manualPots[roundIndex];
            if (!roundBets || roundBets.length === 0) {
                allRoundPots.push([]);
                continue;
            }
            const totalBetsBySeat = new Map();
            for (const { seatIndex, betSize } of roundBets) {
                if (betSize > 0) {
                    totalBetsBySeat.set(seatIndex, (totalBetsBySeat.get(seatIndex) || 0) + betSize);
                }
            }
            let seatStacks = Array.from(totalBetsBySeat.entries())
                .map(([seatIndex, amount]) => ({ seatIndex, remaining: amount }));
            const pots = [];
            while (seatStacks.length > 0) {
                const minBet = Math.min(...seatStacks.map(s => s.remaining));
                const eligible = seatStacks.map(s => s.seatIndex);
                const potSize = minBet * eligible.length;
                pots.push({
                    size: potSize,
                    eligiblePlayers: [...eligible]
                });
                seatStacks = seatStacks
                    .map(s => ({ seatIndex: s.seatIndex, remaining: s.remaining - minBet }))
                    .filter(s => s.remaining > 0);
            }
            const {cleanedPots, orphanPotSize} = this.cleanPots(pots, Array.from(this.foldedPlayers.values()));
            orphanPots += orphanPotSize; 
            allRoundPots.push(cleanedPots);
        }
        const combined = allRoundPots.flat();
        return {combined, orphanPots};
    }

    mergeAndSortPotsByRound(flatedPots, orphanPots) {
        const sorted = [...flatedPots].sort((a, b) => b.eligiblePlayers.length - a.eligiblePlayers.length);
        const groupedMap = new Map();
        for (const pot of sorted) {
            if (pot.eligiblePlayers.length <= 1) continue;
            const key = pot.eligiblePlayers.slice().sort((a, b) => a - b).join(',');
            if (groupedMap.has(key)) {
                groupedMap.get(key).size += pot.size;
            } else {
                groupedMap.set(key, { ...pot, eligiblePlayers: [...pot.eligiblePlayers] });
            }
        }
        const result = Array.from(groupedMap.values());
        if (orphanPots > 0) {
            result.push({ size: orphanPots, eligiblePlayers: [] });
        }
        return result;
    }

    async replacePlayer(stacks) {
        for (const player of this.players.values()) {
            if (player.seatIndex != undefined) {
                try {
                    const seats = this.table.seats();
                    if (seats[player.seatIndex] !== null) {
                        this.table.standUp(player.seatIndex);  
                    }
                    const stack = stacks[player.seatIndex];
                    if(stack && stack > 0) {
                        this.table.sitDown(player.seatIndex, stack);
                    } else {
                        this.removedPlayers.set(player.seatIndex, player);
                    }
                } catch (err) {
                    console.error('[REPLACE PLAYER] ERR seat', player.seatIndex, err);
                    await this.removePlayer(player.socketio.id);
                }
            }
        }
    }

    prepareHistoriqueMain(communityCards, holeCards, foldedPlayers, mainWinners, playerNames) {
        const table_name = this.tableInfo?.name ?? '-';
        const main_joueurs = [];
        for (let i = 0; i < playerNames.length; i++) {
            const pseudo = playerNames[i];
            const cartes = holeCards[i];
            if (pseudo && Array.isArray(cartes) && cartes.length > 0) {
                main_joueurs.push({ pseudo, cards: cartes });
            }
        }
        const foldes = [];
        const foldedIdxs = foldedPlayers instanceof Set ? Array.from(foldedPlayers) : (Array.isArray(foldedPlayers) ? foldedPlayers : []);
        for (const idx of foldedIdxs) {
            if (playerNames[idx]) foldes.push(playerNames[idx]);
        }
        const gagnants = [];
        if (Array.isArray(mainWinners)) {
            for (const idx of mainWinners) {
                const playerName = playerNames[idx.playerIndex] || playerNames[idx];
                if (playerName && !gagnants.includes(playerName)) {
                    gagnants.push(playerName);
                }
            }
        }
        if (gagnants.length === 0) {
            for (const pseudo of playerNames) {
                if (pseudo && !foldes.includes(pseudo)) {
                    gagnants.push(pseudo);
                    break;
                }
            }
        }
        return { table_name, cartes_communaute: communityCards, main_joueurs, foldes, gagnants };
    }

    async checkStartConditions() {
        if (!this.table.isHandInProgress() && !this.isShowDownInProgress && this.seatTaken.size >= 2) {
            await this.startGame();
        }
        try {
            this.broadcastState();
        } catch (error) {
            console.error(error);
        }
    }

    async startGame() {
        // Double-check to prevent starting with < 2 players
        if (this.seatTaken.size < 2) {
            console.warn(`[TABLE ${this.tableInfo.id}] Cannot start hand: only ${this.seatTaken.size} players seated.`);
            return;
        }

        try {
            const latestTable = await Table.findByPk(this.tableInfo.id);
            if (latestTable) {
                this.gameType = latestTable.gameType;
                this.tableInfo = latestTable.get({ plain: true });
            }
        } catch (err) {
            console.error("Error refreshing table gameType:", err);
        }

        // console.log(`[DEBUG] Starting Game - Type: ${this.gameType}`);
        this.foldedPlayers = new Set();
        this.table.startHand();
        this.activePlayers = this.table.numActivePlayers();
        this.lastPots = [];
        this.manualPots = [];
        this.roundIndex = 0;
        if(!this.manualPots[this.roundIndex]) {
            this.manualPots[this.roundIndex] = [];
        }

        const seats = this.table.seats() || [];
        for(let i = 0; i < seats.length; i++) {
            if(seats[i]) {
                this.manualPots[this.roundIndex].push({seatIndex: i, betSize: seats[i].betSize});
            }
        }
        
        for(const player of this.removedPlayers.values()) {
            this.removePlayer(player.socketio.id);
            player.send("quitsuccess", {});
        }
        this.removedPlayers.clear();

        this.playerInHandInitial = new Set();
        const playersInHand = this.table.handPlayers();
        for (let i = 0; i < playersInHand.length; i++) {
            if (playersInHand[i]) {
                this.playerInHandInitial.add(i);
            }
        }

        const hands = this.table.holeCards();

        if (this.gameType === 'omaha') {
            // console.log("[DEBUG] Omaha mode: Taking full control of card distribution.");
            const ALL_CARDS = [
                '2c', '2d', '2h', '2s', '3c', '3d', '3h', '3s', '4c', '4d', '4h', '4s',
                '5c', '5d', '5h', '5s', '6c', '6d', '6h', '6s', '7c', '7d', '7h', '7s',
                '8c', '8d', '8h', '8s', '9c', '9d', '9h', '9s', 'Tc', 'Td', 'Th', 'Ts',
                'Jc', 'Jd', 'Jh', 'Js', 'Qc', 'Qd', 'Qh', 'Qs', 'Kc', 'Kd', 'Kh', 'Ks',
                'Ac', 'Ad', 'Ah', 'As'
            ];
            
            let deck = [...ALL_CARDS];
            for (let i = deck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }

            this.holeCards = Array(this.maxSeats).fill(null);
            this.holeCardsToShow = Array(this.maxSeats).fill(null);

            for (let i = 0; i < this.maxSeats; i++) {
                if (this.playerInHandInitial.has(i)) {
                    const cards = deck.splice(0, 4);
                    this.holeCards[i] = cards;
                    this.holeCardsToShow[i] = cards;
                } else {
                    this.holeCards[i] = [];
                    this.holeCardsToShow[i] = [];
                }
            }
            // Pre-deal Omaha community cards to avoid duplicates
            this.omahaCommunityCards = deck.splice(0, 5);
            // console.log("[DEBUG] Omaha community cards pre-dealt:", this.omahaCommunityCards);
        } else {
            this.omahaCommunityCards = null;
            if (hands?.length > 0) {
                const holesCardsPlayer = hands.map(hand => 
                    Array.isArray(hand) ? hand.map(c => `${c.rank}${c.suit?.[0] ?? '?'}`) : []
                );
                this.holeCards = [...holesCardsPlayer];
                this.holeCardsToShow = [...holesCardsPlayer];
            }
        }
        this.broadcastStart();
        this.broadcastState(true);
    }    

    hasSeatAvailable() {
        return this.seatTaken.size < this.maxSeats;
    }
    
    getAvailableSeatIndex() {
        for (let i = 0; i < this.maxSeats; i++) {
            if (!this.seatTaken.has(i)) return i;
        }
        return null;
    }
    
    addPlayer(player, seatPlayer) {
        try {
            let seatIndex = null;
            if (seatPlayer !== null && seatPlayer !== undefined) {
                if (seatPlayer >= 0 && seatPlayer < this.maxSeats && !this.seatTaken.has(seatPlayer)) {
                    seatIndex = seatPlayer;
                } else {
                    return false;
                }
            } else {
                seatIndex = this.getAvailableSeatIndex();
            }

            if (seatIndex === null) return false;
            
            const avatar = `${Math.floor(Math.random() * this.avatarsMaxNb)}.png`;
            const existingAvatar = this.avatars.find(avt => avt.userId === player.user.id); 
            if (existingAvatar) {
                existingAvatar.avatar = avatar;
            } else {
                this.avatars.push({ userId: player.user.id, avatar });
            }

            this.table.sitDown(seatIndex, player.chips);
            this.players.set(player.socketio.id, player);
            player.seatIndex = seatIndex;
            this.seatTaken.add(seatIndex);
            this.checkStartConditions();
            this.caves.set(player.user.id, player.chips);

            let playerCavesVal = playerCavesMap.get(player.user.id) || [];
            let caveObj = playerCavesVal.find(cave => cave.tableId === this.tableInfo.id);
            if (caveObj) {
                caveObj.cave = player.chips;
            } else {
                playerCavesVal.push({ tableId: this.tableInfo.id, cave: player.chips });
            }
            playerCavesMap.set(player.user.id, playerCavesVal);
            return true;
        }catch(err) {
            console.error('[ADD PLAYER] ERR', err);
            return false;
        }
    }

    async removePlayer(socketId) {
        try {
            const player = this.players.get(socketId);
            if (!player) return false;
            const seatIndex = player.seatIndex;
            this.seatTaken.delete(seatIndex);
            this.players.delete(socketId);
            
            let playerTables = playerTablesMap.get(player.user.id) ?? [];
            playerTables = playerTables.filter(table => Number(table) !== Number(this.tableInfo.id));
            playerTablesMap.set(player.user.id, playerTables);
           
            this.table.standUp(seatIndex);
            this.avatars = this.avatars.filter(avt => avt.userId !== player.user.id);
            playerCavesMap.delete(player.user.id);
            return true;
        }catch (err) {
            console.error('[REMOVE PLAYER] ERR', err);
        }
    }

    getPlayer(seatindex) {
        for(const player of this.players.values()) {
            if(Number(player.seatIndex) === Number(seatindex)) {
                return player;
            }
        }
        return null;
    }

    startAutoFoldTimer(expectedToAct) {
        if (this.autoFoldTimeout) clearTimeout(this.autoFoldTimeout);
        if (this.table.isHandInProgress()) {
            const toAct = this.table.playerToAct();
            if (expectedToAct !== toAct) return;
            this.autoFoldTimeout = setTimeout(async () => {
                try {
                    const stillToAct = this.table.playerToAct();
                    if (toAct === stillToAct) {
                        const player = this.getPlayer(stillToAct);
                        const action = this.table.legalActions().actions.includes('check') ? 'check' : 'fold';
                        await this.playerAction(player?.socketio ?? null, stillToAct, action, 0, disconnectedPlayers);
                    }
                } catch (error) {
                    console.error('[AUTOFOLD TIMER] ERR', error);
                }
            }, 12000);
        }
    }

    cancelAutoFoldTimer() {
        if (this.autoFoldTimeout) {
            clearTimeout(this.autoFoldTimeout);
            this.autoFoldTimeout = null;
        }
    }

    isPlayerInHand(seatIndex) {
        if(!this.table.isHandInProgress()) return false;
        return this.playerInHandInitial.has(seatIndex) && !this.foldedPlayers.has(seatIndex);
    }

    getActiveSeats() {
        const activeSeats = [];
        for (let i = 0; i < this.maxSeats; i++) {
            if (this.isPlayerInHand(i)) activeSeats.push(i);
        }
        return activeSeats;
    }

    broadcastWin(data) {
        for (const player of this.players.values()) {
            player.send("win", data);
        }
    }

    broadcastStart() {
        for (const player of this.players.values()) {
            player.send("start", {message: "started"});
        }
    }

    addAgent(chips = 1000) {
        const seatIndex = this.getAvailableSeatIndex();
        if (seatIndex === null) return false;
        const agentUser = { id: -1 - seatIndex, name: `Agent_${seatIndex}`, chips };
        const agent = new OmahaAgent(agentUser, chips);
        agent.seatIndex = seatIndex;
        this.table.sitDown(seatIndex, chips);
        this.players.set(`agent_${seatIndex}`, agent);
        this.seatTaken.add(seatIndex);
        this.caves.set(agentUser.id, chips);
        this.avatars.push({ userId: agentUser.id, avatar: `0.png` });
        this.checkStartConditions();
        return true;
    }

    async triggerAgentAction(seatIndex) {
        const agent = this.getPlayer(seatIndex);
        if (!agent || !agent.isAgent) return;
        setTimeout(async () => {
            const decision = agent.decideAction(this);
            await this.playerAction(null, seatIndex, decision.action, decision.bet, disconnectedPlayers);
            this.broadcastState();
        }, 2000);
    }

    broadcastState(isStart = false) {
        const activeSeats = this.getActiveSeats();
        const handInProgress = this.table.isHandInProgress();
        const tableId = this.id;
        const button = handInProgress ? this.table.button() : null;
        
        let communityCards = [];
        if (handInProgress) {
            if (this.gameType === 'omaha' && this.omahaCommunityCards) {
                const round = this.table.roundOfBetting();
                if (round === 'flop') communityCards = this.omahaCommunityCards.slice(0, 3);
                else if (round === 'turn') communityCards = this.omahaCommunityCards.slice(0, 4);
                else if (round === 'river') communityCards = this.omahaCommunityCards.slice(0, 5);
                else communityCards = [];
            } else {
                communityCards = this.table.communityCards().map(c => `${c.rank}${c.suit[0]}`);
            }
        }

        const {combined, orphanPots} = this.restorePots();
        let pots = this.roundIndex !== 0 ? this.mergeAndSortPotsByRound(combined, orphanPots) : [{size:0}];
        if (handInProgress && pots.length > 0) this.lastPots = pots;

        let toAct = null;
        if (handInProgress) {
            if(!this.table.isBettingRoundInProgress() && !this.table.areBettingRoundsCompleted()) {
                try { this.table.endBettingRound(); } catch(ignored) {}
            }
            if(this.table.isBettingRoundInProgress()) {
                toAct = this.table.playerToAct();
            } else if (this.table.areBettingRoundsCompleted()) {
                return this.endGame();
            }
        }
        
        const step = handInProgress ? this.table.roundOfBetting() : null;
        const playerNames = Array(this.maxSeats).fill(null);
        const playerIds = Array(this.maxSeats).fill(null);
        for (const player of this.players.values()) {
            if (player.seatIndex !== undefined) {
                playerNames[player.seatIndex] = player.user.name;
                playerIds[player.seatIndex] = player.user.id;
            }
        }

        for (const player of this.players.values()) {
            try {
                const seatIndex = player.seatIndex;
                const data = {
                    tableId,
                    gameType: this.gameType,
                    seat: seatIndex,
                    deal_btn: button,
                    handInProgress,
                    step,
                    toAct,
                    communityCards,
                    seats: this.table.seats(),
                    activeSeats,
                    playerNames,
                    playerIds,
                    actions: this.currentRoundActions,
                    playerCards: this.holeCards[seatIndex],
                    legalActions: handInProgress && seatIndex === toAct ? this.table.legalActions() : [],
                    pots,
                    avatars: this.avatars,
                };
                player.send('tableState', data);
                if(isStart && toAct !== null && toAct !== undefined) this.startAutoFoldTimer(toAct);
            } catch (error) {
                console.error(`Erreur d'envoi à ${player.user?.name || 'unknown'} :`, error);
            }
        }
    }
}

module.exports = PokerTable;