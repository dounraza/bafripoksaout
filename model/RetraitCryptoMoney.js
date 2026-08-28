const { DataTypes } = require('sequelize');
const sequelize = require('../config/Db');
const TypeCryptoMoney = require('./TypeCryptoMoney');

const RetraitCryptoMoney = sequelize.define('RetraitCryptoMoney', {
  pseudo: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  montant: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  adressePortefeuille: {
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
  typeCryptoMoneyId: { 
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: TypeCryptoMoney,
      key: 'id',
    },
  }
}, {
  tableName: 'retrait_crypto_money',
  timestamps: true,
});

RetraitCryptoMoney.belongsTo(TypeCryptoMoney, {
  foreignKey: 'typeCryptoMoneyId',
  as: 'typeCryptoMoney',
});

module.exports = RetraitCryptoMoney;