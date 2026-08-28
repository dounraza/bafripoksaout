const { DataTypes } = require('sequelize');
const sequelize = require('../config/Db');
const TypeCryptoMoney = require('./TypeCryptoMoney');

const DepotCryptoMoney = sequelize.define('DepotCryptoMoney', {
  pseudo: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  montant: {
    type: DataTypes.FLOAT,
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
  },
  typeCryptoMoneyId: { 
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: TypeCryptoMoney,
      key: 'id',
    },
  }
}, {
  tableName: 'depot_crypto_money',
  timestamps: true,
});

DepotCryptoMoney.belongsTo(TypeCryptoMoney, {
  foreignKey: 'typeCryptoMoneyId',
  as: 'typeCryptoMoney',
});

module.exports = DepotCryptoMoney;