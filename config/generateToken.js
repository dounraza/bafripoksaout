const jwt = require('jsonwebtoken');

const generateToken = (id, duration) => {
    return jwt.sign({id}, process.env.JWT_SECRET, {
        expiresIn: duration
    })
}

module.exports = generateToken;