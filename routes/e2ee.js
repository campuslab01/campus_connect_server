const express = require('express');
const {
  savePublicKey,
  getPublicKey,
  getMyPublicKey
} = require('../controllers/e2eeController');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   PUT /api/e2ee/public-key
// @desc    Save user's E2EE public key
// @access  Private
router.put('/public-key', savePublicKey);

// @route   GET /api/e2ee/public-key
// @desc    Get current user's E2EE public key
// @access  Private
router.get('/public-key', getMyPublicKey);

// @route   GET /api/e2ee/public-key/:userId
// @desc    Get another user's E2EE public key
// @access  Private
router.get('/public-key/:userId', getPublicKey);

module.exports = router;

