const { DataTypes } = require('sequelize');
const sequelize = require('../config/Db'); 

const HistoriqueMain = sequelize.define('HistoriqueMain', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  datetime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  table_name: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  cartes_communaute: {
    type: DataTypes.JSON,
    allowNull: false
  },
  main_joueurs: {
    type: DataTypes.JSON,
    allowNull: false
  },
  foldes: {
    type: DataTypes.JSON,
    allowNull: false
  },
  gagnants: {
    type: DataTypes.JSON,
    allowNull: false
  }
}, {
  tableName: 'historique_main',
  timestamps: false
});

module.exports = HistoriqueMain;
