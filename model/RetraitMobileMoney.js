const { DataTypes } = require('sequelize');
const sequelize = require('../config/Db');

const RetraitMobileMoney = sequelize.define('RetraitMobileMoney', {
  pseudo: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  montant: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  numero: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  nom: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  etat: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue : false
  },
}, {
  tableName: 'retrait_mobile_money',
  timestamps: true,
});

module.exports = RetraitMobileMoney;