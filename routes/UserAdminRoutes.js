const express = require("express");
const { authUser, register } = require("../controllers/UserAdminController");
const router = express.Router();

router.post("/login", authUser); 
router.post("/register", register); 

module.exports = router;
