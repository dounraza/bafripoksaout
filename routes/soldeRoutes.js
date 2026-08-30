const express = require("express");
const { insertSolde,getSolde,updateSolde } = require("../controllers/SoldeController");
const router = express.Router();

router.post("/init", insertSolde); 
router.get("/:id", getSolde); 
router.post("/update/:id", updateSolde); 

module.exports = router;
