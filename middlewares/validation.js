const { body } = require('express-validator');

// User registration validation
const validateRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  
  body('age')
    .isInt({ min: 18, max: 30 })
    .withMessage('Age must be between 18 and 30'),
  
  body('gender')
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female, or other'),
  
  body('college')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('College name must be between 2 and 100 characters'),
  
  body('department')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Department must be between 2 and 50 characters'),
  
  body('year')
    .isIn(['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', '1st', '2nd', '3rd', '4th'])
    .withMessage('Invalid academic year'),
  
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio cannot be more than 500 characters'),
  
  body('interests')
    .optional()
    .isArray()
    .withMessage('Interests must be an array'),
  
  body('interests.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Each interest must be between 1 and 30 characters'),
  
  body('lookingFor')
    .optional()
    .isArray()
    .withMessage('Looking for must be an array'),
  
  body('lookingFor.*')
    .optional()
    .isIn(['Long term', 'Short term', 'Friendship'])
    .withMessage('Invalid looking for option'),
  
  body('relationshipStatus')
    .optional()
    .isIn(['Single', 'In a relationship', 'Married', 'It\'s complicated'])
    .withMessage('Invalid relationship status'),
  
  body('profileImage')
    .notEmpty()
    .withMessage('Profile image is required'),
  
  body('photos')
    .isArray({ min: 1 })
    .withMessage('At least one profile photo is required'),
  
  body('photos.*')
    .isURL()
    .withMessage('Each photo must be a valid URL')
];

// User login validation
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Profile update validation
const validateProfileUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  
  body('age')
    .optional()
    .isInt({ min: 18, max: 30 })
    .withMessage('Age must be between 18 and 30'),
  
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio cannot be more than 500 characters'),
  
  body('interests')
    .optional()
    .isArray()
    .withMessage('Interests must be an array'),
  
  body('interests.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Each interest must be between 1 and 30 characters'),
  
  body('lookingFor')
    .optional()
    .isArray()
    .withMessage('Looking for must be an array'),
  
  body('lookingFor.*')
    .optional()
    .isIn(['Long term', 'Short term', 'Friendship'])
    .withMessage('Invalid looking for option'),
  
  body('relationshipStatus')
    .optional()
    .isIn(['Single', 'In a relationship', 'Married', 'It\'s complicated'])
    .withMessage('Invalid relationship status'),
  
  body('showAge')
    .optional()
    .isBoolean()
    .withMessage('showAge must be a boolean'),
  
  body('showCollege')
    .optional()
    .isBoolean()
    .withMessage('showCollege must be a boolean'),
  
  body('showDepartment')
    .optional()
    .isBoolean()
    .withMessage('showDepartment must be a boolean')
];

// Password change validation
const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number')
];

// Forgot password validation
const validateForgotPassword = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
];

// Reset password validation
const validateResetPassword = [
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number')
];

// Search validation
const validateSearch = [
  body('query')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query cannot be more than 100 characters'),
  
  body('gender')
    .optional()
    .isIn(['all', 'male', 'female', 'other'])
    .withMessage('Invalid gender filter'),
  
  body('department')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Department filter cannot be more than 50 characters'),
  
  body('college')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('College filter cannot be more than 100 characters'),
  
  body('interests')
    .optional()
    .isArray()
    .withMessage('Interests must be an array'),
  
  body('interests.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Each interest must be between 1 and 30 characters'),
  
  body('lookingFor')
    .optional()
    .isIn(['all', 'Long term', 'Short term', 'Friendship'])
    .withMessage('Invalid looking for filter'),
  
  body('ageMin')
    .optional()
    .isInt({ min: 18, max: 30 })
    .withMessage('Minimum age must be between 18 and 30'),
  
  body('ageMax')
    .optional()
    .isInt({ min: 18, max: 30 })
    .withMessage('Maximum age must be between 18 and 30'),
  
  body('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  body('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

// Message validation
const validateMessage = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters'),
  
  body('type')
    .optional()
    .isIn(['text', 'image', 'emoji'])
    .withMessage('Invalid message type')
];

// Confession validation
const validateConfession = [
  body('content')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Confession must be between 10 and 1000 characters'),
  
  body('category')
    .optional()
    .isIn(['love', 'academic', 'friendship', 'family', 'personal', 'other'])
    .withMessage('Invalid confession category'),
  
  body('isAnonymous')
    .optional()
    .isBoolean()
    .withMessage('isAnonymous must be a boolean'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Each tag must be between 1 and 20 characters')
];

// Comment validation
const validateComment = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Comment must be between 1 and 500 characters'),
  
  body('isAnonymous')
    .optional()
    .isBoolean()
    .withMessage('isAnonymous must be a boolean')
];

module.exports = {
  validateRegistration,
  validateLogin,
  validateProfileUpdate,
  validatePasswordChange,
  validateForgotPassword,
  validateResetPassword,
  validateSearch,
  validateMessage,
  validateConfession,
  validateComment
};
