const axios = require('axios');
const FormData = require('form-data');
const User = require('../models/User');
const { logError } = require('../utils/logger');

const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;
const FACEPP_COMPARE_URL = 'https://api-us.faceplusplus.com/facepp/v3/compare';

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

    const formData = new FormData();
    formData.append('api_key', FACEPP_API_KEY);
    formData.append('api_secret', FACEPP_API_SECRET);
    formData.append('image_file1', req.file.buffer, { filename: req.file.originalname });

    let usedFile2 = false;
    try {
      const imgResp = await axios.get(profileImageUrl, { responseType: 'arraybuffer' });
      const buf = Buffer.from(imgResp.data);
      formData.append('image_file2', buf, { filename: 'profile.jpg' });
      usedFile2 = true;
    } catch (e) {
      formData.append('image_url2', profileImageUrl);
    }

    const response = await axios.post(FACEPP_COMPARE_URL, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    const { confidence, thresholds } = response.data;

    const recommendedThreshold = thresholds?.['1e-4'] || thresholds?.['1e-5'] || 75;
    const isVerified = typeof confidence === 'number' && confidence >= recommendedThreshold;

    user.isVerified = isVerified;
    user.verified = isVerified;
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