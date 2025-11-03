const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const { authenticateToken } = require('../middlewares/auth');

// Initialize Razorpay
let razorpay;
try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    console.log('✅ Razorpay initialized');
  } else {
    console.warn('⚠️ Razorpay credentials not found - payment features disabled');
  }
} catch (error) {
  console.error('❌ Error initializing Razorpay:', error);
}

/**
 * @desc    Create Razorpay order for premium subscription
 * @route   POST /api/payments/create-order
 * @access  Private
 */
const createOrder = async (req, res, next) => {
  try {
    if (!razorpay) {
      return res.status(503).json({
        status: 'error',
        message: 'Payment service is not available'
      });
    }

    const { amount, currency = 'INR', plan = 'monthly' } = req.body;
    
    // Validate amount (premium plans: 99/month, 299/3months, 499/6months)
    const planAmounts = {
      monthly: 9900, // ₹99 in paise
      quarterly: 8900, // ₹89/month for 3 months (26700 total)
      semiannual: 7900 // ₹79/month for 6 months (47400 total)
    };
    
    const validAmount = planAmounts[plan] || amount;
    
    if (!validAmount || validAmount < 100) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid amount'
      });
    }

    const options = {
      amount: validAmount,
      currency: currency,
      receipt: `premium_${req.user._id}_${Date.now()}`,
      notes: {
        userId: req.user._id.toString(),
        plan: plan,
        userEmail: req.user.email
      }
    };

    const order = await razorpay.orders.create(options);

    res.status(200).json({
      status: 'success',
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    next(error);
  }
};

/**
 * @desc    Verify payment and activate premium
 * @route   POST /api/payments/verify
 * @access  Private
 */
const verifyPayment = async (req, res, next) => {
  try {
    const { orderId, paymentId, signature, plan = 'monthly' } = req.body;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing payment details'
      });
    }

    // Verify payment signature
    const text = `${orderId}|${paymentId}`;
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    if (generatedSignature !== signature) {
      return res.status(400).json({
        status: 'error',
        message: 'Payment verification failed'
      });
    }

    // Get payment details from Razorpay
    const payment = await razorpay.payments.fetch(paymentId);

    if (payment.status !== 'authorized' && payment.status !== 'captured') {
      return res.status(400).json({
        status: 'error',
        message: 'Payment not successful'
      });
    }

    // Calculate premium expiry date
    const planDurations = {
      monthly: 30,
      quarterly: 90,
      semiannual: 180
    };
    
    const days = planDurations[plan] || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    // Update user premium status
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        isPremium: true,
        premiumExpiresAt: expiresAt,
        razorpaySubscriptionId: payment.subscription_id || null,
        razorpayCustomerId: payment.customer_id || null
      },
      { new: true }
    );

    // Emit premium activation event via Socket.io
    const { getIO } = require('../utils/socket');
    const io = getIO();
    io.to(`user:${req.user._id}`).emit('premium:activated', {
      expiresAt: expiresAt,
      plan: plan
    });

    res.status(200).json({
      status: 'success',
      message: 'Premium subscription activated successfully',
      data: {
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
        plan: plan
      }
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    next(error);
  }
};

/**
 * @desc    Get premium status
 * @route   GET /api/payments/premium-status
 * @access  Private
 */
const getPremiumStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('isPremium premiumExpiresAt');

    // Check if premium has expired
    if (user.isPremium && user.premiumExpiresAt && new Date() > user.premiumExpiresAt) {
      await User.findByIdAndUpdate(req.user._id, {
        isPremium: false,
        premiumExpiresAt: null
      });
      user.isPremium = false;
      user.premiumExpiresAt = null;
    }

    res.status(200).json({
      status: 'success',
      data: {
        isPremium: user.isPremium || false,
        premiumExpiresAt: user.premiumExpiresAt,
        isExpired: user.premiumExpiresAt && new Date() > user.premiumExpiresAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Webhook handler for Razorpay events
 * @route   POST /api/payments/webhook
 * @access  Public (Razorpay IP whitelist recommended)
 */
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.warn('⚠️ Razorpay webhook secret not configured');
      return res.status(200).json({ received: true });
    }

    // Verify webhook signature
    const text = JSON.stringify(req.body);
    const generatedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(text)
      .digest('hex');

    if (generatedSignature !== signature) {
      console.error('❌ Invalid webhook signature');
      return res.status(400).json({
        status: 'error',
        message: 'Invalid signature'
      });
    }

    const event = req.body.event;
    const payment = req.body.payload.payment?.entity;

    // Handle payment events
    if (event === 'payment.captured' || event === 'payment.authorized') {
      if (payment && payment.notes && payment.notes.userId) {
        const userId = payment.notes.userId;
        const plan = payment.notes.plan || 'monthly';

        // Calculate premium expiry
        const planDurations = {
          monthly: 30,
          quarterly: 90,
          semiannual: 180
        };
        const days = planDurations[plan] || 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);

        await User.findByIdAndUpdate(userId, {
          isPremium: true,
          premiumExpiresAt: expiresAt,
          razorpaySubscriptionId: payment.subscription_id || null,
          razorpayCustomerId: payment.customer_id || null
        });

        // Emit premium activation event
        const { getIO } = require('../utils/socket');
        const io = getIO();
        io.to(`user:${userId}`).emit('premium:activated', {
          expiresAt: expiresAt,
          plan: plan
        });
      }
    }

    // Handle subscription cancellation
    if (event === 'subscription.cancelled') {
      const subscription = req.body.payload.subscription?.entity;
      if (subscription && subscription.notes && subscription.notes.userId) {
        const userId = subscription.notes.userId;
        await User.findByIdAndUpdate(userId, {
          isPremium: false,
          premiumExpiresAt: null
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    next(error);
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getPremiumStatus,
  handleWebhook
};

