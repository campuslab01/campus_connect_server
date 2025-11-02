const User = require('../models/User');
const { uploadImage, deleteImage: deleteImageFromStorage } = require('../utils/upload');

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

    // Upload image (Cloudinary > S3 > Local)
    const imageUrl = await uploadImage(req.file, 'profiles');

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

    // Upload each file (Cloudinary > S3 > Local)
    for (const file of req.files) {
      const imageUrl = await uploadImage(file, 'profiles');
      imageUrls.push(imageUrl);
    }

    // Update user's photos array with a maximum of 3 images
    const user = await User.findById(req.user._id);
    const currentCount = Array.isArray(user.photos) ? user.photos.length : 0;
    const availableSlots = Math.max(0, 3 - currentCount);
    const toAdd = imageUrls.slice(0, availableSlots);

    if (toAdd.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Maximum of 3 images allowed. Delete or replace an existing image.'
      });
    }

    user.photos = [...(user.photos || []), ...toAdd];
    
    // Set first photo as profile image if none exists
    if (!user.profileImage && imageUrls.length > 0) {
      user.profileImage = imageUrls[0];
    }
    
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Images uploaded successfully',
      data: {
        imageUrls: toAdd,
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

    // Delete from storage (Cloudinary/S3/Local)
    await deleteImageFromStorage(imageUrl);

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

// @desc    Replace an image at specified index (0-2)
// @route   PUT /api/upload/images/:index
// @access  Private
const replaceImageAtIndex = async (req, res, next) => {
  try {
    const index = parseInt(req.params.index, 10);
    if (Number.isNaN(index) || index < 0 || index > 2) {
      return res.status(400).json({ status: 'error', message: 'Index must be 0, 1, or 2' });
    }
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No image file provided' });
    }

    const user = await User.findById(req.user._id);
    const photos = Array.isArray(user.photos) ? user.photos : [];

    // Upload new image (Cloudinary > S3 > Local)
    const newUrl = await uploadImage(req.file, 'profiles');

    // If slot doesn't exist yet but below cap, expand to that slot if possible
    if (index >= photos.length) {
      if (photos.length >= 3) {
        return res.status(400).json({ status: 'error', message: 'Maximum of 3 images allowed' });
      }
      // Fill missing slots with the new image only at the specific index using placeholders
      while (photos.length < index) photos.push(photos[photos.length - 1] || newUrl);
      photos.push(newUrl);
    } else {
      // Replace existing
      const oldUrl = photos[index];
      photos[index] = newUrl;
      // Delete old image from storage
      if (oldUrl) {
        await deleteImageFromStorage(oldUrl);
      }
      // If replaced main profile image
      if (user.profileImage === oldUrl) {
        user.profileImage = newUrl;
      }
    }

    user.photos = photos.slice(0, 3);
    await user.save();

    return res.status(200).json({
      status: 'success',
      message: 'Image updated successfully',
      data: { user: user.getPublicProfile() }
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

    // Upload chat image (Cloudinary > S3 > Local)
    const imageUrl = await uploadImage(req.file, 'chat');

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
  uploadChatImage,
  replaceImageAtIndex
};
