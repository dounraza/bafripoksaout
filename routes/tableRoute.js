const express = require("express");
const { findAll,findById, isUserInTable } = require("../controllers/tablesController");
const router = express.Router();

router.get("/", findAll);
router.get("/:id", findById);
router.get("/in-table/:userId", isUserInTable);

module.exports = router;