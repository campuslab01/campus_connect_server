const express = require('express');
const {
  createPaymentRequest,
  getPremiumStatus,
  handleWebhook
} = require('../controllers/instamojoController');
const { authenticateToken } = require('../middlewares/auth');
const { generalLimiter } = require('../middlewares/security');

const router = express.Router();

// Webhook doesn't require authentication (but signature verification is done)
router.post('/webhook', handleWebhook);

// All other routes require authentication
router.use(authenticateToken);

// @route   GET /api/payment/premium-status
// @desc    Get current user's premium status (Instamojo)
// @access  Private
router.get('/premium-status', generalLimiter, getPremiumStatus);

// @route   POST /api/payment/create-payment
// @desc    Create Instamojo Payment Request for premium subscription
// @access  Private
router.post('/create-payment', generalLimiter, createPaymentRequest);

// @route   POST /api/payment/webhook
// @desc    Instamojo webhook to activate premium (MAC verified)
// @access  Private
// Instamojo uses webhooks for verification; client redirects to longurl
// Add optional endpoint for manual verification if needed

module.exports = router;

