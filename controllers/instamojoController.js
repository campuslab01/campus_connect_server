const axios = require('axios');
const User = require('../models/User');
const { logError } = require('../utils/logger');

const IM_API_KEY = process.env.IM_API_KEY;
const IM_AUTH_TOKEN = process.env.IM_AUTH_TOKEN;
const IM_ENDPOINT = process.env.IM_ENDPOINT || 'https://test.instamojo.com/api/1.1/';

const headers = {
  'X-Api-Key': IM_API_KEY || '',
  'X-Auth-Token': IM_AUTH_TOKEN || ''
};

exports.createPaymentRequest = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Authentication required' });
    }

    const { amount = 99, plan = 'monthly', redirect_url } = req.body || {};
    const currency = 'INR';

    if (!IM_API_KEY || !IM_AUTH_TOKEN) {
      return res.status(503).json({ status: 'error', message: 'Payment service not configured' });
    }

    const payload = {
      amount: String(amount),
      purpose: `Premium Subscription - ${plan} - user:${req.user._id?.toString()}`,
      currency,
      buyer_name: req.user.name || 'User',
      email: req.user.email || undefined,
      allow_repeated_payments: false,
      redirect_url: redirect_url || (process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/payment/callback` : undefined),
      webhook: process.env.SERVER_PUBLIC_URL ? `${process.env.SERVER_PUBLIC_URL}/api/payment/webhook` : undefined
    };

    const url = IM_ENDPOINT.endsWith('/') ? `${IM_ENDPOINT}payment-requests/` : `${IM_ENDPOINT}/payment-requests/`;
    const { data } = await axios.post(url, payload, { headers, timeout: 20000 });

    if (!data || !data.success) {
      return res.status(400).json({ status: 'error', message: data?.message || 'Failed to create payment request' });
    }

    const pr = data.payment_request;
    return res.status(200).json({ status: 'success', data: { longurl: pr.longurl, id: pr.id } });
  } catch (error) {
    logError('Instamojo create payment error', error);
    next(error);
  }
};

exports.handleWebhook = async (req, res, next) => {
  try {
    // Instamojo sends form-encoded body by default; ensure express can parse it
    const payload = req.body || {};
    const status = payload.status;
    // Extract userId from purpose string ("... user:<id>")
    let userId = null;
    if (typeof payload.purpose === 'string') {
      const match = payload.purpose.match(/user:([a-f0-9]{24})/i);
      if (match) userId = match[1];
    }

    // Basic success check
    if (status === 'Credit') {
      const plan = (payload?.purpose?.toLowerCase().includes('quarter')) ? 'quarterly' : (payload?.purpose?.toLowerCase().includes('semi') ? 'semiannual' : 'monthly');
      const days = { monthly: 30 }[plan] || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);

      if (userId) {
        const user = await User.findById(userId).catch(() => null);
        if (user) {
          user.isPremium = true;
          user.premiumExpiresAt = expiresAt;
          await user.save();
        }
      }
    }
    res.status(200).json({ received: true });
  } catch (error) {
    logError('Instamojo webhook error', error);
    next(error);
  }
};

exports.getPremiumStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const active = Boolean(user?.isPremium && user?.premiumExpiresAt && new Date(user.premiumExpiresAt) > new Date());
    res.status(200).json({ status: 'success', active });
  } catch (error) {
    next(error);
  }
};