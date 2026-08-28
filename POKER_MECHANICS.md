# Règles Générales et Mécaniques Poker (Backend)

Cette documentation décrit les mécaniques de base, incluant la gestion des mises obligatoires (blinds) et des actions automatiques, implémentées dans le backend.

## 1. Mises Obligatoires (Blinds)
La structure de la table définit les montants des blinds au moment de sa création ou de sa configuration :
- **Small Blind (SB) :** Définie dans le modèle `Table.js` et passée lors de l'initialisation de `pokerTables.js`.
- **Big Blind (BB) :** Définie également dans `Table.js` et `pokerTables.js`.
- Ces valeurs sont utilisées pour initialiser les mises en début de donne.

## 2. Actions Automatiques (Auto-Check & Auto-Fold)

### A. Auto-Fold
Le système implémente une sécurité appelée "Auto-Fold Timer" pour éviter les blocages de partie si un joueur ne répond pas dans les temps.
- **Déclenchement :** Lorsqu'un joueur doit agir, une temporisation est lancée (`startAutoFoldTimer`).
- **Logique :** Si le temps imparti expire sans action du joueur :
  - Si l'option "Check" est disponible (aucun pari à suivre), le système effectue automatiquement un **Check**.
  - Sinon, le système effectue automatiquement un **Fold**.
- **Réinitialisation :** Le timer est annulé (`cancelAutoFoldTimer`) dès qu'une action valide est reçue via la socket.

### B. Gestion des Joueurs "Foldés"
Le système maintient un état `foldedPlayers` (sous forme de `Set`) pour chaque table :
- Lorsqu'un joueur effectue l'action `fold` (manuellement ou via l'auto-fold), son index est ajouté à ce `Set`.
- Ces joueurs sont exclus des calculs de pots, des évaluations de mains gagnantes et des tours de mise suivants.

## 3. Règle Fondamentale de l'Omaha
*(Rappel)*
- Le joueur **doit** utiliser exactement **2 cartes** de sa main et **3 cartes** du tableau.
