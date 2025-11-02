const express = require('express');
const { saveToken, removeToken, sendNotification } = require('../controllers/notificationController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

// @route   POST /api/notifications/token
// @desc    Save/Update FCM token
// @access  Private
router.post('/token', protect, saveToken);

// @route   DELETE /api/notifications/token/:token
// @desc    Remove FCM token
// @access  Private
router.delete('/token/:token', protect, removeToken);

// @route   POST /api/notifications/send
// @desc    Send push notification to user
// @access  Private (should be admin only in production)
router.post('/send', protect, sendNotification);

module.exports = router;
