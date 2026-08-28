const { DataTypes } = require('sequelize');
const sequelize = require('../config/Db');

const Table = sequelize.define('Table', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  cave: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  smallBlind: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  bigBlind: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  gameType: {
    type: DataTypes.ENUM('holdem', 'omaha'),
    defaultValue: 'holdem',
    allowNull: false,
  },
}, {
  tableName: 'tablepoker',
  timestamps: false,
});

module.exports = Table;