const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'railway',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// Tester la connexion au démarrage
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(`[MySQL] Connecté avec succès à la base de données : ${process.env.DB_NAME} (${process.env.DB_HOST}:${process.env.DB_PORT})`);
    connection.release();
  } catch (error) {
    console.error('[MySQL] Erreur de connexion à MySQL :', error.message);
  }
}

testConnection();

module.exports = pool;
