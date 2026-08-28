const { DataTypes } = require('sequelize');
const sequelize = require('../config/Db');

const DepotMobileMoney = sequelize.define('DepotMobileMoney', {
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
  reference: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  etat: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue : false
  }
}, {
  tableName: 'depot_mobile_money',
  timestamps: true,
});

module.exports = DepotMobileMoney;