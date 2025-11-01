const User = require('../models/User');
const { validationResult } = require('express-validator');

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
    
    const users = await User.find(mongoQuery)
      .select('-password -emailVerificationToken -passwordResetToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(mongoQuery);

    res.status(200).json({
      status: 'success',
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalUsers: total,
          hasNext: skip + users.length < total,
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

    res.status(200).json({
      status: 'success',
      data: {
        user: user.getPublicProfile()
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

    // Get current user
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

    // Check if already liked
    if (currentUser.likes.includes(targetUserId)) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already liked this user'
      });
    }

    // Add like
    currentUser.likes.push(targetUserId);
    targetUser.likedBy.push(currentUserId);

    // Check for match
    let isMatch = false;
    if (targetUser.likes.includes(currentUserId)) {
      isMatch = true;
      currentUser.matches.push(targetUserId);
      targetUser.matches.push(currentUserId);
    }

    await currentUser.save();
    await targetUser.save();

    res.status(200).json({
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

    // Get current user
    const currentUser = await User.findById(currentUserId);
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

    await currentUser.save();
    await targetUser.save();

    res.status(200).json({
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
    const user = await User.findById(req.user._id)
      .populate('likes', 'name age profileImage college department verified')
      .populate('likedBy', 'name age profileImage college department verified')
      .populate('matches', 'name age profileImage college department verified');

    res.status(200).json({
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
const getSuggestedUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const currentUser = await User.findById(req.user._id);

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

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(mongoQuery)
      .select('-password -emailVerificationToken -passwordResetToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(mongoQuery);

    res.status(200).json({
      status: 'success',
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalUsers: total,
          hasNext: skip + users.length < total,
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

    const currentUser = await User.findById(currentUserId);
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

    res.status(200).json({
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

    res.status(200).json({
      status: 'success',
      message: 'User reported successfully'
    });
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
  reportUser
};
