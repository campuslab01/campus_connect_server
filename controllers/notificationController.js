const NotificationToken = require('../models/NotificationToken');
const admin = require('firebase-admin');

// Initialize Firebase Admin (if not already initialized)
// TODO: Replace with your Firebase Admin SDK service account key
let firebaseAdminInitialized = false;

const initializeFirebaseAdmin = () => {
  if (firebaseAdminInitialized) return;

  try {
    // Option 1: Use service account key file
    // const serviceAccount = require('../path/to/serviceAccountKey.json');
    // admin.initializeApp({
    //   credential: admin.credential.cert(serviceAccount)
    // });

    // Option 2: Use environment variables (recommended for production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      firebaseAdminInitialized = true;
      console.log('Firebase Admin initialized');
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      // Option 3: Use file path
      const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      firebaseAdminInitialized = true;
      console.log('Firebase Admin initialized from file');
    } else {
      console.warn('Firebase Admin not initialized - FCM token storage only');
    }
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
  }
};

// Initialize on module load
initializeFirebaseAdmin();

// @desc    Save/Update FCM token
// @route   POST /api/notifications/token
// @access  Private
const saveToken = async (req, res, next) => {
  try {
    const { token, platform = 'web', deviceInfo } = req.body;

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'FCM token is required'
      });
    }

    // Check if token already exists
    const existingToken = await NotificationToken.findOne({ token });

    if (existingToken) {
      // Update existing token
      existingToken.user = req.user._id;
      existingToken.lastUsed = new Date();
      existingToken.isActive = true;
      if (deviceInfo) {
        existingToken.deviceInfo = deviceInfo;
      }
      await existingToken.save();

      return res.status(200).json({
        status: 'success',
        message: 'FCM token updated successfully'
      });
    }

    // Create new token
    await NotificationToken.create({
      user: req.user._id,
      token,
      platform,
      deviceInfo: deviceInfo || {
        userAgent: req.headers['user-agent'],
        language: req.headers['accept-language']
      }
    });

    // Send welcome notification if this is a new token (first time allowing notifications)
    // This ensures user gets welcome notification even if registration happened before permission popup
    setImmediate(async () => {
      try {
        const User = require('../models/User');
        const user = await User.findById(req.user._id).select('name createdAt');
        
        // Only send welcome notification if user was created recently (within last 5 minutes)
        // This helps identify new registrations
        const userAge = Date.now() - new Date(user.createdAt).getTime();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (userAge < fiveMinutes) {
          const { sendWelcomeNotification } = require('../utils/pushNotification');
          await sendWelcomeNotification(req.user._id, user.name);
          console.log(`✅ Welcome notification sent to user: ${user.name}`);
        }
      } catch (notificationError) {
        console.error('Error sending welcome notification after token save:', notificationError);
      }
    });

    res.status(201).json({
      status: 'success',
      message: 'FCM token saved successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove FCM token
// @route   DELETE /api/notifications/token/:token
// @access  Private
const removeToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    await NotificationToken.findOneAndUpdate(
      { token, user: req.user._id },
      { isActive: false }
    );

    res.status(200).json({
      status: 'success',
      message: 'FCM token removed successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send push notification to user
// @route   POST /api/notifications/send
// @access  Private (should be restricted to admin or internal use)
const sendNotification = async (req, res, next) => {
  try {
    if (!firebaseAdminInitialized) {
      return res.status(503).json({
        status: 'error',
        message: 'Firebase Admin not initialized'
      });
    }

    const { userId, title, body, data, image } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({
        status: 'error',
        message: 'userId, title, and body are required'
      });
    }

    // Get user's active tokens
    const tokens = await NotificationToken.find({
      user: userId,
      isActive: true
    }).select('token');

    if (tokens.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No active FCM tokens found for user'
      });
    }

    const fcmTokens = tokens.map(t => t.token);

    const message = {
      notification: {
        title,
        body,
        image: image || undefined
      },
      data: data || {},
      tokens: fcmTokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    res.status(200).json({
      status: 'success',
      message: 'Notification sent successfully',
      data: {
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  saveToken,
  removeToken,
  sendNotification
};
