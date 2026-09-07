const { Sequelize } = require('sequelize');
const dotenv = require("dotenv");
const path = require("path");

// Charger explicitement le fichier .env situé à la racine du projet
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('Variables d\'environnement chargées:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: process.env.DB_DIALECT,
  dbName: process.env.DB_NAME
});

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: process.env.DB_DIALECT || 'mysql',
    logging: console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 60000,
      idle: 10000
    },
    dialectOptions: {
      connectTimeout: 60000
    }
  }
);

module.exports = sequelize;