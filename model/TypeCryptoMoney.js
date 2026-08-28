const { DataTypes } = require('sequelize');
const sequelize = require('../config/Db');

const TableCryptoMoney = sequelize.define('TableCryptoMoney', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  adresse: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'type_Crypto_Money',
  timestamps: true,
});

module.exports = TableCryptoMoney;