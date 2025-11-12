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

    // Assuming user.profileImage contains the URL of the user's existing profile picture
    if (!user.profileImage) {
      return res.status(400).json({ message: 'User profile image not found for comparison.' });
    }

    const formData = new FormData();
    formData.append('api_key', FACEPP_API_KEY);
    formData.append('api_secret', FACEPP_API_SECRET);
    formData.append('image_file1', req.file.buffer, { filename: req.file.originalname });
    formData.append('image_url2', user.profileImage);

    const response = await axios.post(FACEPP_COMPARE_URL, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    const { confidence, thresholds } = response.data;

    // Define a confidence threshold for successful verification
    const VERIFICATION_THRESHOLD = 75; // Example threshold, adjust as needed

    let isVerified = false;
    if (confidence && confidence >= VERIFICATION_THRESHOLD) {
      isVerified = true;
    }

    // Update user's verification status in the database
    user.isVerified = isVerified;
    await user.save();

    res.status(200).json({
      message: 'Face verification processed.',
      isVerified,
      confidence,
      thresholds,
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