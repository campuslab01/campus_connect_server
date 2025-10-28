const User = require('../models/User');
const { uploadToS3, deleteFromS3 } = require('../utils/upload');

// @desc    Upload profile image
// @route   POST /api/upload/profile
// @access  Private
const uploadProfileImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No image file provided'
      });
    }

    let imageUrl;

    // Upload to S3 if configured, otherwise use local path
    if (process.env.AWS_S3_BUCKET) {
      imageUrl = await uploadToS3(req.file, 'profiles');
    } else {
      // Local development - use relative path
      imageUrl = `/uploads/${req.file.filename}`;
    }

    // Update user's profile image
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profileImage: imageUrl },
      { new: true }
    );

    res.status(200).json({
      status: 'success',
      message: 'Profile image uploaded successfully',
      data: {
        imageUrl,
        user: user.getPublicProfile()
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload multiple images for user profile
// @route   POST /api/upload/images
// @access  Private
const uploadImages = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No image files provided'
      });
    }

    const imageUrls = [];

    // Upload each file
    for (const file of req.files) {
      let imageUrl;
      
      if (process.env.AWS_S3_BUCKET) {
        imageUrl = await uploadToS3(file, 'profiles');
      } else {
        imageUrl = `/uploads/${file.filename}`;
      }
      
      imageUrls.push(imageUrl);
    }

    // Update user's photos array
    const user = await User.findById(req.user._id);
    user.photos = [...user.photos, ...imageUrls];
    
    // Set first photo as profile image if none exists
    if (!user.profileImage && imageUrls.length > 0) {
      user.profileImage = imageUrls[0];
    }
    
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Images uploaded successfully',
      data: {
        imageUrls,
        user: user.getPublicProfile()
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete an image
// @route   DELETE /api/upload/images/:imageUrl
// @access  Private
const deleteImage = async (req, res, next) => {
  try {
    const { imageUrl } = req.params;
    const user = await User.findById(req.user._id);

    // Check if image exists in user's photos
    const imageIndex = user.photos.indexOf(imageUrl);
    if (imageIndex === -1) {
      return res.status(404).json({
        status: 'error',
        message: 'Image not found in your profile'
      });
    }

    // Remove from photos array
    user.photos.splice(imageIndex, 1);

    // If this was the profile image, set a new one
    if (user.profileImage === imageUrl) {
      user.profileImage = user.photos.length > 0 ? user.photos[0] : '';
    }

    await user.save();

    // Delete from S3 if configured
    if (process.env.AWS_S3_BUCKET && imageUrl.includes('amazonaws.com')) {
      await deleteFromS3(imageUrl);
    }

    res.status(200).json({
      status: 'success',
      message: 'Image deleted successfully',
      data: {
        user: user.getPublicProfile()
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Set profile image
// @route   PUT /api/upload/profile-image
// @access  Private
const setProfileImage = async (req, res, next) => {
  try {
    const { imageUrl } = req.body;
    const user = await User.findById(req.user._id);

    // Check if image exists in user's photos
    if (!user.photos.includes(imageUrl)) {
      return res.status(404).json({
        status: 'error',
        message: 'Image not found in your photos'
      });
    }

    // Update profile image
    user.profileImage = imageUrl;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Profile image updated successfully',
      data: {
        user: user.getPublicProfile()
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload chat image
// @route   POST /api/upload/chat
// @access  Private
const uploadChatImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No image file provided'
      });
    }

    let imageUrl;

    // Upload to S3 if configured, otherwise use local path
    if (process.env.AWS_S3_BUCKET) {
      imageUrl = await uploadToS3(req.file, 'chat');
    } else {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    res.status(200).json({
      status: 'success',
      message: 'Chat image uploaded successfully',
      data: {
        imageUrl
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadProfileImage,
  uploadImages,
  deleteImage,
  setProfileImage,
  uploadChatImage
};
