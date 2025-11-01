const mongoose = require('mongoose');

const confessionSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Confession content is required'],
    maxlength: [1000, 'Confession cannot be more than 1000 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isAnonymous: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    enum: ['love', 'academic', 'friendship', 'family', 'personal', 'other'],
    default: 'personal'
  },
  tags: [{
    type: String,
    trim: true
  }],
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [{
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      maxlength: [500, 'Comment cannot be more than 500 characters']
    },
    isAnonymous: {
      type: Boolean,
      default: true
    },
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    replies: [{
      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      content: {
        type: String,
        required: true,
        maxlength: [500, 'Reply cannot be more than 500 characters']
      },
      isAnonymous: {
        type: Boolean,
        default: true
      },
      likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isApproved: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  reportedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      enum: ['inappropriate', 'spam', 'harassment', 'other']
    },
    reportedAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
confessionSchema.index({ createdAt: -1 });
confessionSchema.index({ category: 1 });
confessionSchema.index({ isApproved: 1, isActive: 1 });
confessionSchema.index({ 'likes': 1 });

// Virtual for like count
confessionSchema.virtual('likeCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Virtual for comment count
confessionSchema.virtual('commentCount').get(function() {
  return this.comments ? this.comments.length : 0;
});

// Pre-save middleware to update updatedAt
confessionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method to add like
confessionSchema.methods.addLike = async function(userId) {
  if (!this.likes.includes(userId)) {
    this.likes.push(userId);
    await this.save();
    return true;
  }
  return false;
};

// Instance method to remove like
confessionSchema.methods.removeLike = async function(userId) {
  const index = this.likes.indexOf(userId);
  if (index > -1) {
    this.likes.splice(index, 1);
    await this.save();
    return true;
  }
  return false;
};

// Instance method to add comment
confessionSchema.methods.addComment = async function(authorId, content, isAnonymous = true) {
  const comment = {
    author: authorId,
    content,
    isAnonymous,
    likes: [],
    replies: [],
    createdAt: new Date()
  };
  
  this.comments.push(comment);
  await this.save();
  
  return this.comments[this.comments.length - 1];
};

// Instance method to add reply to comment
confessionSchema.methods.addReply = async function(commentIndex, authorId, content, isAnonymous = true) {
  const reply = {
    author: authorId,
    content,
    isAnonymous,
    likes: [],
    createdAt: new Date()
  };
  
  if (this.comments[commentIndex]) {
    this.comments[commentIndex].replies.push(reply);
    await this.save();
    return this.comments[commentIndex].replies[this.comments[commentIndex].replies.length - 1];
  }
  throw new Error('Comment not found');
};

// Instance method to like/unlike comment
confessionSchema.methods.toggleCommentLike = async function(commentIndex, userId) {
  if (!this.comments[commentIndex]) {
    throw new Error('Comment not found');
  }
  
  const comment = this.comments[commentIndex];
  const likeIndex = comment.likes.indexOf(userId);
  
  if (likeIndex > -1) {
    comment.likes.splice(likeIndex, 1);
  } else {
    comment.likes.push(userId);
  }
  
  await this.save();
  return comment.likes.includes(userId);
};

// Instance method to like/unlike reply
confessionSchema.methods.toggleReplyLike = async function(commentIndex, replyIndex, userId) {
  if (!this.comments[commentIndex] || !this.comments[commentIndex].replies[replyIndex]) {
    throw new Error('Reply not found');
  }
  
  const reply = this.comments[commentIndex].replies[replyIndex];
  const likeIndex = reply.likes.indexOf(userId);
  
  if (likeIndex > -1) {
    reply.likes.splice(likeIndex, 1);
  } else {
    reply.likes.push(userId);
  }
  
  await this.save();
  return reply.likes.includes(userId);
};

// Instance method to report confession
confessionSchema.methods.report = async function(userId, reason) {
  const existingReport = this.reportedBy.find(
    report => report.user.toString() === userId.toString()
  );
  
  if (!existingReport) {
    this.reportedBy.push({
      user: userId,
      reason,
      reportedAt: new Date()
    });
    await this.save();
    return true;
  }
  return false;
};

// Static method to get approved confessions
confessionSchema.statics.getApprovedConfessions = function(page = 1, limit = 20, category = null) {
  const query = { isApproved: true, isActive: true };
  
  if (category && category !== 'all') {
    query.category = category;
  }
  
  return this.find(query)
    .populate('author', 'name profileImage')
    .populate('comments.author', 'name profileImage')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

module.exports = mongoose.model('Confession', confessionSchema);
