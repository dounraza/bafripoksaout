const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'afripoks_secret_jwt_key_2026';

// Helper pour générer un JWT
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      pseudo: user.name,
      isAdmin: user.isAdmin || 0,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ----------------------------------------------------
// Inscription (Register) via MySQL + solde initial
// ----------------------------------------------------
router.post('/register', async (req, res) => {
  const { pseudo, name, email, password } = req.body;
  const username = (pseudo || name || '').trim();

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'Pseudo, email et mot de passe sont requis' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractères' });
  }

  try {
    // Vérifier si l'email existe déjà
    const existingEmail = await User.findByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'Cette adresse email est déjà enregistrée' });
    }

    // Vérifier si le pseudo existe déjà
    const existingName = await User.findByName(username);
    if (existingName) {
      return res.status(400).json({ success: false, message: 'Ce pseudo est déjà pris' });
    }

    // Créer le compte dans MySQL (crée aussi le solde initial dans la table solde)
    const newUser = await User.create({
      name: username,
      email,
      password,
      initialSolde: 1000 // Solde de bienvenue
    });

    // Générer le token JWT
    const token = generateToken(newUser);

    // Définir le cookie sécurisé
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 jours
    });

    console.log(`[Auth] Inscription : ${newUser.name} (${newUser.email}) - ID: ${newUser.id} - Solde: ${newUser.solde}`);

    res.json({
      success: true,
      message: 'Compte créé avec succès',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        pseudo: newUser.name,
        email: newUser.email,
        solde: newUser.solde,
        chips: newUser.solde,
        isAdmin: newUser.isAdmin
      }
    });
  } catch (err) {
    console.error('[Auth] Erreur lors de l inscription :', err);
    res.status(500).json({ success: false, message: 'Erreur serveur lors de l inscription', error: err.message });
  }
});

// ----------------------------------------------------
// Connexion (Login) via MySQL avec lecture du solde
// ----------------------------------------------------
router.post('/login', async (req, res) => {
  const { email, pseudo, name, identifier, login, password } = req.body;
  const ident = (email || pseudo || name || identifier || login || '').trim();

  if (!ident || !password) {
    return res.status(400).json({ success: false, message: 'Identifiant et mot de passe requis' });
  }

  try {
    // Chercher l'utilisateur par email ou pseudo (inclut le solde depuis la table solde)
    const user = await User.findByEmailOrName(ident);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }

    // Vérifier le mot de passe hashé
    const isMatch = await User.verifyPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }

    // Générer le token JWT
    const token = generateToken(user);

    // Définir le cookie d'authentification
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 jours
    });

    console.log(`[Auth] Connexion réussie : ${user.name} (ID: ${user.id}) - Solde: ${user.solde}`);

    res.json({
      success: true,
      message: 'Connexion réussie',
      token,
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
    console.error('[Auth] Erreur lors de la connexion :', err);
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la connexion', error: err.message });
  }
});

// ----------------------------------------------------
// Profil joueur connecté (Me) avec solde à jour
// ----------------------------------------------------
router.get('/me', async (req, res) => {
  let token = req.cookies.auth_token;

  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Non authentifié' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur introuvable' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        pseudo: user.name,
        email: user.email,
        solde: user.solde,
        chips: user.solde,
        avatar_url: user.avatar_url,
        mobile_money_provider: user.mobile_money_provider,
        mobile_money_number: user.mobile_money_number,
        mobile_money_account_name: user.mobile_money_account_name,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Session expirée ou invalide' });
  }
});

// ----------------------------------------------------
// Déconnexion (Logout)
// ----------------------------------------------------
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', { path: '/' });
  res.json({ success: true, message: 'Déconnexion réussie' });
});

module.exports = router;
