const express = require("express");
const { authUser, register, forgotPassword, verifyCode, resetPassword } = require("../controllers/userController");
const router = express.Router();

router.post("/login", authUser); 
router.post("/register", register); 
router.post("/forgot-password", forgotPassword);
router.post("/verify-code", verifyCode);
router.post("/reset-password", resetPassword);

module.exports = router;
