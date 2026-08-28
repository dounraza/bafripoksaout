const express = require("express");
const router = express.Router();
const { getAllHistorique, getLastHistoriqueByTable } = require("../controllers/MainHistorique");

router.get("/all", getAllHistorique);
router.get("/table/:tableName/last", getLastHistoriqueByTable);
router.get("/last/:tableName", getLastHistoriqueByTable);
router.get("/last-history/:tableName", getLastHistoriqueByTable);

module.exports = router;
