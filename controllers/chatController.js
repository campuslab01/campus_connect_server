const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');

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
    .select('participants lastMessage lastMessageAt isActive')
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

    // Check if target user exists and find existing chat in parallel
    const [targetUser, existingChat] = await Promise.all([
      User.findById(userId).select('name profileImage verified isVerified'), // Select only needed fields
      Chat.findOne(
        {
          participants: { $all: [currentUserId, userId] },
          isActive: true
        },
        { messages: { $slice: -50 } } // Only fetch last 50 messages to prevent crash
      )
      .populate('participants', 'name profileImage verified')
    ]);

    if (!targetUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    let chat = existingChat;

    if (!chat) {
      // Create new chat with pending request status
      chat = await Chat.create({
        participants: [currentUserId, userId],
        chatRequest: {
          requestedBy: currentUserId,
          requestedAt: new Date(),
          status: 'pending'
        }
      });
      
      // Emit chat request notification via Socket.io
      const { getIO } = require('../utils/socket');
      const io = getIO();
      io.to(`user:${userId}`).emit('chat:request', {
        chatId: chat._id,
        requestedBy: currentUserId,
        requesterName: req.user.name,
        requestedAt: chat.chatRequest.requestedAt
      });

      // Send FCM push notification for chat request (async)
      setImmediate(async () => {
        try {
          const { sendChatRequestNotification } = require('../utils/pushNotification');
          const User = require('../models/User');
          const requester = await User.findById(currentUserId).select('name profileImage');
          await sendChatRequestNotification(userId.toString(), {
            chatId: chat._id.toString(),
            requesterId: currentUserId.toString(),
            requesterName: requester?.name,
            requesterAvatar: requester?.profileImage
          });
        } catch (notificationError) {
          console.error('Error sending chat request push notification:', notificationError);
        }
      });
    } else {
      // Check if chat request needs to be handled
      if (chat.chatRequest && chat.chatRequest.status === 'pending') {
        // Check if current user is the requester or the recipient
        const isRequester = chat.chatRequest.requestedBy.toString() === currentUserId.toString();
        if (!isRequester) {
          // Current user is recipient - they can view but chat is pending
          // Allow viewing but messages are blocked until accepted
        }
      }
    }

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
    const { page = 1, limit = 50, cursor } = req.query;
    const limitNum = parseInt(limit);

    const chatExists = await Chat.exists({
      _id: chatId,
      participants: req.user._id
    });
    if (!chatExists) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found or access denied'
      });
    }

    const totalMessages = await Message.countDocuments({ chatId });
    const query = { chatId };
    if (cursor) {
      const c = new Date(cursor);
      if (!isNaN(c.getTime())) {
        query.createdAt = { $lt: c };
      }
    }

    let docs = await Message.find(query)
      .sort({ createdAt: -1 })
      .skip(cursor ? 0 : (parseInt(page) - 1) * limitNum)
      .limit(limitNum)
      .populate('senderId', 'name profileImage')
      .populate({
        path: 'confessionId',
        select: 'content author isAnonymous likes comments createdAt',
        populate: { path: 'author', select: 'name profileImage' }
      });

    let messages = [];
    let chatInfo = await Chat.findById(chatId).select('participants lastMessage lastMessageAt').populate('participants', 'name profileImage');

    if (docs.length > 0) {
      messages = docs.map(m => ({
        _id: m._id,
        content: m.text,
        type: m.type || 'text',
        imageUrl: m.imageUrl || '',
        confessionId: m.confessionId?._id || m.confessionId || null,
        sender: m.senderId && m.senderId._id ? { _id: m.senderId._id, name: m.senderId.name, profileImage: m.senderId.profileImage } : m.senderId,
        createdAt: m.createdAt,
        timestamp: m.createdAt
      }));
    } else {
      logger.warn(`Dual-read fallback: Using embedded Chat.messages for chat ${chatId}`, { chatId });
      const countResult = await Chat.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(chatId) } },
        { $project: { count: { $size: '$messages' } } }
      ]);
      const legacyTotal = countResult[0]?.count || 0;
      let sliceStart = legacyTotal - (parseInt(page) * limitNum);
      let sliceLimit = limitNum;
      if (sliceStart < 0) {
        sliceLimit = sliceLimit + sliceStart;
        sliceStart = 0;
      }
      if (sliceLimit > 0) {
        const chatWithMessages = await Chat.findById(chatId)
          .select({
            participants: 1,
            lastMessage: 1,
            lastMessageAt: 1,
            messages: { $slice: [sliceStart, sliceLimit] }
          })
          .populate('participants', 'name profileImage')
          .populate({
            path: 'messages.sender',
            select: 'name profileImage'
          })
          .populate({
            path: 'messages.confessionId',
            select: 'content author isAnonymous likes comments createdAt',
            populate: { path: 'author', select: 'name profileImage' }
          });
        messages = (chatWithMessages.messages || []).reverse();
        chatInfo = chatWithMessages;
      } else {
        messages = [];
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        messages,
        chat: {
          _id: chatId,
          participants: chatInfo.participants,
          lastMessage: chatInfo.lastMessage,
          lastMessageAt: chatInfo.lastMessageAt
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalMessages / limitNum),
          totalMessages,
          hasNext: cursor ? messages.length === limitNum : (parseInt(page) * limitNum) < totalMessages,
          hasPrev: cursor ? Boolean(cursor) : parseInt(page) > 1
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
    const { content, type = 'text', imageUrl = '', confessionId = null } = req.body;

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

    // Check if chat request is pending and user is not the requester
    if (chat.chatRequest && chat.chatRequest.status === 'pending') {
      const isRequester = chat.chatRequest.requestedBy.toString() === req.user._id.toString();
      if (!isRequester) {
        return res.status(403).json({
          status: 'error',
          message: 'Chat request is pending. Please wait for the other user to accept your chat request.'
        });
      }
    }

    // Check if chat request was rejected
    if (chat.chatRequest && chat.chatRequest.status === 'rejected') {
      return res.status(403).json({
        status: 'error',
        message: 'This chat request has been rejected. You cannot send messages.'
      });
    }

    // Insert message into dedicated Message collection
    const message = await Message.create({
      chatId: chat._id,
      senderId: req.user._id,
      text: content,
      type,
      imageUrl,
      confessionId
    });

    // Update chat lastMessage and lastMessageAt without pushing to messages array
    let lastPreview = content;
    if (type === 'confession') {
      lastPreview = 'Shared a confession';
    } else if (type === 'image') {
      lastPreview = 'Sent an image';
    }
    chat.lastMessage = lastPreview;
    chat.lastMessageAt = message.createdAt;
    await chat.save();

    // Check if quiz consent should be triggered (at 15-20 messages)
    // Only trigger if quiz hasn't been asked yet and messages are between 15-20
    // Compute total messages from Message collection for progressive migration
    const totalMessages = await Message.countDocuments({ chatId: chat._id });
    const shouldTriggerQuizConsent = totalMessages >= 15 && totalMessages <= 20 && 
                                     !chat.quizConsent.askedAt && 
                                     chat.quizConsent.user1Consent === null && 
                                     chat.quizConsent.user2Consent === null;
    
    if (shouldTriggerQuizConsent) {
      // Set askedAt timestamp
      chat.quizConsent.askedAt = new Date();
      await chat.save();
      
      // Emit quiz consent request to both users in the chat
      try {
        const { getIO } = require('../utils/socket');
        const io = getIO();
      io.to(`chat:${chatId}`).emit('quiz:consent-request', {
        chatId: chatId,
        messageCount: totalMessages
      });
      } catch (socketError) {
        console.error('Error emitting quiz consent request:', socketError);
      }
    }

    // Emit Socket.io event for real-time updates (for connected users)
    try {
      const { getIO } = require('../utils/socket');
      const io = getIO();
      io.to(`chat:${chatId}`).emit('message:new', {
        id: message._id,
        chatId: chatId,
        content: message.text,
        type: message.type || 'text',
        confessionId: message.confessionId || null,
        sender: {
          id: req.user._id,
          name: req.user.name
        },
        createdAt: message.createdAt,
        timestamp: message.createdAt
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
              content: content.substring(0, 100),
              chatId: chatId,
              senderId: req.user._id.toString(),
              senderAvatar: sender?.profileImage,
              messageId: message._id.toString()
            });
          }
        } catch (notificationError) {
          // Log error but don't fail the message send
          console.error('Error sending push notification:', notificationError);
        }
      });
    }

    // Shape response to keep API unchanged as much as possible
    res.status(201).json({
      status: 'success',
      message: 'Message sent successfully',
      data: {
        message: {
          _id: message._id,
          sender: { _id: req.user._id, name: req.user.name },
          content: message.text,
          type: message.type || 'text',
          imageUrl: message.imageUrl || '',
          confessionId: message.confessionId || null,
          createdAt: message.createdAt,
          timestamp: message.createdAt
        }
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
    // Optimized aggregation to count unread messages without loading all chats into memory
    const result = await Chat.aggregate([
      { 
        $match: { 
          participants: req.user._id, 
          isActive: true 
        } 
      },
      { 
        $project: {
          unreadInChat: {
            $size: {
              $filter: {
                input: "$messages",
                as: "msg",
                cond: {
                  $and: [
                    { $eq: ["$$msg.isRead", false] },
                    { $ne: ["$$msg.sender", req.user._id] }
                  ]
                }
              }
            }
          }
        }
      },
      { 
        $group: { 
          _id: null, 
          totalUnread: { $sum: "$unreadInChat" } 
        } 
      }
    ]);

    const unreadCount = result.length > 0 ? result[0].totalUnread : 0;

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

// @desc    Get quiz consent status
// @route   GET /api/chat/:chatId/quiz-consent
// @access  Private
const getQuizConsent = async (req, res, next) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    // Check if user is a participant
    const isParticipant = chat.participants.some(p => p.toString() === userId.toString());
    if (!isParticipant) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    // Determine which consent field belongs to current user
    const userIndex = chat.participants.findIndex(p => p.toString() === userId.toString());
    const userConsent = userIndex === 0 ? chat.quizConsent.user1Consent : chat.quizConsent.user2Consent;
    const otherUserConsent = userIndex === 0 ? chat.quizConsent.user2Consent : chat.quizConsent.user1Consent;

    res.status(200).json({
      status: 'success',
      data: {
        userConsent: userConsent === null ? undefined : userConsent,
        otherUserConsent: otherUserConsent === null ? undefined : otherUserConsent
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Set quiz consent
// @route   POST /api/chat/:chatId/quiz-consent
// @access  Private
const setQuizConsent = async (req, res, next) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.user._id;
    const { consent } = req.body;

    if (typeof consent !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'Consent must be a boolean value'
      });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    const isParticipant = chat.participants.some(p => p.toString() === userId.toString());
    if (!isParticipant) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    const userIndex = chat.participants.findIndex(p => p.toString() === userId.toString());
    
    if (userIndex === 0) {
      chat.quizConsent.user1Consent = consent;
    } else {
      chat.quizConsent.user2Consent = consent;
    }

    if (!chat.quizConsent.askedAt) {
      chat.quizConsent.askedAt = new Date();
    }

    await chat.save();

    // Emit socket event to notify other user
    const { getIO } = require('../utils/socket');
    const io = getIO();
    const otherUserId = chat.participants[userIndex === 0 ? 1 : 0];
    io.to(`user:${otherUserId}`).emit('quiz:consent-update', {
      chatId: chatId,
      consent: consent,
      userId: userId.toString()
    });

    // If both consented, start quiz simultaneously
    const bothConsented = (chat.quizConsent.user1Consent === true && chat.quizConsent.user2Consent === true);
    if (bothConsented) {
      io.to(`chat:${chatId}`).emit('quiz:start', { chatId });
    }

    res.status(200).json({
      status: 'success',
      message: 'Quiz consent updated',
      data: {
        userConsent: consent,
        bothConsented: (userIndex === 0 ? chat.quizConsent.user2Consent : chat.quizConsent.user1Consent) === true && consent === true
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Submit quiz
// @route   POST /api/chat/:chatId/quiz/submit
// @access  Private
const submitQuiz = async (req, res, next) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.user._id;
    const { answers, score } = req.body;

    if (!answers || typeof score !== 'number') {
      return res.status(400).json({
        status: 'error',
        message: 'Answers and score are required'
      });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    const isParticipant = chat.participants.some(p => p.toString() === userId.toString());
    if (!isParticipant) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    const userIndex = chat.participants.findIndex(p => p.toString() === userId.toString());
    // user is already available in req.user from auth middleware
    const userName = req.user.name;

    if (userIndex === 0) {
      chat.quizScores.user1Score = score;
      chat.quizScores.user1CompletedAt = new Date();
      chat.quizAnswers.user1 = answers;
    } else {
      chat.quizScores.user2Score = score;
      chat.quizScores.user2CompletedAt = new Date();
      chat.quizAnswers.user2 = answers;
    }

    // Calculate compatibility score if both completed
    if (chat.quizScores.user1Score !== null && chat.quizScores.user2Score !== null) {
      // Simple compatibility: average of both scores, or implement matching algorithm
      const avgScore = Math.round((chat.quizScores.user1Score + chat.quizScores.user2Score) / 2);
      chat.compatibilityScore = avgScore;
    }

    await chat.save();

    // Emit socket event to exchange scores with other user
    const { getIO } = require('../utils/socket');
    const io = getIO();
    const otherUserId = chat.participants[userIndex === 0 ? 1 : 0];
    io.to(`chat:${chatId}`).emit('quiz:score', {
      chatId: chatId,
      score: score,
      userName: userName,
      userId: userId.toString()
    });

    // If both answers are present, exchange selections simultaneously
    if (chat.quizAnswers.user1 && chat.quizAnswers.user2 && !chat.quizAnswers.exchangedAt) {
      chat.quizAnswers.exchangedAt = new Date();
      await chat.save();
      
      const [user1, user2] = await Promise.all([
        User.findById(chat.participants[0]).select('name'),
        User.findById(chat.participants[1]).select('name')
      ]);

      io.to(`chat:${chatId}`).emit('quiz:selections', {
        chatId,
        user1: { id: chat.participants[0].toString(), name: user1?.name, answers: chat.quizAnswers.user1, score: chat.quizScores.user1Score },
        user2: { id: chat.participants[1].toString(), name: user2?.name, answers: chat.quizAnswers.user2, score: chat.quizScores.user2Score },
        compatibilityScore: chat.compatibilityScore
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Quiz submitted successfully',
      data: {
        score: score,
        compatibilityScore: chat.compatibilityScore
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Accept chat request
// @route   POST /api/chat/:chatId/accept
// @access  Private
const acceptChatRequest = async (req, res, next) => {
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

    // Check if there's a pending request
    if (!chat.chatRequest || chat.chatRequest.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: 'No pending chat request'
      });
    }

    // Check if current user is the recipient (not the requester)
    const isRequester = chat.chatRequest.requestedBy.toString() === req.user._id.toString();
    if (isRequester) {
      return res.status(400).json({
        status: 'error',
        message: 'You cannot accept your own request'
      });
    }

    // Accept the chat request
    chat.chatRequest.status = 'accepted';
    chat.chatRequest.acceptedAt = new Date();
    await chat.save();

    // Notify requester via Socket.io
    const { getIO } = require('../utils/socket');
    const io = getIO();
    io.to(`user:${chat.chatRequest.requestedBy}`).emit('chat:accepted', {
      chatId: chat._id,
      acceptedBy: req.user._id,
      acceptedByName: req.user.name
    });

    res.status(200).json({
      status: 'success',
      message: 'Chat request accepted',
      data: {
        chat
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reject chat request
// @route   POST /api/chat/:chatId/reject
// @access  Private
const rejectChatRequest = async (req, res, next) => {
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

    // Check if there's a pending request
    if (!chat.chatRequest || chat.chatRequest.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: 'No pending chat request'
      });
    }

    // Reject the chat request
    chat.chatRequest.status = 'rejected';
    chat.chatRequest.rejectedAt = new Date();
    chat.isActive = false; // Deactivate chat on rejection
    await chat.save();

    // Notify requester via Socket.io
    const { getIO } = require('../utils/socket');
    const io = getIO();
    io.to(`user:${chat.chatRequest.requestedBy}`).emit('chat:rejected', {
      chatId: chat._id,
      rejectedBy: req.user._id,
      rejectedByName: req.user.name
    });

    res.status(200).json({
      status: 'success',
      message: 'Chat request rejected',
      data: {
        chat
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
  getUnreadCount,
  getQuizConsent,
  setQuizConsent,
  submitQuiz,
  acceptChatRequest,
  rejectChatRequest
};
