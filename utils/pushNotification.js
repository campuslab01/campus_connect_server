const NotificationToken = require('../models/NotificationToken');
const admin = require('firebase-admin');

/**
 * Send push notification to a user
 * @param {string} userId - MongoDB user ID
 * @param {object} notification - Notification payload
 * @param {string} notification.title - Notification title
 * @param {string} notification.body - Notification body
 * @param {object} notification.data - Additional data
 * @param {string} notification.image - Optional image URL
 */
const sendPushNotification = async (userId, notification) => {
  try {
    // Check if Firebase Admin is initialized
    if (!admin.apps.length) {
      console.warn('Firebase Admin not initialized - skipping push notification');
      return { success: false, reason: 'Firebase Admin not initialized' };
    }

    // Get user's active FCM tokens
    const tokens = await NotificationToken.find({
      user: userId,
      isActive: true
    }).select('token');

    if (tokens.length === 0) {
      console.warn(`[FCM] No active tokens found for user ${userId}. Skipping send.`);
      return { success: false, reason: 'No active tokens found' };
    }

    const fcmTokens = tokens.map(t => t.token);

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        image: notification.image || undefined
      },
      data: {
        ...notification.data,
        timestamp: new Date().toISOString()
      },
      tokens: fcmTokens,
      webpush: {
        notification: {
          title: notification.title,
          body: notification.body,
          icon: notification.icon || '/images/login.jpeg',
          badge: '/images/login.jpeg',
          image: notification.image,
          requireInteraction: true,
          vibrate: [200, 100, 200]
        }
      }
    };

    console.log(`[FCM] Sending push to ${fcmTokens.length} token(s) for user ${userId}. Title: ${notification.title}`);
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[FCM] sendEachForMulticast result: success=${response.successCount}, failure=${response.failureCount}`);

    // Remove invalid tokens
    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          console.warn(`[FCM] Token send failed for token index ${idx}: ${resp.error?.message || 'unknown error'}`);
          invalidTokens.push(fcmTokens[idx]);
        }
      });

      if (invalidTokens.length > 0) {
        await NotificationToken.updateMany(
          { token: { $in: invalidTokens } },
          { isActive: false }
        );
        console.warn(`[FCM] Deactivated ${invalidTokens.length} invalid token(s) for user ${userId}.`);
      }
    }

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  } catch (error) {
    console.error('Error sending push notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification when new message is received
 */
const sendMessageNotification = async (userId, messageData) => {
  return sendPushNotification(userId, {
    title: messageData.senderName || 'New Message',
    body: messageData.content || 'You have a new message',
    image: messageData.senderAvatar,
    data: {
      type: 'message',
      chatId: messageData.chatId,
      messageId: messageData.messageId,
      senderId: messageData.senderId
    },
    icon: messageData.senderAvatar
  });
};

/**
 * Send notification when user gets a new match
 */
const sendMatchNotification = async (userId, matchData) => {
  return sendPushNotification(userId, {
    title: 'New Match! 💕',
    body: `You and ${matchData.userName} liked each other!`,
    image: matchData.userAvatar,
    data: {
      type: 'match',
      matchId: matchData.matchId,
      userId: matchData.userId
    },
    icon: matchData.userAvatar
  });
};

/**
 * Send notification when user gets a new like
 */
const sendLikeNotification = async (userId, likeData) => {
  return sendPushNotification(userId, {
    title: 'Someone likes you! ❤️',
    body: `${likeData.userName} liked your profile`,
    image: likeData.userAvatar,
    data: {
      type: 'like',
      userId: likeData.userId
    },
    icon: likeData.userAvatar
  });
};

/**
 * Send notification for confession updates
 */
const sendConfessionNotification = async (userId, confessionData) => {
  return sendPushNotification(userId, {
    title: confessionData.title || 'New Confession Activity',
    body: confessionData.body,
    data: {
      type: 'confession',
      confessionId: confessionData.confessionId,
      action: confessionData.action // 'like', 'comment', 'reply'
    }
  });
};

/**
 * Send welcome notification after registration
 */
const sendWelcomeNotification = async (userId, userName) => {
  return sendPushNotification(userId, {
    title: 'Welcome to Campus Connection! 🎉',
    body: `Hi ${userName}, thanks for joining! Start connecting with students around you.`,
    data: {
      type: 'welcome',
      userId: userId.toString(),
      timestamp: new Date().toISOString()
    },
    image: undefined // Can add app logo later
  });
};

module.exports = {
  sendPushNotification,
  sendMessageNotification,
  sendMatchNotification,
  sendLikeNotification,
  sendConfessionNotification,
  sendWelcomeNotification,
  /**
   * Send notification for new chat request
   */
  sendChatRequestNotification: async (userId, requestData) => {
    return sendPushNotification(userId, {
      title: 'New chat request 💬',
      body: `${requestData.requesterName || 'Someone'} wants to chat with you`,
      image: requestData.requesterAvatar,
      data: {
        type: 'chat_request',
        chatId: requestData.chatId,
        requesterId: requestData.requesterId
      },
      icon: requestData.requesterAvatar
    });
  }
};
