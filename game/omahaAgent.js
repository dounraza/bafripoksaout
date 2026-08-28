const { solveOmahaHand } = require('./omahaLogic');
const pokerHandSolver = require('pokersolver').Hand;

class OmahaAgent {
    constructor(user, chips) {
        this.user = user;
        this.chips = chips;
        this.seatIndex = undefined;
        this.isAgent = true;
    }

    /**
     * Simulation of the send method to receive updates if needed, 
     * but we'll probably call 'act' directly from the table.
     */
    send(event, data) {
        // Agents don't need to receive socket events, 
        // they are triggered by the table.
    }

    /**
     * Decides an action based on the current table state.
     * @param {Object} table - The PokerTable instance.
     * @returns {Object} { action, bet }
     */
    decideAction(table) {
        const hand = table.holeCards[this.seatIndex];
        
        let communityCards = [];
        if (table.gameType === 'omaha' && table.omahaCommunityCards) {
            const round = table.table.roundOfBetting();
            if (round === 'flop') communityCards = table.omahaCommunityCards.slice(0, 3);
            else if (round === 'turn') communityCards = table.omahaCommunityCards.slice(0, 4);
            else if (round === 'river') communityCards = table.omahaCommunityCards.slice(0, 5);
        } else {
            communityCards = table.table.communityCards().map(c => `${c.rank}${c.suit[0]}`);
        }

        const currentRound = table.table.roundOfBetting(); // 'preflop', 'flop', 'turn', 'river'
        const seat = table.table.seats()[this.seatIndex];
        const stack = seat.stack;
        const betToCall = table.table.betToCall() - seat.betSize;
        const potSize = table.table.potSize();
        
        console.log(`[AGENT ${this.seatIndex}] Thinking... Round: ${currentRound}, BetToCall: ${betToCall}, Stack: ${stack}`);

        if (currentRound === 'preflop') {
            return this.preFlopStrategy(hand, betToCall, stack, potSize);
        } else {
            return this.postFlopStrategy(hand, communityCards, currentRound, betToCall, stack, potSize);
        }
    }

    preFlopStrategy(hand, betToCall, stack, potSize) {
        // Simple Pre-flop: Play double-suited, connected, or high pairs
        const score = this.evaluatePreFlopHand(hand);
        
        if (score > 80) {
            // Very strong: Raise
            const raiseAmount = Math.max(betToCall * 3, potSize / 2);
            return { action: 'raise', bet: Math.min(raiseAmount, stack) };
        } else if (score > 40) {
            // Medium: Call or Check
            if (betToCall === 0) return { action: 'check', bet: 0 };
            if (betToCall <= stack * 0.1) return { action: 'call', bet: betToCall };
            return { action: 'fold', bet: 0 };
        } else {
            // Weak: Fold unless check
            if (betToCall === 0) return { action: 'check', bet: 0 };
            return { action: 'fold', bet: 0 };
        }
    }

    postFlopStrategy(hand, communityCards, round, betToCall, stack, potSize) {
        const bestHand = solveOmahaHand(hand, communityCards);
        const rank = bestHand.rank; // 0 to 9 usually in pokersolver
        
        console.log(`[AGENT ${this.seatIndex}] Post-flop rank: ${rank} (${bestHand.descr})`);

        // Basic strategy based on rank
        if (rank >= 4) { // Straight or better
            const betAmount = Math.max(betToCall, potSize * 0.7);
            if (betToCall > 0 && rank >= 6) { // Full house or better
                return { action: 'raise', bet: Math.min(betAmount * 2, stack) };
            }
            return { action: betToCall > 0 ? 'call' : 'bet', bet: Math.min(betAmount, stack) };
        } else if (rank >= 2) { // Two pair or Three of a kind
            if (betToCall === 0) return { action: 'bet', bet: Math.min(potSize * 0.5, stack) };
            if (betToCall <= potSize * 0.5) return { action: 'call', bet: betToCall };
            return { action: 'fold', bet: 0 };
        } else {
            // Check/Fold
            if (betToCall === 0) return { action: 'check', bet: 0 };
            return { action: 'fold', bet: 0 };
        }
    }

    evaluatePreFlopHand(hand) {
        // Simple heuristic for Omaha pre-flop
        let score = 0;
        const ranks = hand.map(c => c[0]);
        const suits = hand.map(c => c[1]);

        // Pairs
        const rankCounts = {};
        ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
        Object.values(rankCounts).forEach(count => {
            if (count === 2) score += 20;
            if (count === 3) score += 5; // Set in hand is bad in Omaha
            if (count === 4) score -= 10; // Quads in hand is terrible
        });

        // Suitedness
        const suitCounts = {};
        suits.forEach(s => suitCounts[s] = (suitCounts[s] || 0) + 1);
        Object.values(suitCounts).forEach(count => {
            if (count === 2) score += 15;
            if (count === 3) score += 5;
            if (count === 4) score -= 5; // Too many of same suit reduces outs
        });

        // High cards (A, K, Q, J, T)
        const highCards = ranks.filter(r => 'AKQJT'.includes(r)).length;
        score += highCards * 10;

        return score;
    }
}

module.exports = OmahaAgent;
