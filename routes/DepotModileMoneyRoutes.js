const express = require("express");
const { depot, findByPseudo, findByEtat, findAll, transaction, findAllDesc } = require("../controllers/DepotMobileMoneyController");
const router = express.Router();

router.post("/mobile-money", depot); 
router.get("/mobile-money", findAll); 
router.get("/mobile-money/desc", findAllDesc); 
router.get("/mobile-money/:pseudo", findByPseudo); 
router.get("/mobile-money/etat/:etat", findByEtat); 
router.post("/mobile-money/transaction/:id", transaction); 

module.exports = router;
