const User = require("../model/UserAdmin");
const asyncHandler = require("express-async-handler");
const generateToken = require('../config/generateToken');

exports.authUser = asyncHandler(async (req, res)=> {
    const {email, password} = req.body;
    
    const user = await User.findOne({ where: { email }});

    if(user && (await user.validPassword(password))) {
        res.json({
            id: user.id,
            email: user.email,
            accessToken: generateToken(user.id, '1d')
        });     
    } else {
        res.status(401).json('Invalid Email or password');
    }
})

exports.register = asyncHandler(async (req, res)=> {
    const {email, password} = req.body;

    const user = await User.create({email, password});

    if(user) {
        res.json({
            id: user.id,
            email: user.email,
            accessToken: generateToken(user.id, '1d')
        });     
    } else {
        res.status(401);
        throw new Error('Invalid Email or password');
    }
})