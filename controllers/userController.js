const User = require('../models/User');
const { validationResult } = require('express-validator');
const { normalizeUserImages } = require('../utils/imageNormalizer');

// @desc    Search users
// @route   GET /api/users/search
// @access  Private
const searchUsers = async (req, res, next) => {
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
      query,
      gender,
      department,
      college,
      interests,
      lookingFor,
      ageMin,
      ageMax,
      page = 1,
      limit = 20
    } = req.query;

    // Build search criteria
    const criteria = {
      excludeId: req.user._id
    };

    if (gender && gender !== 'all') {
      criteria.gender = gender;
    }

    if (department && department !== 'all') {
      criteria.department = department;
    }

    if (college) {
      criteria.college = college;
    }

    if (interests) {
      criteria.interests = Array.isArray(interests) ? interests : [interests];
    }

    if (lookingFor && lookingFor !== 'all') {
      criteria.lookingFor = lookingFor;
    }

    if (ageMin) {
      criteria.ageMin = parseInt(ageMin);
    }

    if (ageMax) {
      criteria.ageMax = parseInt(ageMax);
    }

    // Build MongoDB query
    let mongoQuery = { isActive: true, _id: { $ne: req.user._id } };

    // Text search
    if (query) {
      mongoQuery.$or = [
        { name: { $regex: query, $options: 'i' } },
        { college: { $regex: query, $options: 'i' } },
        { department: { $regex: query, $options: 'i' } },
        { bio: { $regex: query, $options: 'i' } }
      ];
    }

    // Apply filters
    if (gender && gender !== 'all') {
      mongoQuery.gender = gender;
    }

    if (department && department !== 'all') {
      mongoQuery.department = department;
    }

    if (college) {
      mongoQuery.college = { $regex: college, $options: 'i' };
    }

    if (interests) {
      const interestArray = Array.isArray(interests) ? interests : [interests];
      mongoQuery.interests = { $in: interestArray };
    }

    if (lookingFor && lookingFor !== 'all') {
      mongoQuery.lookingFor = lookingFor;
    }

    if (ageMin || ageMax) {
      mongoQuery.age = {};
      if (ageMin) mongoQuery.age.$gte = parseInt(ageMin);
      if (ageMax) mongoQuery.age.$lte = parseInt(ageMax);
    }

    // Execute query
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [users, total] = await Promise.all([
      User.find(mongoQuery)
        .select('-password -emailVerificationToken -passwordResetToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(mongoQuery)
    ]);

    // Normalize image URLs for all users
    const normalizedUsers = users.map(user => normalizeUserImages(user));
    
    return res.status(200).json({
      status: 'success',
      data: {
        users: normalizedUsers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalUsers: total,
          hasNext: skip + normalizedUsers.length < total,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user profile by ID
// @route   GET /api/users/:id
// @access  Private
const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -emailVerificationToken -passwordResetToken');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(404).json({
        status: 'error',
        message: 'User profile is not available'
      });
    }

    // Normalize image URLs
    const publicProfile = user.getPublicProfile();
    const normalizedUser = normalizeUserImages(publicProfile);

    return res.status(200).json({
      status: 'success',
      data: {
        user: normalizedUser
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Like a user
// @route   POST /api/users/:id/like
// @access  Private
const likeUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;

    if (targetUserId === currentUserId.toString()) {
      return res.status(400).json({
        status: 'error',
        message: 'You cannot like yourself'
      });
    }

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    if (!targetUser.isActive) {
      return res.status(404).json({
        status: 'error',
        message: 'User profile is not available'
      });
    }

    // Check if already liked (convert both to strings for comparison)
    const likesAsStrings = currentUser.likes.map(like => like.toString());
    if (likesAsStrings.includes(targetUserId.toString())) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already liked this user'
      });
    }

    currentUser.likes.push(targetUserId);
    targetUser.likedBy.push(currentUserId);

    // Check for match (convert both to strings for comparison)
    let isMatch = false;
    const targetUserLikesAsStrings = targetUser.likes.map(like => like.toString());
    if (targetUserLikesAsStrings.includes(currentUserId.toString())) {
      isMatch = true;
      currentUser.matches.push(targetUserId);
      targetUser.matches.push(currentUserId);
    }

    currentUser.swipesToday = (currentUser.swipesToday || 0) + 1;
    await Promise.all([currentUser.save(), targetUser.save()]);

    // Send Socket.io notification for real-time updates
    const { getIO } = require('../utils/socket');
    const io = getIO();
    
    // Notify target user about the like (if online)
    io.to(`user:${targetUserId}`).emit('like:new', {
      userId: currentUserId.toString(),
      username: currentUser.name,
      userAvatar: currentUser.profileImage
    });

    // Send FCM push notification for like
    if (!isMatch) {
      setImmediate(async () => {
        try {
          const { sendLikeNotification } = require('../utils/pushNotification');
          await sendLikeNotification(targetUserId, {
            userId: currentUserId.toString(),
            userName: currentUser.name,
            userAvatar: currentUser.profileImage
          });
        } catch (notificationError) {
          console.error('Error sending like notification:', notificationError);
        }
      });
    }

    // If it's a match, notify both users
    if (isMatch) {
      // Socket.io notifications for matches
      io.to(`user:${currentUserId}`).emit('match:new', {
        userId: targetUserId.toString(),
        userName: targetUser.name,
        userAvatar: targetUser.profileImage,
        matchId: `${currentUserId}-${targetUserId}`
      });
      
      io.to(`user:${targetUserId}`).emit('match:new', {
        userId: currentUserId.toString(),
        userName: currentUser.name,
        userAvatar: currentUser.profileImage,
        matchId: `${currentUserId}-${targetUserId}`
      });

      // FCM push notifications for matches
      setImmediate(async () => {
        try {
          const { sendMatchNotification } = require('../utils/pushNotification');
          
          // Notify current user about match
          await sendMatchNotification(currentUserId.toString(), {
            userId: targetUserId.toString(),
            userName: targetUser.name,
            userAvatar: targetUser.profileImage,
            matchId: `${currentUserId}-${targetUserId}`
          });
          
          // Notify target user about match
          await sendMatchNotification(targetUserId, {
            userId: currentUserId.toString(),
            userName: currentUser.name,
            userAvatar: currentUser.profileImage,
            matchId: `${currentUserId}-${targetUserId}`
          });
        } catch (notificationError) {
          console.error('Error sending match notification:', notificationError);
        }
      });
    }

    return res.status(200).json({
      status: 'success',
      message: isMatch ? 'It\'s a match!' : 'User liked successfully',
      data: {
        isMatch,
        match: isMatch ? {
          user: targetUser.getPublicProfile()
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Unlike a user
// @route   DELETE /api/users/:id/like
// @access  Private
const unlikeUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;

    // Get current user from request (already populated by auth middleware)
    const currentUser = req.user;
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Remove like
    currentUser.likes = currentUser.likes.filter(
      id => id.toString() !== targetUserId
    );
    
    targetUser.likedBy = targetUser.likedBy.filter(
      id => id.toString() !== currentUserId.toString()
    );

    // Remove from matches if exists
    currentUser.matches = currentUser.matches.filter(
      id => id.toString() !== targetUserId
    );
    
    targetUser.matches = targetUser.matches.filter(
      id => id.toString() !== currentUserId.toString()
    );

    await Promise.all([currentUser.save(), targetUser.save()]);

    return res.status(200).json({
      status: 'success',
      message: 'User unliked successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's likes
// @route   GET /api/users/likes
// @access  Private
const getUserLikes = async (req, res, next) => {
  try {
    const { countOnly } = req.query;
    
    let query = User.findById(req.user._id);
    
    // Only populate if full data is requested (not just counts)
    if (countOnly !== 'true') {
      query = query
        .populate('likes', 'name age profileImage college department verified')
        .populate('likedBy', 'name age profileImage college department verified')
        .populate('matches', 'name age profileImage college department verified');
    }

    const user = await query;

    return res.status(200).json({
      status: 'success',
      data: {
        likes: user.likes,
        likedBy: user.likedBy,
        matches: user.matches
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get suggested users (for discover page)
// @route   GET /api/users/suggestions
// @access  Private
const { logPerformance } = require('../utils/logger');

const getSuggestedUsers = async (req, res, next) => {
  try {
    const start = Date.now();
    const { page = 1, limit = 10 } = req.query;
    // currentUser is already available in req.user
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // TODO: During testing phase, show all users except current user
    // After testing, re-enable filters for likes/matches/age/college
    
    // For testing: Only exclude current user and already matched users (but not likes)
    // Exclude matches to avoid showing users you've already matched with
    const excludeIds = [...(currentUser.matches || []), req.user._id];

    let mongoQuery = {
      isActive: true,
      _id: { $nin: excludeIds }
    };

    // TODO: Re-enable age range filter after testing
    // Age range filter (disabled for testing)
    // if (currentUser.age) {
    //   const ageMin = currentUser.age - 3;
    //   const ageMax = currentUser.age + 3;
    //   mongoQuery.age = { $gte: ageMin, $lte: ageMax };
    // }

    // TODO: Re-enable college filter after testing
    // Same college preference (optional - disabled for testing)
    // if (currentUser.lookingFor && currentUser.lookingFor.includes('Friendship')) {
    //   mongoQuery.college = currentUser.college;
    // }

    const limitNum = Math.min(parseInt(limit), 20);
    const skip = (parseInt(page) - 1) * limitNum;
    
    let users;
    try {
      users = await User.find(mongoQuery)
      .select('_id name age gender college department year bio interests photos profileImage emailVerified isVerified verified lookingFor createdAt isActive')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();
    } catch (dbErr) {
      // DB failure fallback with partial response
      return res.status(200).json({
        status: 'success',
        data: {
          users: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalUsers: 0,
            hasNext: false,
            hasPrev: parseInt(page) > 1
          },
          partial: true
        }
      });
    }

    // Normalize image URLs for all users
    const normalizedUsers = users.map(user => normalizeUserImages(user));

    const total = await User.countDocuments(mongoQuery);

    const duration = Date.now() - start;
    logPerformance('suggestions', duration, { userId: req.user._id.toString(), page: parseInt(page), limit: limitNum });
    return res.status(200).json({
      status: 'success',
      data: {
        users: normalizedUsers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limitNum),
          totalUsers: total,
          hasNext: skip + normalizedUsers.length < total,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Block a user
// @route   POST /api/users/:id/block
// @access  Private
const blockUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;

    if (targetUserId === currentUserId.toString()) {
      return res.status(400).json({
        status: 'error',
        message: 'You cannot block yourself'
      });
    }

    const currentUser = req.user;
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Add to blocked users (you'll need to add this field to User model)
    if (!currentUser.blockedUsers) {
      currentUser.blockedUsers = [];
    }

    if (!currentUser.blockedUsers.includes(targetUserId)) {
      currentUser.blockedUsers.push(targetUserId);
      await currentUser.save();
    }

    return res.status(200).json({
      status: 'success',
      message: 'User blocked successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Report a user
// @route   POST /api/users/:id/report
// @access  Private
const reportUser = async (req, res, next) => {
  try {
    const { reason, description } = req.body;
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;

    if (targetUserId === currentUserId.toString()) {
      return res.status(400).json({
        status: 'error',
        message: 'You cannot report yourself'
      });
    }

    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Add report (you'll need to add this field to User model)
    if (!targetUser.reports) {
      targetUser.reports = [];
    }

    const report = {
      reportedBy: currentUserId,
      reason,
      description,
      reportedAt: new Date()
    };

    targetUser.reports.push(report);
    await targetUser.save();

    return res.status(200).json({
      status: 'success',
      message: 'User reported successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register a swipe attempt and enforce limits
// @route   POST /api/users/swipe
// @access  Private
const registerSwipe = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    const { resetIfNeeded, swipeLimitFor, isPrime } = require('../utils/membership');
    resetIfNeeded(user);
    const limit = swipeLimitFor(user);
    if (user.swipesToday >= limit) {
      return res.status(429).json({ status: 'error', message: 'Daily swipe limit reached', data: { limit, swipesToday: user.swipesToday } });
    }
    user.swipesToday = (user.swipesToday || 0) + 1;
    await user.save();
    return res.status(200).json({ status: 'success', data: { swipesToday: user.swipesToday, limit, prime: isPrime(user) } });
  } catch (error) {
    next(error);
  }
};
module.exports = {
  searchUsers,
  getUserProfile,
  likeUser,
  unlikeUser,
  getUserLikes,
  getSuggestedUsers,
  blockUser,
  reportUser,
  registerSwipe
};
