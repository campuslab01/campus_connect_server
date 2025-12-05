const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const { Email, emailTemplates } = require('../utils/emailService');
const { validationResult } = require('express-validator');
const { normalizeUserImages } = require('../utils/imageNormalizer');
const { uploadBase64ToCloudinary } = require('../utils/upload');

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
      profileImage,
      photos
    } = req.body;

    // Log image data received during registration
    console.log('📸 [REGISTER] Image data received:', {
      hasProfileImage: !!profileImage,
      profileImageType: profileImage ? (profileImage.startsWith('data:') ? 'base64' : 'url') : 'none',
      hasPhotos: !!photos,
      photosCount: Array.isArray(photos) ? photos.length : 0,
      photosTypes: Array.isArray(photos) ? photos.map((p) => p ? (p.startsWith('data:') ? 'base64' : 'url') : 'none') : []
    });

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

    // Prepare user data (handle images if provided)
    const userData = {
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
    };

    // Upload profileImage to Cloudinary if provided as base64
    if (profileImage && profileImage.startsWith('data:')) {
      try {
        console.log('📸 [REGISTER] Uploading profile image to Cloudinary...');
        const cloudinaryUrl = await uploadBase64ToCloudinary(profileImage, 'profiles');
        userData.profileImage = cloudinaryUrl;
        console.log('✅ [REGISTER] Profile image uploaded to Cloudinary:', cloudinaryUrl.substring(0, 100) + '...');
      } catch (uploadError) {
        console.error('❌ [REGISTER] Failed to upload profile image to Cloudinary:', uploadError);
        // Fallback: store base64 if Cloudinary upload fails (for development)
        userData.profileImage = profileImage;
      }
    } else if (profileImage) {
      // Already a URL, use directly
      userData.profileImage = profileImage;
    }

    // Upload photos to Cloudinary if provided as base64
    if (photos && Array.isArray(photos) && photos.length > 0) {
      const uploadedPhotos = [];
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (photo && photo.startsWith('data:')) {
          try {
            console.log(`📸 [REGISTER] Uploading photo ${i + 1}/${photos.length} to Cloudinary...`);
            const cloudinaryUrl = await uploadBase64ToCloudinary(photo, 'profiles');
            uploadedPhotos.push(cloudinaryUrl);
            console.log(`✅ [REGISTER] Photo ${i + 1} uploaded to Cloudinary`);
          } catch (uploadError) {
            console.error(`❌ [REGISTER] Failed to upload photo ${i + 1} to Cloudinary:`, uploadError);
            // Fallback: store base64 if Cloudinary upload fails
            uploadedPhotos.push(photo);
          }
        } else if (photo) {
          // Already a URL, use directly
          uploadedPhotos.push(photo);
        }
      }
      userData.photos = uploadedPhotos;
    }

    // Create user
    const user = await User.create(userData);

    // Log saved user image data
    console.log('✅ [REGISTER] User created with images:', {
      userId: user._id,
      email: user.email,
      hasProfileImage: !!user.profileImage,
      profileImageUrl: user.profileImage ? (user.profileImage.substring(0, 100) + '...') : 'none',
      hasPhotos: !!user.photos,
      photosCount: Array.isArray(user.photos) ? user.photos.length : 0,
      photosUrls: Array.isArray(user.photos) ? user.photos.map((p) => p ? (p.substring(0, 100) + '...') : 'none') : []
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
        const clientUrl = process.env.CLIENT_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');
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
      college,
      department,
      year,
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
    if (college) updateData.college = college;
    if (department) updateData.department = department;
    if (year) updateData.year = year;
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
    console.log('🔐 [FORGOT PASSWORD] Request received');
    console.log('   Request body:', { email: req.body.email ? '***provided***' : 'missing' });
    
    const { email } = req.body;

    if (!email) {
      console.error('❌ [FORGOT PASSWORD] Email is missing from request body');
      return res.status(400).json({
        status: 'error',
        message: 'Email is required'
      });
    }

    console.log(`📧 [FORGOT PASSWORD] Looking up user with email: ${email}`);
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log(`⚠️ [FORGOT PASSWORD] No user found with email: ${email}`);
      // Don't reveal if user exists or not for security
      return res.status(200).json({
        status: 'success',
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    console.log(`✅ [FORGOT PASSWORD] User found: ${user._id}, ${user.name}`);

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    console.log(`🔑 [FORGOT PASSWORD] Generated reset token (first 10 chars): ${resetToken.substring(0, 10)}...`);
    
    // Hash token and set to resetPasswordToken field
    user.passwordResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    // Set expire time (10 minutes)
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000;
    console.log(`⏰ [FORGOT PASSWORD] Token expires at: ${new Date(user.passwordResetExpires).toISOString()}`);
    
    await user.save();
    console.log(`💾 [FORGOT PASSWORD] User saved with reset token`);

    // Send password reset email
    setImmediate(async () => {
      try {
        console.log(`📬 [FORGOT PASSWORD] Starting email send process...`);
        const { Email, emailTemplates, initializeEmailService } = require('../utils/emailService');
        
        // Ensure email service is initialized
        console.log(`🔧 [FORGOT PASSWORD] Initializing email service...`);
        const transporter = initializeEmailService();
        
        if (!transporter) {
          console.error('❌ [FORGOT PASSWORD] Email service not initialized - checking env vars');
          console.error('   SMTP_HOST:', process.env.SMTP_HOST || 'NOT SET');
          console.error('   SMTP_PORT:', process.env.SMTP_PORT || 'NOT SET');
          console.error('   SMTP_USER:', process.env.SMTP_USER ? 'SET' : 'NOT SET');
          console.error('   SMTP_PASS:', process.env.SMTP_PASS ? 'SET' : 'NOT SET');
          console.error('   SMTP_FROM:', process.env.SMTP_FROM || 'NOT SET');
          return;
        }

        const clientUrl = process.env.CLIENT_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');
        // Remove trailing slash if present
        const cleanClientUrl = clientUrl.replace(/\/$/, '');
        const resetLink = `${cleanClientUrl}/reset-password?token=${resetToken}&userId=${user._id}`;
        
        console.log(`📧 [FORGOT PASSWORD] Attempting to send password reset email:`);
        console.log(`   To: ${user.email}`);
        console.log(`   From: ${process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@campusconnection.com'}`);
        console.log(`   Reset link: ${resetLink}`);
        console.log(`   Client URL: ${cleanClientUrl}`);
        
        const emailResult = await Email.create()
          .to(user.email)
          .subject('Reset Your Password - Campus Connection')
          .html(emailTemplates.passwordResetEmail(user.name, resetLink))
          .send();
        
        console.log(`✅ [FORGOT PASSWORD] Password reset email sent successfully!`);
        console.log(`   Message ID: ${emailResult.messageId || 'N/A'}`);
        console.log(`   Accepted: ${emailResult.accepted?.join(', ') || 'N/A'}`);
        console.log(`   Rejected: ${emailResult.rejected?.join(', ') || 'N/A'}`);
      } catch (emailError) {
        // Log detailed error for debugging
        console.error('❌ [FORGOT PASSWORD] Error sending password reset email:');
        console.error('   User email:', user.email);
        console.error('   Error message:', emailError.message);
        console.error('   Error code:', emailError.code);
        console.error('   Error stack:', emailError.stack);
        if (emailError.response) {
          console.error('   SMTP response:', emailError.response);
        }
        if (emailError.responseCode) {
          console.error('   Response code:', emailError.responseCode);
        }
        if (emailError.command) {
          console.error('   Command:', emailError.command);
        }
        // Don't fail the request if email fails - security best practice
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('❌ [FORGOT PASSWORD] Unexpected error:', error);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
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

// --- OTP-based Password Reset Handlers ---

// @desc    Request password reset OTP
// @route   POST /api/auth/request-password-otp
// @access  Public
const requestPasswordOtp = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    // Always return success (avoid user enumeration)
    if (!user) {
      return res.status(200).json({
        status: 'success',
        message: 'If an account exists, an OTP has been sent.'
      });
    }

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Upsert OTP record
    await PasswordResetOtp.findOneAndUpdate(
      { email: user.email, isUsed: false },
      {
        userId: user._id,
        email: user.email,
        otpHash,
        expiresAt,
        attempts: 0,
        lastSentAt: new Date(),
        isUsed: false
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Send OTP email (non-blocking)
    setImmediate(async () => {
      try {
        await Email.create()
          .to(user.email)
          .subject('Your Password Reset Code')
          .html(emailTemplates.passwordResetOtpEmail(user.name || 'User', otp, 10))
          .send();
      } catch (e) {
        console.error('❌ [OTP EMAIL] Failed to send OTP email:', e.message);
      }
    });

    return res.status(200).json({
      status: 'success',
      message: 'If an account exists, an OTP has been sent.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify password reset OTP
// @route   POST /api/auth/verify-password-otp
// @access  Public
const verifyPasswordOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ status: 'error', message: 'Email and OTP are required' });
    }

    const otpRecord = await PasswordResetOtp.findOne({ email, isUsed: false });
    if (!otpRecord || otpRecord.expiresAt < new Date()) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP' });
    }

    const providedHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (providedHash !== otpRecord.otpHash) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      const remaining = Math.max(0, 5 - otpRecord.attempts);
      const msg = remaining > 0 ? `Incorrect OTP. ${remaining} attempts left.` : 'Incorrect OTP.';
      return res.status(400).json({ status: 'error', message: msg });
    }

    // Issue short-lived session for password change to avoid re-sending OTP
    const sessionId = crypto.randomBytes(24).toString('hex');
    const now = new Date();
    // Session valid up to remaining OTP time or 10 minutes, whichever is sooner
    const sessionExpiresAt = new Date(Math.min(otpRecord.expiresAt.getTime(), now.getTime() + 10 * 60 * 1000));

    otpRecord.sessionId = sessionId;
    otpRecord.sessionExpiresAt = sessionExpiresAt;
    await otpRecord.save();

    return res.status(200).json({
      status: 'success',
      message: 'OTP verified',
      data: { otpSessionId: sessionId }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update password using OTP
// @route   PUT /api/auth/update-password-with-otp
// @access  Public
const updatePasswordWithOtp = async (req, res, next) => {
  try {
    const { otpSessionId, newPassword } = req.body;

    if (!otpSessionId || !newPassword) {
      return res.status(400).json({ status: 'error', message: 'otpSessionId and newPassword are required' });
    }

    // Validate session
    const otpRecord = await PasswordResetOtp.findOne({ sessionId: otpSessionId, isUsed: false });
    if (!otpRecord || !otpRecord.sessionExpiresAt || otpRecord.sessionExpiresAt < new Date()) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired verification session' });
    }

    const user = await User.findOne({ email: otpRecord.email }).select('+password');
    if (!user) {
      return res.status(400).json({ status: 'error', message: 'Invalid request' });
    }

    // Invalidate session and OTP
    otpRecord.isUsed = true;
    otpRecord.sessionId = null;
    otpRecord.sessionExpiresAt = null;
    await otpRecord.save();

    // Set new password
    user.password = newPassword;
    await user.save();

    // Generate new token
    const newToken = generateToken(user._id);
    const publicProfile = user.getPublicProfile();
    const normalizedUser = normalizeUserImages(publicProfile);

    return res.status(200).json({
      status: 'success',
      message: 'Password updated successfully',
      data: { token: newToken, user: normalizedUser }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resend password reset OTP
// @route   POST /api/auth/resend-password-otp
// @access  Public
const resendPasswordOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({ status: 'success', message: 'If an account exists, an OTP has been sent.' });
    }

    const existing = await PasswordResetOtp.findOne({ email, isUsed: false });
    const now = new Date();
    if (existing && existing.expiresAt > now) {
      const cooldownMs = 30 * 1000; // 30 seconds resend cooldown
      if (existing.lastSentAt && now - existing.lastSentAt < cooldownMs) {
        const waitSec = Math.ceil((cooldownMs - (now - existing.lastSentAt)) / 1000);
        return res.status(429).json({ status: 'error', message: `Please wait ${waitSec}s before resending OTP.` });
      }
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await PasswordResetOtp.findOneAndUpdate(
      { email: user.email, isUsed: false },
      { userId: user._id, email: user.email, otpHash, expiresAt, attempts: 0, lastSentAt: new Date(), isUsed: false },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Send OTP email
    setImmediate(async () => {
      try {
        await Email.create()
          .to(user.email)
          .subject('Your Password Reset Code')
          .html(emailTemplates.passwordResetOtpEmail(user.name || 'User', otp, 10))
          .send();
      } catch (e) {
        console.error('❌ [OTP EMAIL] Failed to resend OTP email:', e.message);
      }
    });

    return res.status(200).json({ status: 'success', message: 'If an account exists, an OTP has been sent.' });
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
  // OTP-based password reset
  requestPasswordOtp,
  verifyPasswordOtp,
  updatePasswordWithOtp,
  resendPasswordOtp,
  logout
};
