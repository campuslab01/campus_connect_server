const axios = require('axios');
const User = require('../models/User');
const { logError } = require('../utils/logger');
const hive = require('../services/hiveService');

exports.verifySelfie = async (req, res, next) => {
  try {
    if (!process.env.HIVE_API_KEY) {
      return res.status(503).json({ status: 'error', message: 'Hive API not configured' });
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

    const selfieBase64 = selfieFile.buffer.toString('base64');
    const profileBase64 = profileBuffer.toString('base64');
    const resp = await hive.verifyFaces(selfieBase64, profileBase64);

    const score = typeof resp.confidence === 'number' ? resp.confidence : (typeof resp.score === 'number' ? resp.score : 0);
    const threshold = 0.85;
    const verified = Number(score) >= threshold;

    const user = await User.findById(req.user._id);
    user.isVerified = verified;
    user.faceMatchScore = Math.round(Number(score) * 100);
    user.lastFaceVerificationAt = new Date();
    await user.save();

    return res.status(200).json({ status: 'success', verified, score: Number(score), threshold });
  } catch (error) {
    logError('Hive verify error', error);
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || 'Verification provider error';
      return res.status(status).json({ status: 'error', message });
    }
    next(error);
  }
};