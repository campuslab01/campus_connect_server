const express = require('express');
const {
  getConfessions,
  getConfession,
  createConfession,
  likeConfession,
  unlikeConfession,
  addComment,
  reportConfession,
  getMyConfessions,
  deleteConfession
} = require('../controllers/confessionController');
const { validateConfession, validateComment } = require('../middlewares/validation');

const router = express.Router();

// @route   GET /api/confessions
// @desc    Get all confessions
// @access  Private
router.get('/', getConfessions);

// @route   GET /api/confessions/my
// @desc    Get user's confessions
// @access  Private
router.get('/my', getMyConfessions);

// @route   GET /api/confessions/:id
// @desc    Get confession by ID
// @access  Private
router.get('/:id', getConfession);

// @route   POST /api/confessions
// @desc    Create confession
// @access  Private
router.post('/', validateConfession, createConfession);

// @route   POST /api/confessions/:id/like
// @desc    Like confession
// @access  Private
router.post('/:id/like', likeConfession);

// @route   DELETE /api/confessions/:id/like
// @desc    Unlike confession
// @access  Private
router.delete('/:id/like', unlikeConfession);

// @route   POST /api/confessions/:id/comments
// @desc    Add comment to confession
// @access  Private
router.post('/:id/comments', validateComment, addComment);

// @route   POST /api/confessions/:id/report
// @desc    Report confession
// @access  Private
router.post('/:id/report', reportConfession);

// @route   DELETE /api/confessions/:id
// @desc    Delete confession
// @access  Private
router.delete('/:id', deleteConfession);

module.exports = router;
