const express = require('express');
const {
  uploadProfileImage,
  uploadImages,
  deleteImage,
  setProfileImage,
  uploadChatImage
} = require('../controllers/uploadController');
const {
  uploadSingle,
  uploadMultiple,
  uploadProfileImage: uploadProfileImageMiddleware,
  handleUploadError
} = require('../utils/upload');

const router = express.Router();

// @route   POST /api/upload/profile
// @desc    Upload single profile image
// @access  Private
router.post('/profile', uploadProfileImageMiddleware, handleUploadError, uploadProfileImage);

// @route   POST /api/upload/images
// @desc    Upload multiple images for user profile
// @access  Private
router.post('/images', uploadMultiple, handleUploadError, uploadImages);

// @route   POST /api/upload/chat
// @desc    Upload image for chat
// @access  Private
router.post('/chat', uploadSingle, handleUploadError, uploadChatImage);

// @route   DELETE /api/upload/images/:imageUrl
// @desc    Delete an image from user's profile
// @access  Private
router.delete('/images/:imageUrl', deleteImage);

// @route   PUT /api/upload/profile-image
// @desc    Set a specific image as profile image
// @access  Private
router.put('/profile-image', setProfileImage);

module.exports = router;
