const axios = require('axios');
const FormData = require('form-data');
const User = require('../models/User');
const { logError } = require('../utils/logger');

const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;
const FACEPP_COMPARE_URL = 'https://api-us.faceplusplus.com/facepp/v3/compare';
const FACEPP_DETECT_URL = 'https://api-us.faceplusplus.com/facepp/v3/detect';

exports.verifyFace = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Selfie image is required.' });
    }

    const user = req.user; // User from authenticateToken middleware
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const profileImageUrl = req.body?.profileImageUrl || user.profileImage;
    if (!profileImageUrl) {
      return res.status(400).json({ message: 'User profile image not found for comparison.' });
    }

    // Step 1: Detect face token from selfie (image_file)
    const detectSelfie = new FormData();
    detectSelfie.append('api_key', FACEPP_API_KEY);
    detectSelfie.append('api_secret', FACEPP_API_SECRET);
    detectSelfie.append('image_file', req.file.buffer, { filename: req.file.originalname });
    const selfieResp = await axios.post(FACEPP_DETECT_URL, detectSelfie, {
      headers: { ...detectSelfie.getHeaders() },
      timeout: 15000
    });
    const selfieFaces = selfieResp.data?.faces || [];
    if (!selfieFaces.length) {
      return res.status(400).json({ message: 'No face detected in selfie. Please retake with better lighting and full face visible.' });
    }
    const faceToken1 = selfieFaces[0]?.face_token;

    // Step 2: Detect face token from profile image
    let usedFile2 = false;
    let faceToken2 = null;
    try {
      const imgResp = await axios.get(profileImageUrl, { responseType: 'arraybuffer', timeout: 15000 });
      const buf = Buffer.from(imgResp.data);
      const detectProfile = new FormData();
      detectProfile.append('api_key', FACEPP_API_KEY);
      detectProfile.append('api_secret', FACEPP_API_SECRET);
      detectProfile.append('image_file', buf, { filename: 'profile.jpg' });
      const profileResp = await axios.post(FACEPP_DETECT_URL, detectProfile, {
        headers: { ...detectProfile.getHeaders() },
        timeout: 15000
      });
      const profileFaces = profileResp.data?.faces || [];
      if (profileFaces.length) {
        faceToken2 = profileFaces[0]?.face_token;
        usedFile2 = true;
      }
    } catch (e) {
      // fallback to URL detect
      const detectProfileUrl = new URLSearchParams();
      detectProfileUrl.append('api_key', FACEPP_API_KEY);
      detectProfileUrl.append('api_secret', FACEPP_API_SECRET);
      detectProfileUrl.append('image_url', profileImageUrl);
      const profileResp = await axios.post(FACEPP_DETECT_URL, detectProfileUrl, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      });
      const profileFaces = profileResp.data?.faces || [];
      if (profileFaces.length) {
        faceToken2 = profileFaces[0]?.face_token;
      }
    }

    if (!faceToken2) {
      return res.status(400).json({ message: 'No face detected in profile image. Please upload a clear front-facing photo.' });
    }

    // Step 3: Compare face tokens
    const compareParams = new URLSearchParams();
    compareParams.append('api_key', FACEPP_API_KEY);
    compareParams.append('api_secret', FACEPP_API_SECRET);
    compareParams.append('face_token1', faceToken1);
    compareParams.append('face_token2', faceToken2);
    const response = await axios.post(FACEPP_COMPARE_URL, compareParams, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000
    });

    const { confidence, thresholds } = response.data;
    const recommendedThreshold = thresholds?.['1e-4'] || thresholds?.['1e-5'] || 75;
    const isVerified = typeof confidence === 'number' && confidence >= recommendedThreshold;

    user.isVerified = isVerified;
    await user.save();

    res.status(200).json({
      message: 'Face verification processed.',
      verified: isVerified,
      isVerified,
      confidence,
      thresholds,
      usedFileComparison: usedFile2 === true
    });

  } catch (error) {
    logError('Face verification error:', error);
    if (error.response) {
      // Face++ API returned an error
      return res.status(error.response.status).json({ 
        message: 'Face++ API error', 
        details: error.response.data 
      });
    }
    next(error);
  }
};