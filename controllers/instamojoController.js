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

    // Try primary endpoint, then fallback to production endpoint if DNS fails
    const candidates = [];
    const primary = IM_ENDPOINT && IM_ENDPOINT.trim().length > 0 ? IM_ENDPOINT.trim() : 'https://test.instamojo.com/api/1.1/';
    candidates.push(primary);
    if (!/instamojo\.com\/api\/1\.1\/?$/.test(primary)) {
      candidates.push('https://test.instamojo.com/api/1.1/');
    }
    candidates.push('https://www.instamojo.com/api/1.1/');

    let data;
    let lastErr;
    for (const base of candidates) {
      try {
        const url = base.endsWith('/') ? `${base}payment-requests/` : `${base}/payment-requests/`;
        const resp = await axios.post(url, payload, { headers, timeout: 20000 });
        data = resp.data;
        break;
      } catch (err) {
        lastErr = err;
        const code = err?.code || err?.response?.status;
        const msg = err?.message || err?.response?.data?.message;
        // Retry only for DNS/network errors
        if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNREFUSED') {
          continue;
        }
        // For auth errors, stop and return
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          return res.status(502).json({ status: 'error', message: 'Payment gateway authentication failed. Check IM_API_KEY/IM_AUTH_TOKEN.' });
        }
        // Otherwise try next, but if none left we'll handle below
        continue;
      }
    }

    if (!data) {
      const code = lastErr?.code || lastErr?.response?.status;
      const msg = lastErr?.response?.data?.message || lastErr?.message || 'Failed to reach Instamojo';
      const isDns = code === 'ENOTFOUND' || code === 'EAI_AGAIN';
      return res.status(isDns ? 502 : 500).json({ status: 'error', message: isDns ? 'Instamojo DNS resolution failed. Please retry or use production endpoint.' : msg });
    }
    if (!data.success) {
      const apiMsg = data?.message || 'Failed to create payment request';
      return res.status(400).json({ status: 'error', message: apiMsg });
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