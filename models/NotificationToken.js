const mongoose = require('mongoose');

const notificationTokenSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  platform: {
    type: String,
    enum: ['web', 'android', 'ios'],
    default: 'web'
  },
  deviceInfo: {
    userAgent: String,
    language: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsed: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
notificationTokenSchema.index({ user: 1, isActive: 1 });

// Remove old tokens for the same user (keep only latest 5 per user)
notificationTokenSchema.pre('save', async function(next) {
  if (this.isNew) {
    const existingTokens = await mongoose.model('NotificationToken').find({
      user: this.user,
      isActive: true
    }).sort({ createdAt: -1 });
    
    if (existingTokens.length >= 5) {
      // Deactivate oldest tokens
      const tokensToDeactivate = existingTokens.slice(4);
      await mongoose.model('NotificationToken').updateMany(
        { _id: { $in: tokensToDeactivate.map(t => t._id) } },
        { isActive: false }
      );
    }
  }
  next();
});

module.exports = mongoose.model('NotificationToken', notificationTokenSchema);
