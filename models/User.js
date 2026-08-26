const pool = require('../db');
const bcrypt = require('bcrypt');

const User = {
  // Trouver par email avec son solde depuis la table solde
  findByEmail: async (email) => {
    if (!email) return null;
    const [rows] = await pool.query(
      `SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.password, 
        COALESCE(s.montant, u.chips, 0.00) AS solde, 
        COALESCE(s.montant, u.chips, 0.00) AS chips, 
        u.avatar_url, 
        u.mobile_money_provider, 
        u.mobile_money_number, 
        u.mobile_money_account_name, 
        u.isAdmin 
      FROM users u 
      LEFT JOIN solde s ON s.userId = u.id 
      WHERE LOWER(u.email) = LOWER(?) 
      LIMIT 1`,
      [email.trim()]
    );
    return rows[0] || null;
  },

  // Trouver par pseudo (name) avec son solde depuis la table solde
  findByName: async (name) => {
    if (!name) return null;
    const [rows] = await pool.query(
      `SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.password, 
        COALESCE(s.montant, u.chips, 0.00) AS solde, 
        COALESCE(s.montant, u.chips, 0.00) AS chips, 
        u.avatar_url, 
        u.mobile_money_provider, 
        u.mobile_money_number, 
        u.mobile_money_account_name, 
        u.isAdmin 
      FROM users u 
      LEFT JOIN solde s ON s.userId = u.id 
      WHERE LOWER(u.name) = LOWER(?) 
      LIMIT 1`,
      [name.trim()]
    );
    return rows[0] || null;
  },

  // Trouver par identifiant (email OU pseudo) avec son solde
  findByEmailOrName: async (identifier) => {
    if (!identifier) return null;
    const val = identifier.trim();
    const [rows] = await pool.query(
      `SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.password, 
        COALESCE(s.montant, u.chips, 0.00) AS solde, 
        COALESCE(s.montant, u.chips, 0.00) AS chips, 
        u.avatar_url, 
        u.mobile_money_provider, 
        u.mobile_money_number, 
        u.mobile_money_account_name, 
        u.isAdmin 
      FROM users u 
      LEFT JOIN solde s ON s.userId = u.id 
      WHERE LOWER(u.email) = LOWER(?) OR LOWER(u.name) = LOWER(?) 
      LIMIT 1`,
      [val, val]
    );
    return rows[0] || null;
  },

  // Trouver par ID avec son solde depuis la table solde
  findById: async (id) => {
    if (!id) return null;
    const [rows] = await pool.query(
      `SELECT 
        u.id, 
        u.name, 
        u.email, 
        COALESCE(s.montant, u.chips, 0.00) AS solde, 
        COALESCE(s.montant, u.chips, 0.00) AS chips, 
        u.avatar_url, 
        u.mobile_money_provider, 
        u.mobile_money_number, 
        u.mobile_money_account_name, 
        u.isAdmin 
      FROM users u 
      LEFT JOIN solde s ON s.userId = u.id 
      WHERE u.id = ? 
      LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  // Récupérer uniquement le solde lié par userId
  getSolde: async (userId) => {
    if (!userId) return 0;
    const [rows] = await pool.query('SELECT montant FROM solde WHERE userId = ? LIMIT 1', [userId]);
    if (rows.length > 0) {
      return parseFloat(rows[0].montant) || 0;
    }
    // Si aucun enregistrement n'existe pour cet utilisateur, en créer un
    try {
      await pool.query('INSERT INTO solde (montant, userId) VALUES (0, ?)', [userId]);
    } catch (e) {}
    return 0;
  },

  // Mettre à jour le solde dans la table solde lié par userId
  updateSolde: async (userId, montant) => {
    if (!userId) return false;
    const [rows] = await pool.query('SELECT id FROM solde WHERE userId = ? LIMIT 1', [userId]);
    if (rows.length > 0) {
      await pool.query('UPDATE solde SET montant = ? WHERE userId = ?', [montant, userId]);
    } else {
      await pool.query('INSERT INTO solde (montant, userId) VALUES (?, ?)', [montant, userId]);
    }
    // Mettre à jour aussi chips dans users
    await pool.query('UPDATE users SET chips = ? WHERE id = ?', [montant, userId]);
    return true;
  },

  // Créer un utilisateur et initialiser sa ligne dans la table solde
  create: async ({ name, email, password, initialSolde = 1000 }) => {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, chips, isAdmin) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), hashedPassword, initialSolde, 0]
    );
    const userId = result.insertId;

    // Créer la ligne de solde liée par userId
    try {
      await pool.query(
        'INSERT INTO solde (montant, userId) VALUES (?, ?)',
        [initialSolde, userId]
      );
    } catch (err) {
      console.error('[MySQL] Erreur insertion solde :', err.message);
    }

    return {
      id: userId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      solde: initialSolde,
      chips: initialSolde,
      isAdmin: 0,
    };
  },

  // Vérifier le mot de passe (bcrypt et fallback)
  verifyPassword: async (plainPassword, hashedPassword) => {
    if (!plainPassword || !hashedPassword) return false;
    try {
      if (hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$') || hashedPassword.startsWith('$2y$')) {
        return await bcrypt.compare(plainPassword, hashedPassword);
      }
      return plainPassword === hashedPassword;
    } catch (e) {
      return plainPassword === hashedPassword;
    }
  }
};

module.exports = User;
