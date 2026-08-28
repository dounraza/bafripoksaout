const express = require("express");
const { depot, findByPseudo, findByEtat, findAll, transaction, findAllDesc } = require("../controllers/DepotCryptoMoneyController");
const router = express.Router();

router.post("/crypto-money", depot); 
router.get("/crypto-money", findAll); 
router.get("/crypto-money/desc", findAllDesc); 
router.get("/crypto-money/:pseudo", findByPseudo); 
router.get("/crypto-money/etat/:etat", findByEtat); 
router.post("/crypto-money/transaction/:id", transaction); 

module.exports = router;
