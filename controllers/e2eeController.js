const User = require('../models/User');
const { authenticateToken } = require('../middlewares/auth');

/**
 * @desc    Save user's E2EE public key
 * @route   PUT /api/e2ee/public-key
 * @access  Private
 */
const savePublicKey = async (req, res, next) => {
  try {
    const { publicKey } = req.body;

    if (!publicKey || typeof publicKey !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Public key is required'
      });
    }

    await User.findByIdAndUpdate(req.user._id, {
      e2eePublicKey: publicKey
    });

    res.status(200).json({
      status: 'success',
      message: 'Public key saved successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's E2EE public key
 * @route   GET /api/e2ee/public-key/:userId
 * @access  Private
 */
const getPublicKey = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('e2eePublicKey name');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        publicKey: user.e2eePublicKey,
        userName: user.name
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current user's E2EE public key
 * @route   GET /api/e2ee/public-key
 * @access  Private
 */
const getMyPublicKey = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('e2eePublicKey');

    res.status(200).json({
      status: 'success',
      data: {
        publicKey: user.e2eePublicKey
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  savePublicKey,
  getPublicKey,
  getMyPublicKey
};

