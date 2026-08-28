const express = require("express");
const { insertSolde,getSolde,updateSolde } = require("../controllers/SoldeController");
const router = express.Router();

router.post("/solde/init", insertSolde); 
router.get("/solde/:id", getSolde); 
router.post("/solde/update/:id", updateSolde); 

module.exports = router;
