const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');

// Deprecated in favor of /api/face/verify-user
router.post('/verify-face', authenticateToken, (req, res) => {
  res.status(410).json({ status: 'error', message: 'Endpoint deprecated. Use /api/face/verify-user.' });
});

module.exports = router;