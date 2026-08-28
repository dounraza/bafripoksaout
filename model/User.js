const { DataTypes } = require('sequelize');
const sequelize = require('../config/Db');
const bcrypt = require('bcrypt');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { 
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  chips: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 1000.00,
  },
  avatar_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  mobile_money_provider: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  mobile_money_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  mobile_money_account_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  isAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  }
}, {
  tableName: 'users',
  timestamps: false,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  }
});

User.prototype.validPassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = User;