const Chat = require('../models/Chat');
const User = require('../models/User');
const { validationResult } = require('express-validator');

// @desc    Get user's chats
// @route   GET /api/chat
// @access  Private
const getUserChats = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const chats = await Chat.find({
      participants: req.user._id,
      isActive: true
    })
    .populate('participants', 'name profileImage verified')
    .sort({ lastMessageAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await Chat.countDocuments({
      participants: req.user._id,
      isActive: true
    });

    res.status(200).json({
      status: 'success',
      data: {
        chats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalChats: total,
          hasNext: skip + chats.length < total,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get or create chat with a user
// @route   GET /api/chat/:userId
// @access  Private
const getOrCreateChat = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (userId === currentUserId.toString()) {
      return res.status(400).json({
        status: 'error',
        message: 'You cannot chat with yourself'
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // TODO: Re-enable matching requirement check after testing phase
    // During testing phase, allow chatting without matching
    // Check if users have matched (can only chat with matches)
    // const currentUser = await User.findById(currentUserId);
    // if (!currentUser.matches.includes(userId)) {
    //   return res.status(403).json({
    //     status: 'error',
    //     message: 'You can only chat with users you have matched with'
    //   });
    // }

    // Find or create chat
    const chat = await Chat.findOrCreateChat(currentUserId, userId);

    // Populate participants with user info
    await chat.populate({
      path: 'participants',
      select: 'name profileImage verified'
    });

    // Populate the last few messages
    await chat.populate({
      path: 'messages.sender',
      select: 'name profileImage'
    });

    res.status(200).json({
      status: 'success',
      data: {
        chat
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get chat messages
// @route   GET /api/chat/:chatId/messages
// @access  Private
const getChatMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const chat = await Chat.findById(chatId)
      .populate('participants', 'name profileImage');

    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    // Check if user is participant
    if (!chat.participants.some(p => p._id.toString() === req.user._id.toString())) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    // Get messages with pagination
    const messages = chat.messages
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(skip, skip + parseInt(limit))
      .reverse();

    // Populate sender info
    await chat.populate({
      path: 'messages.sender',
      select: 'name profileImage'
    });

    res.status(200).json({
      status: 'success',
      data: {
        messages,
        chat: {
          _id: chat._id,
          participants: chat.participants,
          lastMessage: chat.lastMessage,
          lastMessageAt: chat.lastMessageAt
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(chat.messages.length / parseInt(limit)),
          totalMessages: chat.messages.length,
          hasNext: skip + messages.length < chat.messages.length,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send message
// @route   POST /api/chat/:chatId/messages
// @access  Private
const sendMessage = async (req, res, next) => {
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

    const { chatId } = req.params;
    const { content, type = 'text', imageUrl = '' } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    // Check if user is participant
    if (!chat.participants.includes(req.user._id)) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    // Add message
    const message = await chat.addMessage(req.user._id, content, type, imageUrl);

    // Repopulate chat to get sender info for messages
    // Can't populate nested docs directly, so populate at chat level
    await chat.populate({
      path: 'messages.sender',
      select: 'name profileImage'
    });

    // Get the last message (the one we just added) with populated sender
    const populatedMessage = chat.messages[chat.messages.length - 1];

    // Emit Socket.io event for real-time updates (for connected users)
    try {
      const { getIO } = require('../utils/socket');
      const io = getIO();
      io.to(`chat:${chatId}`).emit('message:new', {
        id: populatedMessage._id,
        chatId: chatId,
        content: populatedMessage.content,
        sender: {
          id: req.user._id,
          name: req.user.name
        },
        createdAt: populatedMessage.createdAt,
        timestamp: populatedMessage.createdAt
      });
    } catch (socketError) {
      // Log error but don't fail the message send
      console.error('Error emitting Socket.io event:', socketError);
    }

    // Get recipient user (the other participant)
    const recipientId = chat.participants.find(
      (p) => p.toString() !== req.user._id.toString()
    );

    // Send FCM push notification to recipient if they're not connected via Socket.io
    // Do this asynchronously after sending the response to avoid delaying the message
    if (recipientId) {
      // Run notification in background (don't await)
      setImmediate(async () => {
        try {
          const { sendMessageNotification } = require('../utils/pushNotification');
          const User = require('../models/User');
          
          const sender = await User.findById(req.user._id).select('name profileImage');
          
          // Check if recipient is connected via Socket.io
          let isRecipientOnline = false;
          try {
            const { getIO } = require('../utils/socket');
            const io = getIO();
            const recipientSockets = await io.in(`user:${recipientId}`).fetchSockets();
            isRecipientOnline = recipientSockets.length > 0;
          } catch (socketCheckError) {
            // If Socket.io check fails, assume user is offline and send FCM
            console.warn('Error checking Socket.io connection:', socketCheckError);
            isRecipientOnline = false;
          }
          
          // Only send FCM if recipient is not actively connected
          if (!isRecipientOnline) {
            await sendMessageNotification(recipientId.toString(), {
              senderName: sender?.name || 'Someone',
              content: content.substring(0, 100), // Truncate long messages
              chatId: chatId,
              senderId: req.user._id.toString(),
              senderAvatar: sender?.profileImage,
              messageId: populatedMessage._id.toString()
            });
          }
        } catch (notificationError) {
          // Log error but don't fail the message send
          console.error('Error sending push notification:', notificationError);
        }
      });
    }

    res.status(201).json({
      status: 'success',
      message: 'Message sent successfully',
      data: {
        message: populatedMessage
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark messages as read
// @route   PUT /api/chat/:chatId/read
// @access  Private
const markAsRead = async (req, res, next) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    // Check if user is participant
    if (!chat.participants.includes(req.user._id)) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    // Mark messages as read
    await chat.markAsRead(req.user._id);

    res.status(200).json({
      status: 'success',
      message: 'Messages marked as read'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete chat
// @route   DELETE /api/chat/:chatId
// @access  Private
const deleteChat = async (req, res, next) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    // Check if user is participant
    if (!chat.participants.includes(req.user._id)) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    // Deactivate chat
    chat.isActive = false;
    await chat.save();

    res.status(200).json({
      status: 'success',
      message: 'Chat deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get unread message count
// @route   GET /api/chat/unread-count
// @access  Private
const getUnreadCount = async (req, res, next) => {
  try {
    const chats = await Chat.find({
      participants: req.user._id,
      isActive: true
    });

    let unreadCount = 0;

    chats.forEach(chat => {
      const unreadMessages = chat.messages.filter(
        message => !message.isRead && message.sender.toString() !== req.user._id.toString()
      );
      unreadCount += unreadMessages.length;
    });

    res.status(200).json({
      status: 'success',
      data: {
        unreadCount
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserChats,
  getOrCreateChat,
  getChatMessages,
  sendMessage,
  markAsRead,
  deleteChat,
  getUnreadCount
};
