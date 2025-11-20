const express = require('express');
const router = express.Router();
const { verifyFace } = require('../controllers/verifyController');
const { authenticateToken } = require('../middlewares/auth');
const upload = require('../middlewares/upload'); // Assuming a multer setup for file uploads

// Deprecated in favor of /api/face/verify-user
router.post('/verify-face', authenticateToken, upload.single('selfie'), (req, res) => {
  res.status(410).json({ status: 'error', message: 'Endpoint deprecated. Use /api/face/verify-user.' });
});

module.exports = router;