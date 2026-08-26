// =========================================
// AFRIPOKS - Serveur principal
// =========================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Table } = require('poker-ts');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const fs = require('fs');

const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const frontendDist = path.join(__dirname, '../frontend/dist');
const localDist = path.join(__dirname, 'dist');
const distPath = fs.existsSync(frontendDist) ? frontendDist : localDist;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Servir les fichiers statiques de l'application React
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

const jwt = require('jsonwebtoken');
const User = require('./models/User');
const JWT_SECRET = process.env.JWT_SECRET || 'afripoks_secret_jwt_key_2026';

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ success: true, message: 'Afripoks API en ligne', database: 'MySQL Railway Connecté' });
  } catch (err) {
    res.json({ success: true, message: 'Afripoks API en ligne', database_warning: err.message });
  }
});

// --- Alias pour compatibilité (/api/me, /api/session, /me) via MySQL ---
app.get(['/api/session', '/api/me', '/me', '/auth/me'], async (req, res) => {
  let token = req.cookies.auth_token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return res.status(401).json({ success: false, message: 'Non authentifié' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'Utilisateur introuvable' });

    res.json({
      success: true,
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        pseudo: user.name,
        email: user.email,
        solde: user.solde,
        chips: user.solde,
        avatar_url: user.avatar_url,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token invalide' });
  }
});

// --- Afripoks : session + compte ---
app.post(['/api/logout', '/logout'], (req, res) => {
  res.clearCookie('auth_token', { path: '/' });
  res.json({ success: true, ok: true, message: 'Déconnexion réussie' });
});

app.post('/api/account', async (req, res) => {
  let token = req.cookies.auth_token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ ok: false, message: 'Non authentifié' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    res.json({ ok: true, user });
  } catch (e) {
    res.status(401).json({ ok: false, message: 'Session invalide' });
  }
});

// Toutes les autres requêtes sont redirigées vers l'index.html de React si disponible
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'API Route not found' });
  }
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.json({ success: true, message: 'Afripoks Backend API en ligne. En développement, utilisez le frontend sur http://localhost:5173' });
});

// --- Poker Table Socket Logic ---
const pokerTable = new Table({ ante: 0, smallBlind: 20, bigBlind: 40 }, 9);
const playerSeats = new Map();
const SHOWDOWN_DELAY_MS = 6000;
const TURN_TIMEOUT_MS = 15000;
let lastShowdown = null;
let nextHandTimer = null;
let turnTimer = null;

io.on('connection', (socket) => {
  console.log('Joueur connecté:', socket.id);

  socket.on('tableMessage', (message) => {
    const player = playerSeats.get(socket.id);
    const text = String(message || '').trim().slice(0, 300);
    if (!player || !text) return;
    io.emit('tableMessage', {
      id: `${socket.id}-${Date.now()}`,
      senderId: socket.id,
      user: player.playerName,
      text,
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    });
  });

  socket.on('playerAction', (action) => {
    const seat = playerSeats.get(socket.id)?.seat;
    if (seat === undefined || !pokerTable.isHandInProgress() || !pokerTable.isBettingRoundInProgress()) {
      return;
    }

    try {
      if (pokerTable.playerToAct() !== seat) return;
      const legal = pokerTable.legalActions();
      const parsedAction = parsePlayerAction(action, legal);
      if (!parsedAction || !legal.actions.includes(parsedAction.type)) return;

      pokerTable.actionTaken(parsedAction.type, parsedAction.betSize);
      advanceGame();
      broadcastTableUpdate();
    } catch (error) {
      // Une action invalide est refusée, mais ne doit jamais arrêter le serveur.
      console.warn('Action poker refusée:', error.message);
    }
  });
socket.on('sitDown', (data) => {
  // data can be playerName (string) or { playerName, preferredSeat } (object)
  const playerName = (typeof data === 'string' ? data : data?.playerName || 'Joueur').trim().slice(0, 32);
  // L'identifiant stable évite qu'un même compte obtienne un siège par onglet.
  const rawPlayerId = typeof data === 'object' ? (data?.playerId || data?.userId || data?.email) : null;
  const playerKey = rawPlayerId
    ? `account:${String(rawPlayerId).trim().slice(0, 128)}`
    : `guest:${playerName.toLocaleLowerCase()}`;
  const preferredSeat = (typeof data === 'object' && data.preferredSeat !== undefined && data.preferredSeat !== null) ? data.preferredSeat : null;

  console.log(`[Debug] sitDown request: Player=${playerName}, PreferredSeat=${preferredSeat}`);

  if (playerSeats.has(socket.id)) {
      console.log(`[Debug] Player already seated: ${socket.id}`);
      return;
  }

  // Remplace la connexion précédente du même compte (double onglet, HMR,
  // reconnexion réseau) avant de lui donner un nouveau siège.
  const existingEntry = [...playerSeats.entries()].find(([, value]) => value.playerKey === playerKey);
  if (existingEntry) {
    const [existingSocketId] = existingEntry;
    const existingSocket = io.sockets.sockets.get(existingSocketId);
    if (existingSocket) {
      existingSocket.emit('sessionReplaced');
      existingSocket.disconnect(true);
    } else {
      removePlayer(existingSocketId);
    }
  }

  const seats = pokerTable.seats();
  console.log(`[Debug] Current seats status:`, seats.map((s, i) => (s ? `Seat ${i}: Occupied` : `Seat ${i}: Free`)));

  // Use preferred seat if provided and free, otherwise find first free
  let seat = (Number.isInteger(preferredSeat) && preferredSeat >= 0 && preferredSeat < seats.length && seats[preferredSeat] === null)
    ? preferredSeat
    : seats.findIndex((s) => s === null);

  console.log(`[Debug] Final assigned seat: ${seat}`);

  const buyInRaw = typeof data === 'object' ? (data?.buyIn || data?.cave || data?.chips) : null;
  const buyIn = (Number.isFinite(Number(buyInRaw)) && Number(buyInRaw) > 0) ? Number(buyInRaw) : 2000;

  if (seat !== -1) {
    pokerTable.sitDown(seat, buyIn);
    playerSeats.set(socket.id, { seat, playerName, playerKey, buyIn });
    console.log(`${playerName} s'assoit au siège ${seat} avec une cave de ${buyIn}`);
    socket.emit('seatAssigned', seat);
    const activeSeats = pokerTable.seats().map((s, i) => s ? i : null).filter(s => s !== null);
    if (activeSeats.length >= 2 && !pokerTable.isHandInProgress()) {
      lastShowdown = null;
      pokerTable.startHand();
    }
    broadcastTableUpdate();
  } else {
    socket.emit('tableFull');
  }
});

  socket.on('disconnect', () => {
    removePlayer(socket.id);
  });
});

function removePlayer(socketId) {
  const seatData = playerSeats.get(socketId);
  if (!seatData) return;

  const { seat, playerName } = seatData;
  playerSeats.delete(socketId);
  try {
    pokerTable.standUp(seat);
    advanceGame();
  } catch (error) {
    console.warn(`Impossible de retirer le siège ${seat}:`, error.message);
  }
  console.log(`${playerName} au siège ${seat} déconnecté.`);
  broadcastTableUpdate();
}

function broadcastTableUpdate() {
  scheduleTurnTimer();
  for (const socket of io.sockets.sockets.values()) {
    socket.emit('tableUpdate', buildTableUpdate(socket.id));
  }
}

function scheduleTurnTimer() {
  if (turnTimer) {
    clearTimeout(turnTimer);
    turnTimer = null;
  }

  if (!pokerTable.isHandInProgress() || !pokerTable.isBettingRoundInProgress()) {
    return;
  }

  let timedSeat;
  try {
    timedSeat = pokerTable.playerToAct();
  } catch (error) {
    return;
  }

  if (timedSeat === null || timedSeat === undefined) return;

  turnTimer = setTimeout(() => {
    turnTimer = null;

    try {
      if (!pokerTable.isHandInProgress() || !pokerTable.isBettingRoundInProgress()) return;
      if (pokerTable.playerToAct() !== timedSeat) return;

      const legal = pokerTable.legalActions();
      const blindSeats = getBlindSeats(pokerTable.seats(), pokerTable.button());
      const isBigBlind = blindSeats.bigBlindSeat === timedSeat;
      const autoAction = isBigBlind && legal.actions.includes('check') ? 'check' : 'fold';

      if (!legal.actions.includes(autoAction)) return;

      pokerTable.actionTaken(autoAction);
      advanceGame();
      broadcastTableUpdate();
    } catch (error) {
      console.warn('Action automatique timeout refusée:', error.message);
    }
  }, TURN_TIMEOUT_MS);
}

// poker-ts sépare la prise d'action de la transition vers la rue suivante.
// Sans cette étape, playerToAct() est appelé alors qu'aucun tour d'enchères
// n'est actif, ce qui déclenche l'AssertionError observée.
function advanceGame() {
  while (pokerTable.isHandInProgress() && !pokerTable.isBettingRoundInProgress()) {
    if (pokerTable.areBettingRoundsCompleted()) {
      const showdownCards = pokerTable.holeCards();
      const communityCards = pokerTable.communityCards();
      const pots = pokerTable.pots();
      pokerTable.showdown();
      lastShowdown = {
        holeCards: showdownCards,
        communityCards,
        pots,
        winnerSeats: [...new Set(pokerTable.winners().flatMap((pot) => pot.map(([seat]) => seat)))],
      };
      scheduleNextHand();
    } else {
      // Force transition to next round (Flop, Turn, River)
      pokerTable.endBettingRound();
    }
  }
}

function scheduleNextHand() {
  if (nextHandTimer) return;
  nextHandTimer = setTimeout(() => {
    nextHandTimer = null;
    if (pokerTable.isHandInProgress() || pokerTable.seats().filter(Boolean).length < 2) return;

    lastShowdown = null;
    pokerTable.startHand();
    broadcastTableUpdate();
  }, SHOWDOWN_DELAY_MS);
}

function buildTableUpdate(socketId) {
  const isHandInProgress = pokerTable.isHandInProgress();
  const seatNames = new Array(9).fill(null);
  for (const data of playerSeats.values()) {
    seatNames[data.seat] = data.playerName;
  }
  const blindSeats = isHandInProgress ? getBlindSeats(pokerTable.seats(), pokerTable.button()) : {};

  // Les cartes privées ne doivent être envoyées qu'à leur propriétaire.
  const holeCards = new Array(9).fill(null);
  const player = playerSeats.get(socketId);
  if (isHandInProgress && player) {
    holeCards[player.seat] = pokerTable.holeCards()[player.seat] || [];
  } else if (lastShowdown) {
    lastShowdown.holeCards.forEach((cards, seat) => {
      holeCards[seat] = cards || [];
    });
  }

  return {
    seats: pokerTable.seats(),
    seatNames,
    smallBlindSeat: blindSeats.smallBlindSeat ?? null,
    bigBlindSeat: blindSeats.bigBlindSeat ?? null,
    forcedBets: pokerTable.forcedBets(),
    holeCards,
    communityCards: isHandInProgress ? pokerTable.communityCards() : (lastShowdown?.communityCards || []),
    pots: isHandInProgress ? pokerTable.pots() : (lastShowdown?.pots || []),
    roundOfBetting: isHandInProgress ? pokerTable.roundOfBetting() : null,
    button: isHandInProgress ? pokerTable.button() : null,
    playerToAct: isHandInProgress && pokerTable.isBettingRoundInProgress()
      ? pokerTable.playerToAct()
      : null,
    legalActions: isHandInProgress && pokerTable.isBettingRoundInProgress()
      ? pokerTable.legalActions()
      : { actions: [] },
    showdown: lastShowdown ? { winnerSeats: lastShowdown.winnerSeats } : null,
  };
}

function parsePlayerAction(action, legal) {
  const raw = String(action || '').trim().toLowerCase();
  if (!raw) return null;

  const [requestedType, rawBetSize] = raw.split(':');
  const type = requestedType === 'allin' ? 'raise' : requestedType;
  if (!['fold', 'check', 'call', 'bet', 'raise'].includes(type)) return null;

  const parsedBetSize = Number(rawBetSize);
  const hasExplicitBetSize = Number.isFinite(parsedBetSize) && parsedBetSize > 0;
  if ((type === 'raise' || type === 'bet') && legal?.chipRange) {
    const min = Number(legal.chipRange.min ?? legal.chipRange._min ?? 0);
    const max = Number(legal.chipRange.max ?? legal.chipRange._max ?? 0);
    const fallback = min > 0 ? min : undefined;
    let betSize = hasExplicitBetSize ? parsedBetSize : fallback;
    if (betSize !== undefined && min > 0 && betSize < min) betSize = min;
    if (betSize !== undefined && max > 0 && betSize > max) betSize = max;
    return { type, betSize };
  }

  return { type };
}

function getBlindSeats(seats, button) {
  const occupied = seats.map((seat, index) => seat ? index : null).filter((index) => index !== null);
  if (occupied.length < 2 || button === null || button === undefined) return {};
  const nextOccupied = (from) => {
    for (let offset = 1; offset <= seats.length; offset += 1) {
      const index = (from + offset) % seats.length;
      if (seats[index]) return index;
    }
    return null;
  };
  // En heads-up, le bouton est aussi le small blind. À 3 joueurs ou plus,
  // le small blind est le siège immédiatement après le bouton.
  const smallBlindSeat = occupied.length === 2 ? button : nextOccupied(button);
  const bigBlindSeat = smallBlindSeat === null ? null : nextOccupied(smallBlindSeat);
  return { smallBlindSeat, bigBlindSeat };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur Afripoks démarré sur le port ${PORT}`);
});
