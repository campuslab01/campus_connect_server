const Confession = require('../models/Confession');
const { validationResult } = require('express-validator');

// @desc    Get confessions
// @route   GET /api/confessions
// @access  Private
const getConfessions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category = 'all' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = { isApproved: true, isActive: true };

    if (category && category !== 'all') {
      query.category = category;
    }

    const user = req.user ? await require('../models/User').findById(req.user._id) : null;
    let enforcedLimit = parseInt(limit);
    let locked = false;
    if (user) {
      const { resetIfNeeded, confessionLimitFor } = require('../utils/membership');
      resetIfNeeded(user);
      const max = confessionLimitFor(user);
      if (Number.isFinite(max)) {
        const remaining = Math.max(0, max - (user.confessionReadsToday || 0));
        if (remaining <= 0) {
          enforcedLimit = 0;
          locked = true;
        } else {
          enforcedLimit = Math.min(enforcedLimit, remaining);
        }
      }
    }

    const [confessions, total] = await Promise.all([
      Confession.find(query)
        .populate('author', 'name profileImage verified')
        .populate('comments.author', 'name profileImage verified')
        .populate('comments.replies.author', 'name profileImage verified')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(enforcedLimit),
      Confession.countDocuments(query)
    ]);
    if (user) {
      user.confessionReadsToday = (user.confessionReadsToday || 0) + confessions.length;
      await user.save();
    }

    res.status(200).json({
      status: 'success',
      data: {
        confessions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalConfessions: total,
          hasNext: skip + confessions.length < total,
          hasPrev: parseInt(page) > 1
        },
        meta: {
          locked,
          confessionLimit: user ? (require('../utils/membership').confessionLimitFor(user)) : null,
          confessionReadsToday: user ? user.confessionReadsToday : null
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get confession by ID
// @route   GET /api/confessions/:id
// @access  Private
const getConfession = async (req, res, next) => {
  try {
    const confession = await Confession.findById(req.params.id)
      .populate('author', 'name profileImage verified')
      .populate('comments.author', 'name profileImage verified')
      .populate('comments.replies.author', 'name profileImage verified')
      .populate('likes', 'name profileImage');

    if (!confession) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession not found'
      });
    }

    if (!confession.isApproved || !confession.isActive) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession is not available'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        confession
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create confession
// @route   POST /api/confessions
// @access  Private
const createConfession = async (req, res, next) => {
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

    const { content, category = 'personal', isAnonymous = true, tags = [] } = req.body;

    // TODO: During testing phase, auto-approve confessions
    // After testing, require admin approval (isApproved: false)
    const confession = await Confession.create({
      content,
      author: req.user._id,
      category,
      isAnonymous,
      tags,
      isApproved: true // Auto-approve for testing
    });

    await confession.populate('author', 'name profileImage verified');

    res.status(201).json({
      status: 'success',
      message: 'Confession created successfully',
      data: {
        confession
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Like confession
// @route   POST /api/confessions/:id/like
// @access  Private
const likeConfession = async (req, res, next) => {
  try {
    const confession = await Confession.findById(req.params.id);

    if (!confession) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession not found'
      });
    }

    if (!confession.isApproved || !confession.isActive) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession is not available'
      });
    }

    const liked = await confession.addLike(req.user._id);

    if (!liked) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already liked this confession'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Confession liked successfully',
      data: {
        likeCount: confession.likeCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Unlike confession
// @route   DELETE /api/confessions/:id/like
// @access  Private
const unlikeConfession = async (req, res, next) => {
  try {
    const confession = await Confession.findById(req.params.id);

    if (!confession) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession not found'
      });
    }

    const unliked = await confession.removeLike(req.user._id);

    if (!unliked) {
      return res.status(400).json({
        status: 'error',
        message: 'You have not liked this confession'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Confession unliked successfully',
      data: {
        likeCount: confession.likeCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add comment to confession
// @route   POST /api/confessions/:id/comments
// @access  Private
const addComment = async (req, res, next) => {
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

    const { content, isAnonymous = true } = req.body;

    const confession = await Confession.findById(req.params.id);

    if (!confession) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession not found'
      });
    }

    if (!confession.isApproved || !confession.isActive) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession is not available'
      });
    }

    // Add comment to confession
    await confession.addComment(req.user._id, content, isAnonymous);

    // Save confession to persist the comment
    await confession.save();

    // Populate comments.author at the confession level (can't populate nested docs directly)
    await confession.populate({
      path: 'comments.author',
      select: 'name profileImage verified'
    });

    // Get the last comment (the one we just added) with populated author
    const populatedComment = confession.comments[confession.comments.length - 1];

    res.status(201).json({
      status: 'success',
      message: 'Comment added successfully',
      data: {
        comment: populatedComment
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Report confession
// @route   POST /api/confessions/:id/report
// @access  Private
const reportConfession = async (req, res, next) => {
  try {
    const { reason } = req.body;

    const confession = await Confession.findById(req.params.id);

    if (!confession) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession not found'
      });
    }

    const reported = await confession.report(req.user._id, reason);

    if (!reported) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already reported this confession'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Confession reported successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's confessions
// @route   GET /api/confessions/my
// @access  Private
const getMyConfessions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [confessions, total] = await Promise.all([
      Confession.find({
        author: req.user._id,
        isActive: true
      })
      .populate('comments.author', 'name profileImage verified')
      .populate('comments.replies.author', 'name profileImage verified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
      Confession.countDocuments({
        author: req.user._id,
        isActive: true
      })
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        confessions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalConfessions: total,
          hasNext: skip + confessions.length < total,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete confession
// @route   DELETE /api/confessions/:id
// @access  Private
const deleteConfession = async (req, res, next) => {
  try {
    const confession = await Confession.findById(req.params.id);

    if (!confession) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession not found'
      });
    }

    // Check if user is the author
    if (confession.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'You can only delete your own confessions'
      });
    }

    confession.isActive = false;
    await confession.save();

    res.status(200).json({
      status: 'success',
      message: 'Confession deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Like/Unlike comment
// @route   POST /api/confessions/:confessionId/comments/:commentIndex/like
// @access  Private
const likeComment = async (req, res, next) => {
  try {
    const { confessionId, commentIndex } = req.params;
    const confession = await Confession.findById(confessionId);

    if (!confession) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession not found'
      });
    }

    const index = parseInt(commentIndex);
    if (!confession.comments[index]) {
      return res.status(404).json({
        status: 'error',
        message: 'Comment not found'
      });
    }

    const isLiked = await confession.toggleCommentLike(index, req.user._id);

    // Populate comments.author for response
    await confession.populate({
      path: 'comments.author',
      select: 'name profileImage verified'
    });
    await confession.populate({
      path: 'comments.replies.author',
      select: 'name profileImage verified'
    });

    const comment = confession.comments[index];

    res.status(200).json({
      status: 'success',
      message: isLiked ? 'Comment liked successfully' : 'Comment unliked successfully',
      data: {
        comment: {
          _id: comment._id,
          likes: comment.likes,
          likeCount: comment.likes.length,
          isLiked: isLiked
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add reply to comment
// @route   POST /api/confessions/:confessionId/comments/:commentIndex/replies
// @access  Private
const addReply = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { confessionId, commentIndex } = req.params;
    const { content, isAnonymous = true } = req.body;

    const confession = await Confession.findById(confessionId);

    if (!confession) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession not found'
      });
    }

    if (!confession.isApproved || !confession.isActive) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession is not available'
      });
    }

    const index = parseInt(commentIndex);
    if (!confession.comments[index]) {
      return res.status(404).json({
        status: 'error',
        message: 'Comment not found'
      });
    }

    await confession.addReply(index, req.user._id, content, isAnonymous);
    await confession.save();

    // Populate replies.author at confession level
    await confession.populate({
      path: 'comments.replies.author',
      select: 'name profileImage verified'
    });

    // Get the last reply (the one we just added)
    const populatedReply = confession.comments[index].replies[confession.comments[index].replies.length - 1];

    res.status(201).json({
      status: 'success',
      message: 'Reply added successfully',
      data: {
        reply: populatedReply
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Like/Unlike reply
// @route   POST /api/confessions/:confessionId/comments/:commentIndex/replies/:replyIndex/like
// @access  Private
const likeReply = async (req, res, next) => {
  try {
    const { confessionId, commentIndex, replyIndex } = req.params;
    const confession = await Confession.findById(confessionId);

    if (!confession) {
      return res.status(404).json({
        status: 'error',
        message: 'Confession not found'
      });
    }

    const cIndex = parseInt(commentIndex);
    const rIndex = parseInt(replyIndex);

    if (!confession.comments[cIndex] || !confession.comments[cIndex].replies[rIndex]) {
      return res.status(404).json({
        status: 'error',
        message: 'Reply not found'
      });
    }

    const isLiked = await confession.toggleReplyLike(cIndex, rIndex, req.user._id);

    // Populate for response
    await confession.populate({
      path: 'comments.replies.author',
      select: 'name profileImage verified'
    });

    const reply = confession.comments[cIndex].replies[rIndex];

    res.status(200).json({
      status: 'success',
      message: isLiked ? 'Reply liked successfully' : 'Reply unliked successfully',
      data: {
        reply: {
          _id: reply._id,
          likes: reply.likes,
          likeCount: reply.likes.length,
          isLiked: isLiked
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getConfessions,
  getConfession,
  createConfession,
  likeConfession,
  unlikeConfession,
  addComment,
  likeComment,
  addReply,
  likeReply,
  reportConfession,
  getMyConfessions,
  deleteConfession
};
