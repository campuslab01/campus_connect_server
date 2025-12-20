const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: [1000, 'Message cannot be more than 1000 characters']
  },
  type: {
    type: String,
    enum: ['text', 'image', 'emoji', 'confession'],
    default: 'text'
  },
  imageUrl: {
    type: String,
    default: ''
  },
  confessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Confession',
    default: null
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const chatSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  messages: [messageSchema],
  lastMessage: {
    type: String,
    default: ''
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Chat Request Functionality
  chatRequest: {
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    requestedAt: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', null],
      default: null
    },
    acceptedAt: {
      type: Date,
      default: null
    },
    rejectedAt: {
      type: Date,
      default: null
    }
  },
  // Compatibility Quiz
  quizConsent: {
    user1Consent: {
      type: Boolean,
      default: null
    },
    user2Consent: {
      type: Boolean,
      default: null
    },
    askedAt: {
      type: Date,
      default: null
    }
  },
  quizScores: {
    user1Score: {
      type: Number,
      default: null
    },
    user2Score: {
      type: Number,
      default: null
    },
    user1CompletedAt: {
      type: Date,
      default: null
    },
    user2CompletedAt: {
      type: Date,
      default: null
    }
  },
  quizAnswers: {
    user1: {
      type: Object,
      default: null
    },
    user2: {
      type: Object,
      default: null
    },
    exchangedAt: {
      type: Date,
      default: null
    }
  },
  compatibilityScore: {
    type: Number,
    default: null
  },
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
chatSchema.index({ participants: 1 });
chatSchema.index({ lastMessageAt: -1 });

// Pre-save middleware to update lastMessage and lastMessageAt
chatSchema.pre('save', function(next) {
  if (this.messages && this.messages.length > 0) {
    const lastMessage = this.messages[this.messages.length - 1];
    // Handle different message types for lastMessage preview
    if (lastMessage.type === 'confession') {
      this.lastMessage = 'Shared a confession';
    } else if (lastMessage.type === 'image') {
      this.lastMessage = 'Sent an image';
    } else {
      this.lastMessage = lastMessage.content;
    }
    this.lastMessageAt = lastMessage.timestamp;
  }
  this.updatedAt = Date.now();
  next();
});

// Static method to find or create chat between two users
chatSchema.statics.findOrCreateChat = async function(user1Id, user2Id) {
  let chat = await this.findOne({
    participants: { $all: [user1Id, user2Id] },
    isActive: true
  }).populate('participants', 'name profileImage');
  
  if (!chat) {
    chat = await this.create({
      participants: [user1Id, user2Id]
    });
    await chat.populate('participants', 'name profileImage');
  }
  
  return chat;
};

// Instance method to add message
chatSchema.methods.addMessage = async function(senderId, content, type = 'text', imageUrl = '', confessionId = null) {
  const message = {
    sender: senderId,
    content,
    type,
    imageUrl,
    confessionId,
    timestamp: new Date()
  };
  
  this.messages.push(message);
  await this.save();
  
  return this.messages[this.messages.length - 1];
};

// Instance method to mark messages as read
chatSchema.methods.markAsRead = async function(userId) {
  this.messages.forEach(message => {
    if (message.sender.toString() !== userId.toString() && !message.isRead) {
      message.isRead = true;
      message.readAt = new Date();
    }
  });
  
  await this.save();
};

module.exports = mongoose.model('Chat', chatSchema);
