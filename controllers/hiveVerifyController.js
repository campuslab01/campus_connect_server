const axios = require('axios');
const User = require('../models/User');
const { logError } = require('../utils/logger');
const hive = require('../services/hiveService');

exports.verifySelfie = async (req, res, next) => {
  try {
    if (!(process.env.HIVE_API_KEY || process.env.HIVE_SECRET_KEY)) {
      return res.status(503).json({ status: 'error', message: 'Hive API not configured' });
    }

    const selfieFile = (req.files?.selfie && req.files.selfie[0]) || null;
    const profileFile = (req.files?.profile && req.files.profile[0]) || null;
    const profileImageUrl = req.body?.profileImageUrl || null;

    if (!selfieFile) {
      return res.status(400).json({ status: 'error', message: 'Selfie image required' });
    }

    if (profileFile || profileImageUrl) {
      return res.status(403).json({ status: 'error', message: 'Profile image override not allowed' });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const selfieType = String(selfieFile.mimetype || '').toLowerCase();
    const selfieSize = typeof selfieFile.size === 'number' ? selfieFile.size : (selfieFile.buffer ? selfieFile.buffer.length : 0);
    if (!allowedTypes.includes(selfieType)) {
      return res.status(400).json({ status: 'error', message: 'Invalid selfie image type' });
    }
    if (!selfieSize || selfieSize <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid selfie image' });
    }

    let profileBuffer = null;
    if (req.user?.profileImage) {
      const resp = await axios.get(req.user.profileImage, { responseType: 'arraybuffer', timeout: 15000 });
      profileBuffer = Buffer.from(resp.data);
    }

    if (!profileBuffer) {
      return res.status(400).json({ status: 'error', message: 'Profile image not found' });
    }

    if (!profileBuffer.length) {
      return res.status(400).json({ status: 'error', message: 'Invalid profile image' });
    }

    const selfieBase64 = selfieFile.buffer.toString('base64');
    const profileBase64 = profileBuffer.toString('base64');

    const selfieDetect = await hive.detectFace(selfieBase64);
    const profileDetect = await hive.detectFace(profileBase64);
    const countFaces = (d) => {
      if (!d) return 0;
      if (Array.isArray(d.faces)) return d.faces.length;
      const frames = d.frames || (d.status && Array.isArray(d.status) ? d.status[0]?.response?.frames : null);
      if (Array.isArray(frames) && frames.length > 0) {
        const faces = frames[0]?.faces;
        if (Array.isArray(faces)) return faces.length;
      }
      const output = d.output;
      if (Array.isArray(output) && output.length > 0) {
        const first = output[0];
        if (Array.isArray(first?.bounding_poly)) return first.bounding_poly.length;
      }
      return 0;
    };

    const selfieFaces = countFaces(selfieDetect);
    const profileFaces = countFaces(profileDetect);
    if (selfieFaces === 0) {
      return res.status(400).json({ status: 'error', message: 'Face not detected in selfie' });
    }
    if (profileFaces === 0) {
      return res.status(400).json({ status: 'error', message: 'Face not detected in profile image' });
    }
    if (selfieFaces > 1) {
      return res.status(400).json({ status: 'error', message: 'Multiple faces detected in selfie' });
    }
    if (profileFaces > 1) {
      return res.status(400).json({ status: 'error', message: 'Multiple faces detected in profile image' });
    }

    const resp = await hive.verifyFaces(selfieBase64, profileBase64);
    const extractSimilarity = (r) => {
      if (typeof r?.similarity_score === 'number') return r.similarity_score;
      if (typeof r?.confidence === 'number') return r.confidence;
      if (typeof r?.score === 'number') return r.score;
      const meta = r?.status?.[0]?.response?.frames?.[0]?.faces?.[0]?.meta;
      if (meta && typeof meta.similarity_score === 'number') return meta.similarity_score;
      return null;
    };
    const similarityRaw = extractSimilarity(resp);
    if (typeof similarityRaw !== 'number') {
      return res.status(422).json({ status: 'error', message: 'Verification failed — please retry' });
    }
    const fractionScore = similarityRaw > 1 ? similarityRaw / 100 : similarityRaw;
    const percentScore = Math.round(fractionScore * 100);
    const threshold = 0.75;
    const verified = fractionScore >= threshold;

    const user = await User.findById(req.user._id);
    user.isVerified = verified;
    user.faceMatchScore = percentScore;
    user.lastFaceVerificationAt = new Date();
    if (verified) {
      user.verifiedAt = new Date();
      user.verified = true;
    }
    await user.save();

    return res.status(200).json({ status: 'success', verified, score: fractionScore, threshold });
  } catch (error) {
    const providerStatus = error?.response?.status;
    const providerData = error?.response?.data;
    logError('Hive verify error', { status: providerStatus, data: providerData });
    if (error.response) {
      const status = error.response.status;
      const providerMessage = error.response.data?.message || '';
      let message = 'Verification failed — please retry';
      if (/face/i.test(providerMessage) && /not/i.test(providerMessage)) message = 'Face not detected';
      if (/invalid/i.test(providerMessage) && /image/i.test(providerMessage)) message = 'Invalid selfie image';
      return res.status(status).json({ status: 'error', message });
    }
    next(error);
  }
};