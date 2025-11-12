const express = require('express');
const router = express.Router();
const { verifyFace } = require('../controllers/verifyController');
const { authenticateToken } = require('../middlewares/auth');
const upload = require('../middlewares/upload'); // Assuming a multer setup for file uploads

router.post('/verify-face', authenticateToken, upload.single('selfie'), verifyFace);

module.exports = router;