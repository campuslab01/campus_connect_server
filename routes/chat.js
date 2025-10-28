const express = require('express');
const {
  getUserChats,
  getOrCreateChat,
  getChatMessages,
  sendMessage,
  markAsRead,
  deleteChat,
  getUnreadCount
} = require('../controllers/chatController');
const { validateMessage } = require('../middlewares/validation');

const router = express.Router();

// @route   GET /api/chat
// @desc    Get user's chats
// @access  Private
router.get('/', getUserChats);

// @route   GET /api/chat/unread-count
// @desc    Get unread message count
// @access  Private
router.get('/unread-count', getUnreadCount);

// @route   GET /api/chat/:userId
// @desc    Get or create chat with a user
// @access  Private
router.get('/:userId', getOrCreateChat);

// @route   GET /api/chat/:chatId/messages
// @desc    Get chat messages
// @access  Private
router.get('/:chatId/messages', getChatMessages);

// @route   POST /api/chat/:chatId/messages
// @desc    Send message
// @access  Private
router.post('/:chatId/messages', validateMessage, sendMessage);

// @route   PUT /api/chat/:chatId/read
// @desc    Mark messages as read
// @access  Private
router.put('/:chatId/read', markAsRead);

// @route   DELETE /api/chat/:chatId
// @desc    Delete chat
// @access  Private
router.delete('/:chatId', deleteChat);

module.exports = router;
