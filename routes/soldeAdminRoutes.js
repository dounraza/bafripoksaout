const express = require("express");
const { allSolde, totalSoldes } = require("../controllers/SoldeController");
const router = express.Router();

router.get("/solde-all", allSolde);
router.get("/total-solde", totalSoldes);

module.exports = router;