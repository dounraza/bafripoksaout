const pokerHandSolver = require('pokersolver').Hand;

/**
 * Génère toutes les combinaisons possibles de k éléments parmi un tableau arr
 */
function getCombinations(arr, k) {
    const results = [];
    function helper(start, combo) {
        if (combo.length === k) {
            results.push([...combo]);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            combo.push(arr[i]);
            helper(i + 1, combo);
            combo.pop();
        }
    }
    helper(0, []);
    return results;
}

/**
 * Évalue une main Omaha en respectant la règle stricte :
 * Exactement 2 cartes de la main et exactement 3 cartes du board.
 */
function solveOmahaHand(holeCards, communityCards) {
    const holeCombos = getCombinations(holeCards, 2);
    const boardCombos = getCombinations(communityCards, 3);
    
    let bestHand = null;

    for (const hCombo of holeCombos) {
        for (const bCombo of boardCombos) {
            const currentHand = pokerHandSolver.solve([...hCombo, ...bCombo]);
            if (!bestHand || currentHand.rank > bestHand.rank) {
                bestHand = currentHand;
            } else if (currentHand.rank === bestHand.rank) {
                // En cas d'égalité de rang, pokersolver.winners permet de trancher
                const winner = pokerHandSolver.winners([bestHand, currentHand])[0];
                bestHand = winner;
            }
        }
    }
    return bestHand;
}

module.exports = { solveOmahaHand };
