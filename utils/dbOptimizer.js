const mongoose = require('mongoose');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Confession = require('../models/Confession');
const Message = require('../models/Message');

const ensureIndexes = async () => {
  try {
    console.log('🛠️ Ensuring Database Indexes...');
    
    // Chat Indexes - Critical for dashboard load
    // Compound index for fetching user's active chats
    await Chat.collection.createIndex({ participants: 1, isActive: 1 });
    // Index for sorting chats
    await Chat.collection.createIndex({ lastMessageAt: -1 });
    
    // Message Indexes - For scalable chat messages
    await Message.collection.createIndex({ chatId: 1, createdAt: -1 });
    await Message.collection.createIndex({ senderId: 1 });
    
    // Confession Indexes
    // Index for feed sorting
    await Confession.collection.createIndex({ createdAt: -1 });
    // Compound index for filtering
    await Confession.collection.createIndex({ category: 1, isApproved: 1, isActive: 1 });
    
    // User Indexes
    await User.collection.createIndex({ email: 1 }, { unique: true });
    // Index for search functionality
    await User.collection.createIndex({ name: 'text', college: 'text', department: 'text' });
    // Index to accelerate suggestions query (filter by isActive, sort by createdAt)
    await User.collection.createIndex({ isActive: 1, createdAt: -1 });
    
    console.log('✅ Indexes Verified');
  } catch (error) {
    console.error('⚠️ Indexing Error:', error.message);
  }
};

module.exports = ensureIndexes;
