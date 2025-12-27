const express = require('express');
const {
  getUserChats,
  getOrCreateChat,
  getChatMessages,
  sendMessage,
  markAsRead,
  deleteChat,
  getUnreadCount,
  getQuizConsent,
  setQuizConsent,
  submitQuiz,
  acceptChatRequest,
  rejectChatRequest
} = require('../controllers/chatController');
const { validateMessage } = require('../middlewares/validation');
const { requireVerification } = require('../middlewares/auth');
const requestTimeout = require('../middlewares/timeout');

const router = express.Router();
router.use(requireVerification);

// @route   GET /api/chat
// @desc    Get user's chats
// @access  Private
router.get('/', requestTimeout(10000), getUserChats);

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

// @route   GET /api/chat/:chatId/quiz-consent
// @desc    Get quiz consent status
// @access  Private
router.get('/:chatId/quiz-consent', getQuizConsent);

// @route   POST /api/chat/:chatId/quiz-consent
// @desc    Set quiz consent
// @access  Private
router.post('/:chatId/quiz-consent', setQuizConsent);

// @route   POST /api/chat/:chatId/quiz/submit
// @desc    Submit compatibility quiz
// @access  Private
router.post('/:chatId/quiz/submit', submitQuiz);

// @route   POST /api/chat/:chatId/accept
// @desc    Accept chat request
// @access  Private
router.post('/:chatId/accept', acceptChatRequest);

// @route   POST /api/chat/:chatId/reject
// @desc    Reject chat request
// @access  Private
router.post('/:chatId/reject', rejectChatRequest);

// @route   DELETE /api/chat/:chatId
// @desc    Delete chat
// @access  Private
router.delete('/:chatId', deleteChat);

module.exports = router;
