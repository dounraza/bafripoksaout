const express = require("express");
const { insertEnvoie,getEnvoie,updateCompte,fndAll, remove } = require("../controllers/EnvoieController");
const router = express.Router();

router.post("/compte", insertEnvoie); 
router.get("/compte", getEnvoie); 
router.get("/compte/All", fndAll); 
router.delete('/compte/remove/:id', remove);
router.put("/compte/:id", updateCompte); 

module.exports = router;