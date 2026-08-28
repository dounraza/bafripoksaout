const express = require("express");
const { getConnectionStats } = require("../serverSocket");

const router = express.Router();

router.get('/', (req, res) => {
    res.json(getConnectionStats());
});

module.exports = router;
