const express = require("express");
const { updateUser, uploadAvatar, getAvatar } = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const router = express.Router();

router.put("/:userId", protect, updateUser);
router.get("/avatar/:userId", getAvatar);
router.post("/upload-avatar", protect, upload.single("avatar"), uploadAvatar);

module.exports = router;
