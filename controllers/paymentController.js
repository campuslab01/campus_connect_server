const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const { authenticateToken } = require('../middlewares/auth');

// Initialize Razorpay
let razorpay;
try {
  console.log('🔧 [PAYMENT] Initializing Razorpay...');
  console.log('   RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? `${process.env.RAZORPAY_KEY_ID.substring(0, 10)}...` : 'NOT SET');
  console.log('   RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? 'SET' : 'NOT SET');
  
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    console.log('✅ [PAYMENT] Razorpay initialized successfully');
  } else {
    console.warn('⚠️ [PAYMENT] Razorpay credentials not found - payment features disabled');
    if (!process.env.RAZORPAY_KEY_ID) {
      console.warn('   Missing: RAZORPAY_KEY_ID');
    }
    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.warn('   Missing: RAZORPAY_KEY_SECRET');
    }
  }
} catch (error) {
  console.error('❌ [PAYMENT] Error initializing Razorpay:');
  console.error('   Error message:', error.message);
  console.error('   Error stack:', error.stack);
}

/**
 * @desc    Create Razorpay order for premium subscription
 * @route   POST /api/payments/create-order
 * @access  Private
 */
const createOrder = async (req, res, next) => {
  try {
    console.log('💳 [PAYMENT] Creating order request received');
    console.log('   User ID:', req.user?._id || 'NOT SET');
    console.log('   User authenticated:', !!req.user);
    console.log('   Request body:', { 
      amount: req.body.amount || 'NOT SET',
      currency: req.body.currency || 'NOT SET',
      plan: req.body.plan || 'NOT SET'
    });

    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      console.error('❌ [PAYMENT] User not authenticated');
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    // Check Razorpay initialization
    if (!razorpay) {
      console.error('❌ [PAYMENT] Razorpay not initialized');
      console.error('   RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? 'SET' : 'NOT SET');
      console.error('   RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? 'SET' : 'NOT SET');
      return res.status(503).json({
        status: 'error',
        message: 'Payment service is not available'
      });
    }

    console.log('✅ [PAYMENT] Razorpay initialized successfully');

    const { amount, currency = 'INR', plan = 'monthly' } = req.body;
    
    console.log(`📋 [PAYMENT] Processing plan: ${plan}, currency: ${currency}, amount: ${amount || 'NOT PROVIDED'}`);
    
    // Validate plan and amount (premium plans: 99/month, 267/3months, 474/6months)
    const planAmounts = {
      monthly: 9900, // ₹99 in paise
      quarterly: 26700, // ₹267 total for 3 months (₹89/month)
      semiannual: 47400 // ₹474 total for 6 months (₹79/month)
    };
    
    // Validate plan
    if (!plan || !planAmounts.hasOwnProperty(plan)) {
      console.error(`❌ [PAYMENT] Invalid plan: ${plan}`);
      console.error(`   Valid plans are: ${Object.keys(planAmounts).join(', ')}`);
      return res.status(400).json({
        status: 'error',
        message: `Invalid plan. Valid plans are: ${Object.keys(planAmounts).join(', ')}`,
        validPlans: Object.keys(planAmounts)
      });
    }
    
    // Get amount from plan or use provided amount
    const validAmount = planAmounts[plan] || amount;
    
    console.log(`💰 [PAYMENT] Calculated amount: ${validAmount} paise (₹${validAmount / 100})`);
    
    if (!validAmount || validAmount < 100) {
      console.error(`❌ [PAYMENT] Invalid amount: ${validAmount}`);
      console.error(`   Plan: ${plan}, Plan amount: ${planAmounts[plan]}, Provided amount: ${amount}`);
      return res.status(400).json({
        status: 'error',
        message: `Invalid amount: ${validAmount}. Minimum amount is 100 paise (₹1)`,
        plan: plan,
        expectedAmount: planAmounts[plan]
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

    console.log(`🔄 [PAYMENT] Creating Razorpay order with options:`, {
      amount: options.amount,
      currency: options.currency,
      receipt: options.receipt,
      plan: options.notes.plan
    });

    let order;
    try {
      order = await razorpay.orders.create(options);
      console.log(`✅ [PAYMENT] Razorpay order created successfully:`, {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        status: order.status
      });
    } catch (razorpayError) {
      console.error('❌ [PAYMENT] Razorpay API error:');
      console.error('   Error:', razorpayError);
      if (razorpayError.error) {
        console.error('   Razorpay error details:', razorpayError.error);
      }
      return res.status(400).json({
        status: 'error',
        message: razorpayError.error?.description || razorpayError.message || 'Failed to create payment order',
        error: razorpayError.error || razorpayError.message
      });
    }

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
    console.error('❌ [PAYMENT] Error creating Razorpay order:');
    console.error('   Error message:', error.message);
    console.error('   Error code:', error.code);
    console.error('   Error stack:', error.stack);
    if (error.error) {
      console.error('   Razorpay error:', error.error);
    }
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
    console.log('🔍 [PAYMENT] Verifying payment request received');
    console.log('   User ID:', req.user?._id || 'NOT SET');
    console.log('   Request body:', {
      orderId: req.body.orderId ? `${req.body.orderId.substring(0, 20)}...` : 'NOT SET',
      paymentId: req.body.paymentId ? `${req.body.paymentId.substring(0, 20)}...` : 'NOT SET',
      signature: req.body.signature ? 'SET' : 'NOT SET',
      plan: req.body.plan || 'NOT SET'
    });

    const { orderId, paymentId, signature, plan = 'monthly' } = req.body;

    if (!orderId || !paymentId || !signature) {
      console.error('❌ [PAYMENT] Missing payment details');
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

    console.log(`🔐 [PAYMENT] Verifying signature...`);
    console.log(`   Generated: ${generatedSignature.substring(0, 20)}...`);
    console.log(`   Received: ${signature.substring(0, 20)}...`);

    if (generatedSignature !== signature) {
      console.error('❌ [PAYMENT] Signature verification failed');
      return res.status(400).json({
        status: 'error',
        message: 'Payment verification failed'
      });
    }

    console.log('✅ [PAYMENT] Signature verified successfully');

    // Get payment details from Razorpay
    console.log(`📥 [PAYMENT] Fetching payment details from Razorpay...`);
    const payment = await razorpay.payments.fetch(paymentId);

    console.log(`📊 [PAYMENT] Payment details:`, {
      paymentId: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency
    });

    if (payment.status !== 'authorized' && payment.status !== 'captured') {
      console.error(`❌ [PAYMENT] Payment not successful. Status: ${payment.status}`);
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

    console.log(`⏰ [PAYMENT] Premium expires at: ${expiresAt.toISOString()}`);

    // Update user premium status
    console.log(`💾 [PAYMENT] Updating user premium status...`);
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

    console.log(`✅ [PAYMENT] User premium status updated:`, {
      userId: user._id,
      isPremium: user.isPremium,
      premiumExpiresAt: user.premiumExpiresAt
    });

    // Emit premium activation event via Socket.io
    try {
      const { getIO } = require('../utils/socket');
      const io = getIO();
      io.to(`user:${req.user._id}`).emit('premium:activated', {
        expiresAt: expiresAt,
        plan: plan
      });
      console.log(`📡 [PAYMENT] Premium activation event emitted`);
    } catch (socketError) {
      console.warn('⚠️ [PAYMENT] Failed to emit socket event:', socketError.message);
    }

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
    console.error('❌ [PAYMENT] Error verifying payment:');
    console.error('   Error message:', error.message);
    console.error('   Error code:', error.code);
    console.error('   Error stack:', error.stack);
    if (error.error) {
      console.error('   Razorpay error:', error.error);
    }
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

