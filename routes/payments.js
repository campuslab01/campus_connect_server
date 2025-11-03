const express = require('express');
const {
  createOrder,
  verifyPayment,
  getPremiumStatus,
  handleWebhook
} = require('../controllers/paymentController');
const { authenticateToken } = require('../middlewares/auth');
const { generalLimiter } = require('../middlewares/security');

const router = express.Router();

// Webhook doesn't require authentication (but signature verification is done)
router.post('/webhook', handleWebhook);

// All other routes require authentication
router.use(authenticateToken);

// @route   GET /api/payments/premium-status
// @desc    Get current user's premium status
// @access  Private
router.get('/premium-status', generalLimiter, getPremiumStatus);

// @route   POST /api/payments/create-order
// @desc    Create Razorpay order for premium subscription
// @access  Private
router.post('/create-order', generalLimiter, createOrder);

// @route   POST /api/payments/verify
// @desc    Verify payment and activate premium
// @access  Private
router.post('/verify', generalLimiter, verifyPayment);

module.exports = router;

