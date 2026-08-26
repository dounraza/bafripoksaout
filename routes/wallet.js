const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'afripoks_secret_jwt_key_2026';

// Récupérer le solde depuis la table solde liée par userId
router.get(['/balance', '/solde'], async (req, res) => {
  let token = req.cookies.auth_token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Non authentifié', solde: 0, balance: 0, chips: 0 });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur introuvable', solde: 0, balance: 0, chips: 0 });
    }

    const solde = await User.getSolde(user.id);
    return res.json({
      success: true,
      userId: user.id,
      solde: solde,
      balance: solde,
      chips: solde,
      user
    });
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Session invalide', solde: 0, balance: 0, chips: 0 });
  }
});

module.exports = router;
