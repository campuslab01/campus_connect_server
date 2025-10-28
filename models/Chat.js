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
    enum: ['text', 'image', 'emoji'],
    default: 'text'
  },
  imageUrl: {
    type: String,
    default: ''
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
    this.lastMessage = lastMessage.content;
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
chatSchema.methods.addMessage = async function(senderId, content, type = 'text', imageUrl = '') {
  const message = {
    sender: senderId,
    content,
    type,
    imageUrl,
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
