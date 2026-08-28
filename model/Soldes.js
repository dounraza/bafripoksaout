const { DataTypes } = require('sequelize');
const sequelize = require('../config/Db');
const User = require('./User');

const Soldes = sequelize.define('Soldes', {
  montant: {
    type: DataTypes.DECIMAL(20),
    allowNull: false,
  },
  userId: { 
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  }
}, {
  tableName: 'solde',
  timestamps: false,
});

Soldes.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

module.exports = Soldes;