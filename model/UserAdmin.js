const { DataTypes } = require('sequelize');
const sequelize = require('../config/Db');
const bcrypt = require('bcrypt');

const UserAdmin = sequelize.define('UserAdmin', {
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
}, {
  tableName: 'usersAdmin',
  timestamps: true,
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

UserAdmin.prototype.validPassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = UserAdmin;