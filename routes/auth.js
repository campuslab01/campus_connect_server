const express = require('express');
const {
  registerInit,
  login,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  verifyEmail,
  resetPassword,
  // OTP-based password reset
  requestPasswordOtp,
  verifyPasswordOtp,
  updatePasswordWithOtp,
  resendPasswordOtp,
  logout,
  deleteAccount
} = require('../controllers/authController');
const { authenticateToken } = require('../middlewares/auth');
const {
  validateRegistration,
  validateLogin,
  validateProfileUpdate,
  validatePasswordChange,
  validateForgotPassword,
  validateResetPassword,
  validateRequestPasswordOtp,
  validateVerifyPasswordOtp,
  validateUpdatePasswordWithOtp,
  validateResendPasswordOtp
} = require('../middlewares/validation');
const { passwordResetLimiter } = require('../middlewares/security');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Initiate signup with OTP
// @access  Public
router.post('/register', validateRegistration, registerInit);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', validateLogin, login);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', authenticateToken, getMe);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authenticateToken, validateProfileUpdate, updateProfile);

// @route   PUT /api/auth/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', authenticateToken, validatePasswordChange, changePassword);

// @route   POST /api/auth/forgot-password
// @desc    Forgot password
// @access  Public
router.post('/forgot-password', validateForgotPassword, forgotPassword);

// @route   GET /api/auth/verify-email
// @desc    Verify email with token
// @access  Public
router.get('/verify-email', verifyEmail);

// @route   PUT /api/auth/reset-password/:token
// @desc    Reset password with token
// @access  Public
router.put('/reset-password/:token', validateResetPassword, resetPassword);

// --- OTP-based Password Reset ---
// Request OTP
router.post('/request-password-otp', passwordResetLimiter, validateRequestPasswordOtp, requestPasswordOtp);
// Verify OTP
router.post('/verify-password-otp', passwordResetLimiter, validateVerifyPasswordOtp, verifyPasswordOtp);
// Update password with OTP
router.put('/update-password-with-otp', passwordResetLimiter, validateUpdatePasswordWithOtp, updatePasswordWithOtp);
// Resend OTP
router.post('/resend-password-otp', passwordResetLimiter, validateResendPasswordOtp, resendPasswordOtp);

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', authenticateToken, logout);

// @route   DELETE /api/auth/account
// @access  Private
router.delete('/account', authenticateToken, deleteAccount);

module.exports = router;
// Signup OTP verification
router.post('/verify-signup-otp', require('../controllers/authController').verifySignupOtp);
router.post('/resend-signup-otp', require('../controllers/authController').resendSignupOtp);
