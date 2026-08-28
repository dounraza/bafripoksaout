const { DataTypes } = require('sequelize');
const sequelize = require('../config/Db');

const Envoie = sequelize.define('Envoie', {
  nom: {
    type: DataTypes.STRING,
    allowNull: false
  },
  telephone: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  type: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'envoie',
  timestamps: true,
});


module.exports = Envoie;