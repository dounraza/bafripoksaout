const express = require("express");
const { findType, createType, updateType, findTypeAcrtif } = require("../controllers/TypeCryptoController");
const router = express.Router();

router.get("/type-crypto-money", findType); 
router.get("/type-crypto-money/actif", findTypeAcrtif); 
router.post("/type-crypto-money", createType); 
router.put("/type-crypto-money/:id", updateType); 

module.exports = router;
