const axios = require('axios');
const User = require('../models/User');
const { logError } = require('../utils/logger');

const BANUBA_API_KEY = process.env.BANUBA_API_KEY;
const BANUBA_CLIENT_TOKEN = process.env.BANUBA_CLIENT_TOKEN;
const BANUBA_SECRET_KEY = process.env.BANUBA_SECRET_KEY;
const BANUBA_BASE_URL = process.env.BANUBA_BASE_URL || 'https://api.banuba.com/face/verification';

exports.verify = async (req, res, next) => {
  try {
    if (!BANUBA_API_KEY || !BANUBA_CLIENT_TOKEN || !BANUBA_SECRET_KEY) {
      return res.status(503).json({ status: 'error', message: 'Banuba API not configured' });
    }

    const selfieFile = (req.files?.selfie && req.files.selfie[0]) || null;
    const profileFile = (req.files?.profile && req.files.profile[0]) || null;
    const profileImageUrl = req.body?.profileImageUrl || null;

    if (!selfieFile) {
      return res.status(400).json({ status: 'error', message: 'Selfie image required' });
    }

    let profileBuffer = null;
    if (profileFile) {
      profileBuffer = profileFile.buffer;
    } else if (profileImageUrl) {
      const resp = await axios.get(profileImageUrl, { responseType: 'arraybuffer', timeout: 15000 });
      profileBuffer = Buffer.from(resp.data);
    } else if (req.user?.profileImage) {
      const resp = await axios.get(req.user.profileImage, { responseType: 'arraybuffer', timeout: 15000 });
      profileBuffer = Buffer.from(resp.data);
    }

    if (!profileBuffer) {
      return res.status(400).json({ status: 'error', message: 'Profile image not found' });
    }

    const payload = {
      selfie: selfieFile.buffer.toString('base64'),
      profile: profileBuffer.toString('base64'),
    };

    const headers = {
      'x-api-key': BANUBA_API_KEY,
      'x-client-token': BANUBA_CLIENT_TOKEN,
      'x-secret-key': BANUBA_SECRET_KEY,
      'Content-Type': 'application/json'
    };

    const resp = await axios.post(BANUBA_BASE_URL, payload, { headers, timeout: 20000 });
    const data = resp.data || {};
    const score = typeof data.score === 'number' ? Math.round(data.score) : (typeof data.similarity === 'number' ? Math.round(data.similarity) : 0);
    const threshold = 85;
    const verified = score >= threshold;

    const user = await User.findById(req.user._id);
    user.isVerified = verified;
    user.faceMatchScore = score;
    user.lastFaceVerificationAt = new Date();
    await user.save();

    return res.status(200).json({ status: 'success', verified, score, threshold });
  } catch (error) {
    logError('Banuba verify error', error);
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || 'Verification provider error';
      return res.status(status).json({ status: 'error', message });
    }
    next(error);
  }
};