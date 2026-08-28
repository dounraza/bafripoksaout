# Règles du Jeu : Omaha Poker (Implémentation Backend)

Cette documentation décrit les règles et les principes de logique appliqués dans l'implémentation du jeu Omaha Poker au sein de cette application.

## 1. Règle Fondamentale (Omaha)
Contrairement au Texas Hold'em, l'évaluation de la main dans cette implémentation suit strictement la règle de l'Omaha :
- **Obligation :** Le joueur **doit** utiliser exactement **2 cartes** de sa main (hole cards).
- **Obligation :** Le joueur **doit** utiliser exactement **3 cartes** du tableau (community cards).

## 2. Évaluation de la Main
L'évaluation se fait via la bibliothèque `pokersolver`. Le processus logique est le suivant :
1. **Génération de combinaisons :** 
   - Toutes les combinaisons de 2 cartes parmi les 4 cartes du joueur sont générées.
   - Toutes les combinaisons de 3 cartes parmi les cartes communes disponibles (3, 4 ou 5 selon le tour) sont générées.
2. **Combinaison totale :** Pour chaque paire de cartes de la main combinée avec un trio du board, la force de la main est évaluée.
3. **Sélection de la meilleure main :** Le système retient la main ayant le rang le plus élevé parmi toutes les combinaisons possibles.

## 3. Logique de Décision (Agent Omaha)
L'agent utilise des stratégies heuristiques basées sur l'état du jeu :

### A. Phase Pré-flop
La stratégie est basée sur un score calculé selon :
- **Paires :** Score positif pour une paire, négatif pour des mains avec 3 ou 4 cartes de même rang (sets ou quads en main sont moins désirables qu'en Hold'em).
- **Suitedness :** Score positif pour des cartes de même couleur (double-suited est très fort).
- **Cartes hautes :** Bonus pour les cartes de rang A, K, Q, J, T.

### B. Phase Post-flop
L'agent ré-évalue la main après chaque tour (Flop, Turn, River) en utilisant la fonction `solveOmahaHand`.
- **Rank >= 6 (Full House+) :** Relance agressive.
- **Rank 4-5 (Straight/Flush) :** Mise ou relance.
- **Rank 2-3 (Deux paires/Brelan) :** Jeu prudent (Call si mise modérée, Check/Fold sinon).
- **Rank < 2 :** Check ou Fold.

## 4. Tours de Mise
Les tours de mise suivent la structure classique du poker :
- **Pre-flop**
- **Flop** (3 cartes communes)
- **Turn** (4 cartes communes)
- **River** (5 cartes communes)
