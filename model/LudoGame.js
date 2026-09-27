const { DataTypes } = require('sequelize');
const sequelize = require('../config/Db');

const LudoGame = sequelize.define('LudoGame', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    tableId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        field: 'table_id',
    },
    sessionId: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'session_id',
    },
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'waiting',
    },
    gameState: {
        type: DataTypes.JSON,
        allowNull: false,
        field: 'game_state',
    },
    createdAt: {
        type: DataTypes.DATE,
        field: 'created_at',
    },
    updatedAt: {
        type: DataTypes.DATE,
        field: 'updated_at',
    },
}, {
    tableName: 'ludo_games',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
});

module.exports = LudoGame;
