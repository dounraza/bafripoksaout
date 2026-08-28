const jwt = require("jsonwebtoken");
const User = require("../model/User");
const secretKey = process.env.JWT_SECRET;

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication error: Token missing"));
    }

    const decoded = jwt.verify(token, secretKey);

    const user = await User.findByPk(decoded.id);
    
    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    socket.user = user;    

    return next();
  } catch (error) {
    return next(new Error("Authentication error: Invalid or expired token"));
  }
};

module.exports = authenticateSocket;
