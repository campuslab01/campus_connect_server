const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const { normalizeUserImages } = require('../utils/imageNormalizer');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      name,
      email,
      password,
      age,
      gender,
      college,
      department,
      year,
      
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'User already exists with this email'
      });
    }

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      age,
      gender,
      college,
      department,
      year,
      emailVerificationToken: hashedVerificationToken,
      emailVerified: false
    });

    // Generate token
    const token = generateToken(user._id);

    // Remove password from response and normalize image URLs
    const publicProfile = user.getPublicProfile();
    const userResponse = normalizeUserImages(publicProfile);

    // Send verification email asynchronously (don't block response)
    setImmediate(async () => {
      try {
        const { Email, emailTemplates } = require('../utils/emailService');
        const clientUrl = process.env.CLIENT_URL || 'https://campus-connect-swart-nine.vercel.app';
        const verificationLink = `${clientUrl}/verify-email?token=${verificationToken}&userId=${user._id}`;
        
        await Email.create()
          .to(email)
          .subject('Verify Your Email - Campus Connection')
          .html(emailTemplates.verificationEmail(name, verificationLink))
          .send();
        
        console.log(`✅ Verification email sent to: ${email}`);
      } catch (emailError) {
        // Don't fail registration if email fails
        console.error('Error sending verification email:', emailError);
      }
    });

    // Send welcome notification asynchronously (don't block response)
    // Note: At this point, user might not have FCM token yet (permission popup comes after)
    // So we'll also send it when token is saved (see notificationController.js)
    setImmediate(async () => {
      try {
        const { sendWelcomeNotification } = require('../utils/pushNotification');
        await sendWelcomeNotification(user._id, user.name);
      } catch (notificationError) {
        // Don't fail registration if notification fails
        console.error('Error sending welcome notification:', notificationError);
      }
    });

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully. Please check your email to verify your account.',
      data: {
        user: userResponse,
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    if (!req.body) {
      return res.status(400).json({ status: 'error', message: 'Request body missing' });
    }
    const { email, password } = req.body;


    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password are required' });
    }

    // Removed temporary hardcoded dev user bypass; all logins go through DB

    // Validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }

    const token = generateToken(user._id);
    const publicProfile = user.getPublicProfile();
    const userResponse = normalizeUserImages(publicProfile);

    res.status(200).json({ status: 'success', message: 'Login successful', data: { user: userResponse, token } });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const publicProfile = user.getPublicProfile();
    const normalizedUser = normalizeUserImages(publicProfile);
    
    res.status(200).json({
      status: 'success',
      data: {
        user: normalizedUser
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res, next) => {
  try {
    const {
      name,
      age,
      bio,
      interests,
      lookingFor,
      relationshipStatus,
      showAge,
      showCollege,
      showDepartment
    } = req.body;

    const updateData = {};
    
    if (name) updateData.name = name;
    if (age) updateData.age = age;
    if (bio !== undefined) updateData.bio = bio;
    if (interests) updateData.interests = interests;
    if (lookingFor) updateData.lookingFor = lookingFor;
    if (relationshipStatus) updateData.relationshipStatus = relationshipStatus;
    if (showAge !== undefined) updateData.showAge = showAge;
    if (showCollege !== undefined) updateData.showCollege = showCollege;
    if (showDepartment !== undefined) updateData.showDepartment = showDepartment;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    );

    const publicProfile = user.getPublicProfile();
    const normalizedUser = normalizeUserImages(publicProfile);

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        user: normalizedUser
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    // Check current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.status(200).json({
        status: 'success',
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    
    // Hash token and set to resetPasswordToken field
    user.passwordResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    // Set expire time (10 minutes)
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000;
    
    await user.save();

    // Send password reset email
    setImmediate(async () => {
      try {
        const { Email, emailTemplates } = require('../utils/emailService');
        const clientUrl = process.env.CLIENT_URL || 'https://campus-connect-swart-nine.vercel.app';
        const resetLink = `${clientUrl}/reset-password?token=${resetToken}`;
        
        await Email.create()
          .to(user.email)
          .subject('Reset Your Password - Campus Connection')
          .html(emailTemplates.passwordResetEmail(user.name, resetLink))
          .send();
        
        console.log(`✅ Password reset email sent to: ${user.email}`);
      } catch (emailError) {
        // Don't fail the request if email fails
        console.error('Error sending password reset email:', emailError);
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify email
// @route   GET /api/auth/verify-email
// @access  Public
const verifyEmail = async (req, res, next) => {
  try {
    const { token, userId } = req.query;

    if (!token || !userId) {
      return res.status(400).json({
        status: 'error',
        message: 'Token and userId are required'
      });
    }

    // Hash the token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user and verify token
    const user = await User.findOne({
      _id: userId,
      emailVerificationToken: hashedToken
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired verification token'
      });
    }

    // Verify email
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Email verified successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        status: 'error',
        message: 'Password is required'
      });
    }

    // Hash token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user by token and check if token is not expired
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Token is invalid or has expired'
      });
    }

    // Set new password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    
    await user.save();

    // Generate new token
    const newToken = generateToken(user._id);

    const publicProfile = user.getPublicProfile();
    const normalizedUser = normalizeUserImages(publicProfile);

    res.status(200).json({
      status: 'success',
      message: 'Password reset successful',
      data: {
        token: newToken,
        user: normalizedUser
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res, next) => {
  try {
    // Update last seen
    await User.findByIdAndUpdate(req.user._id, {
      lastSeen: new Date()
    });

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  verifyEmail,
  resetPassword,
  logout
};
