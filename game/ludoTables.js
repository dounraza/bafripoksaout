const crypto = require('crypto');
const LudoPlayer = require('./ludoPlayers');
const playerTablesMap = require('./playerTables');

class LudoTable {
    constructor(tableInfo) {
        this.id = crypto.randomUUID();
        this.tableInfo = tableInfo;
        this.players = new Map();
        // Une table reste limitée à 2 joueurs, mais les couleurs peuvent
        // correspondre à n'importe quelle position du plateau.
        this.seats = new Array(4).fill(null);
        // Le Ludo à 2 joueurs utilise les bases verte et bleue.
        this.colors = ['green', 'yellow', 'blue', 'red'];
        this.maxSeats = 2;
        this.gameStarted = false;
        this.activeColor = null;
        this.minPlayers = 2;
        this.consecutiveSixes = Object.fromEntries(this.colors.map(color => [color, 0]));
        this.lastDiceByColor = Object.fromEntries(this.colors.map(color => [color, null]));
        this.moveHistory = [];
        const configuredRake = Number(process.env.LUDO_RAKE_RATE ?? 0.10);
        this.rakeRate = Number.isFinite(configuredRake)
            ? Math.min(1, Math.max(0, configuredRake))
            : 0.10;
        this.settled = false;
        this.settling = false;
        this.winnerId = null;
        this.onWinner = null;
        this.onSoloQuit = null;
        this.persistState = null;
        this.clearPersistentState = null;
    }

    getPairedColor(color) {
        return { green: 'blue', blue: 'green', yellow: 'red', red: 'yellow' }[color] || null;
    }

    getFreesit() {
        return this.maxSeats - this.seats.filter(Boolean).length;
    }

    getPersistentState() {
        return {
            tableId: this.tableInfo.id,
            sessionId: this.id,
            seats: this.seats,
            activeColor: this.activeColor,
            gameStarted: this.gameStarted,
            consecutiveSixes: this.consecutiveSixes,
            lastDiceByColor: this.lastDiceByColor,
            moveHistory: this.moveHistory,
            settled: this.settled,
            winnerId: this.winnerId,
        };
    }

    async savePersistentState() {
        if (typeof this.persistState === 'function') {
            await this.persistState(this.getPersistentState());
        }
    }

    async deletePersistentState() {
        if (typeof this.clearPersistentState === 'function') {
            await this.clearPersistentState(this.tableInfo.id);
        }
    }

    restorePersistentState(state = {}) {
        if (state.sessionId) this.id = state.sessionId;
        if (Array.isArray(state.seats)) this.seats = state.seats;
        this.activeColor = state.activeColor || null;
        this.gameStarted = state.gameStarted === true;
        this.consecutiveSixes = state.consecutiveSixes || this.consecutiveSixes;
        this.lastDiceByColor = state.lastDiceByColor || this.lastDiceByColor;
        this.moveHistory = Array.isArray(state.moveHistory) ? state.moveHistory : [];
        this.settled = state.settled === true;
        this.winnerId = state.winnerId ? Number(state.winnerId) : null;

        // Une manche terminée ne doit jamais réafficher l'ancien plateau.
        // On conserve les sièges pour permettre au gagnant d'attendre un
        // nouvel adversaire, mais on efface l'état visuel de la manche finie.
        if (this.settled) {
            this.activeColor = null;
            this.gameStarted = false;
            this.consecutiveSixes = Object.fromEntries(this.colors.map(color => [color, 0]));
            this.lastDiceByColor = Object.fromEntries(this.colors.map(color => [color, null]));
            this.moveHistory = [];
        }
    }

    restorePlayer(socket, user) {
        const seat = this.seats.find((currentSeat) => (
            currentSeat && Number(currentSeat.userId) === Number(user.id)
        ));
        if (!seat) return null;

        const player = new LudoPlayer(socket, user, seat.cave, seat.color);
        this.players.set(socket.id, player);
        playerTablesMap.set(Number(user.id), [
            ...(playerTablesMap.get(Number(user.id)) || []),
            this.tableInfo.id,
        ]);
        return { success: true, color: seat.color, restored: true };
    }

    addPlayer(socket, user, cave, preferredColor = null) {
        if (this.seats.filter(Boolean).length >= this.maxSeats) return { error: "Table pleine" };

        // Une nouvelle partie peut réutiliser la même session après un abandon
        // ou une victoire. Réinitialiser l'état de règlement avant le prochain duel.
        if (this.settled && this.seats.filter(Boolean).length === 1) {
            this.settled = false;
            this.settling = false;
            this.winnerId = null;
            this.moveHistory = [];
            this.consecutiveSixes = Object.fromEntries(this.colors.map(color => [color, 0]));
            this.lastDiceByColor = Object.fromEntries(this.colors.map(color => [color, null]));
            for (const currentPlayer of this.players.values()) {
                currentPlayer.socketio.emit('ludoGameReset');
            }
        }

        if (this.seats.filter(Boolean).length === 1) {
            const firstPlayer = this.players.values().next().value;
            const firstSeat = this.seats.find(Boolean);
            const requiredColor = this.getPairedColor(firstPlayer?.color || firstSeat?.color);
            if (preferredColor && preferredColor !== requiredColor) {
                return { error: `Cette partie exige la couleur ${requiredColor}.` };
            }
            preferredColor = requiredColor;
        }

        const requestedIndex = this.colors.indexOf(preferredColor);
        const requestedSeatFree = requestedIndex >= 0 && this.seats[requestedIndex] === null;
        if (preferredColor && !requestedSeatFree) return { error: "Cette couleur est déjà prise" };

        const seatIndex = requestedSeatFree
            ? requestedIndex
            : this.seats.findIndex(s => s === null);
        const color = this.colors[seatIndex];

        const player = new LudoPlayer(socket, user, cave, color);
        this.players.set(socket.id, player);
        this.seats[seatIndex] = { userId: user.id, name: user.name, cave: cave, color: color };

        playerTablesMap.set(Number(user.id), [...(playerTablesMap.get(Number(user.id)) || []), this.tableInfo.id]);

        if (!this.gameStarted && this.seats.filter(Boolean).length >= this.minPlayers) {
            this.gameStarted = true;
            // Forcer le démarrage sur vert
            this.activeColor = this.seats.find(Boolean)?.color || null;
        }
        this.broadcastState();
        return { success: true, color };
    }

    removePlayer(socketId, persist = true) {
        const player = this.players.get(socketId);
        if (player) {
            const seatIndex = this.seats.findIndex(s => s && s.userId === player.user.id);
            if (seatIndex !== -1) this.seats[seatIndex] = null;
            this.players.delete(socketId);
            if (this.players.size < 2) this.gameStarted = false;
            this.broadcastState();
            if (persist) this.savePersistentState().catch(() => {});
        }
    }

    async ludoAction(socket, action, data) {
        const player = this.players.get(socket.id);
        if (!player) throw new Error('Joueur introuvable');
        if (action === 'resetGame') {
            this.moveHistory = [];
            this.consecutiveSixes = Object.fromEntries(this.colors.map(color => [color, 0]));
            this.lastDiceByColor = Object.fromEntries(this.colors.map(color => [color, null]));
            this.activeColor = this.seats.find(Boolean)?.color || null;
            for (const currentPlayer of this.players.values()) {
                currentPlayer.socketio.emit('ludoGameReset');
            }
            this.broadcastState();
            await this.savePersistentState();
            return;
        }
        if (action === 'resetAfterWinner') {
            if (!this.settled || this.settling || (this.winnerId && Number(player.user.id) !== this.winnerId)) return;
            this.moveHistory = [];
            this.consecutiveSixes = Object.fromEntries(this.colors.map(color => [color, 0]));
            this.lastDiceByColor = Object.fromEntries(this.colors.map(color => [color, null]));
            this.activeColor = null;
            this.gameStarted = false;
            for (const currentPlayer of this.players.values()) {
                currentPlayer.socketio.emit('ludoGameReset');
            }
            this.broadcastState();
            await this.deletePersistentState();
            return;
        }
        if (action === 'quit') {
            if (this.settled || this.settling) return;
            const remainingPlayer = [...this.players.values()].find((currentPlayer) => currentPlayer !== player);
            if (!remainingPlayer) {
                if (typeof this.onSoloQuit === 'function') {
                    await this.onSoloQuit(player);
                }
                player.socketio.emit('ludoQuitSuccess', { tableId: this.tableInfo.id });
                this.removePlayer(socket.id, false);
                await this.deletePersistentState();
                return;
            }
            if (typeof this.onWinner !== 'function') throw new Error('Règlement Ludo indisponible');

            this.settling = true;
            try {
                await this.onWinner(this, remainingPlayer);
                this.settled = true;
                this.winnerId = Number(remainingPlayer.user.id);
            } finally {
                this.settling = false;
            }
            this.removePlayer(socket.id, false);
            await this.deletePersistentState();
            return;
        }
        if (this.activeColor !== player.color) throw new Error('Ce n\'est pas votre tour');
        if (action === 'rollDice') {
            const diceValue = Math.floor(Math.random() * 6) + 1;
            if (diceValue === 6) {
                this.consecutiveSixes[player.color] += 1;
            } else {
                this.consecutiveSixes[player.color] = 0;
            }
            this.lastDiceByColor[player.color] = diceValue;
            const threeSixes = this.consecutiveSixes[player.color] >= 3;
            this.broadcastDiceResult(diceValue, player.color, this.consecutiveSixes[player.color], threeSixes);

            // Un 6 laisse le tour au même joueur pour sortir un pion, puis
            // relancer. Le troisième 6 consécutif fait passer le tour.
            if (threeSixes) {
                this.consecutiveSixes[player.color] = 0;
                this.nextTurn();
            }
            await this.savePersistentState();
        }
        if (action === 'choosePawn') {
            const color = data?.color;
            const pawnNumber = Number(data?.pawnNumber);
            if (color !== player.color || color !== this.activeColor || !Number.isInteger(pawnNumber) || pawnNumber < 1 || pawnNumber > 4) {
                throw new Error('Déplacement invalide');
            }
            const diceValue = this.lastDiceByColor[color];
            const captured = data?.captured === true;
            const finished = data?.finished === true;
            const payload = { type: 'pawnMove', color, pawnNumber, captured, finished, diceValue };
            this.moveHistory.push({ color, pawnNumber, diceValue });
            for (const otherPlayer of this.players.values()) {
                otherPlayer.socketio.emit('ludoAction', payload);
            }

            // Après un 6, le joueur garde son tour pour relancer. Sinon le
            // déplacement termine son tour.
            if (this.lastDiceByColor[color] !== 6 && !captured && !finished) {
                this.lastDiceByColor[color] = null;
                this.nextTurn();
            } else {
                // Le joueur garde le tour après une capture.
                this.activeColor = color;
                this.lastDiceByColor[color] = null;
                this.broadcastState();
            }
            await this.savePersistentState();
        }
        if (action === 'passTurn') {
            if (data?.color !== player.color || data.color !== this.activeColor) {
                throw new Error('Passage de tour invalide');
            }
            this.lastDiceByColor[player.color] = null;
            this.nextTurn();
            await this.savePersistentState();
        }
        if (action === 'declareWinner') {
            const color = data?.color;
            const finishedPawns = Number(data?.finishedPawns);
            // Regle temporaire de test : le premier pion arrivé suffit.
            if (color !== player.color || color !== this.activeColor || finishedPawns !== 4) {
                throw new Error('Victoire Ludo invalide');
            }
            if (this.settled || this.settling) return;
            if (typeof this.onWinner !== 'function') throw new Error('Règlement Ludo indisponible');
            this.settling = true;
            try {
            await this.onWinner(this, player);
            this.settled = true;
            this.winnerId = Number(player.user.id);
            } finally {
                this.settling = false;
            }
            const loser = [...this.players.values()].find(currentPlayer => currentPlayer !== player);
            if (loser) {
                this.removePlayer(loser.socketio.id, false);
            }
            await this.deletePersistentState();
        }
    }

    broadcastDiceResult(diceValue, color, consecutiveSixes, threeSixes) {
        const payload = { type: 'diceRoll', diceValue, color, consecutiveSixes, threeSixes };
        if (this.players.size > 0) {
            const firstPlayer = this.players.values().next().value;
            for (const player of this.players.values()) {
                player.socketio.emit('ludoAction', payload);
            }
        }
    }

    handleReconnect(userId) {}
    handleDisconnect(userId, socketId) {}

    nextTurn() {
        if (!this.gameStarted) return;
        let currentIndex = this.colors.indexOf(this.activeColor);
        const occupiedIndices = [];
        this.seats.forEach((seat, index) => { if (seat !== null) occupiedIndices.push(index); });
        if (occupiedIndices.length === 0) return;
        const currentOccupiedIndex = occupiedIndices.indexOf(currentIndex);
        const nextOccupiedIndex = (currentOccupiedIndex + 1) % occupiedIndices.length;
        this.activeColor = this.colors[occupiedIndices[nextOccupiedIndex]];
        this.broadcastState();
    }

    broadcastState() {
        const occupiedSeats = this.seats.filter(Boolean);
        const activeSeatExists = occupiedSeats.some(seat => seat.color === this.activeColor);
        if (!this.settled && occupiedSeats.length >= this.minPlayers && (!this.gameStarted || !activeSeatExists)) {
            this.gameStarted = true;
            this.activeColor = occupiedSeats[0].color;
        }
        const totalCave = this.seats.reduce((total, seat) => total + Number(seat?.cave || 0), 0);
        const rakeAmount = Math.floor(totalCave * this.rakeRate);
        const state = {
            tableId: this.tableInfo.id,
            tableSessionId: this.id,
            seats: this.seats,
            playersCount: this.players.size,
            gameStarted: this.gameStarted,
            activeColor: this.activeColor,
            lastDiceByColor: this.lastDiceByColor,
            consecutiveSixes: this.consecutiveSixes,
            turnOrder: this.seats.filter(Boolean).map(seat => seat.color),
            totalCave,
            rakeRate: this.rakeRate,
            rakeAmount,
            prizePool: totalCave - rakeAmount,
            moveHistory: this.moveHistory,
        };
        if (this.players.size > 0) {
            for (const player of this.players.values()) {
                player.socketio.emit('ludoState', { ...state, yourColor: player.color });
            }
        }
    }
}
module.exports = LudoTable;
