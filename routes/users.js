const express = require('express');
const {
  searchUsers,
  getUserProfile,
  likeUser,
  unlikeUser,
  getUserLikes,
  getSuggestedUsers,
  blockUser,
  reportUser,
  registerSwipe
} = require('../controllers/userController');
const { validateSearch } = require('../middlewares/validation');

const router = express.Router();
const { requireVerification } = require('../middlewares/auth');

// @route   GET /api/users/search
// @desc    Search users with filters
// @access  Private
router.get('/search', validateSearch, searchUsers);

// @route   GET /api/users/suggestions
// @desc    Get suggested users for discover page
// @access  Private
router.get('/suggestions', getSuggestedUsers);

// @route   GET /api/users/likes
// @desc    Get user's likes, liked by, and matches
// @access  Private
router.get('/likes', requireVerification, getUserLikes);

// @route   GET /api/users/:id
// @desc    Get user profile by ID
// @access  Private
router.get('/:id', getUserProfile);

// @route   POST /api/users/:id/like
// @desc    Like a user
// @access  Private
router.post('/:id/like', requireVerification, likeUser);

// @route   DELETE /api/users/:id/like
// @desc    Unlike a user
// @access  Private
router.delete('/:id/like', requireVerification, unlikeUser);

// @route   POST /api/users/swipe
// @desc    Register a swipe attempt and enforce limits
// @access  Private
router.post('/swipe', requireVerification, registerSwipe);

// @route   POST /api/users/:id/block
// @desc    Block a user
// @access  Private
router.post('/:id/block', blockUser);

// @route   POST /api/users/:id/report
// @desc    Report a user
// @access  Private
router.post('/:id/report', reportUser);

module.exports = router;
