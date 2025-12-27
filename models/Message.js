const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 1000
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
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

// Compound index for pagination by chat and time
messageSchema.index({ chatId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
