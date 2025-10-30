const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  
  // Profile Information
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [18, 'Age must be at least 18'],
    max: [30, 'Age must be at most 30']
  },
  gender: {
    type: String,
    required: [true, 'Gender is required'],
    enum: ['male', 'female', 'other']
  },
  
  // Academic Information
  college: {
    type: String,
    required: [true, 'College is required'],
    trim: true
  },
  department: {
    type: String,
    required: [true, 'Department is required'],
    trim: true
  },
  year: {
    type: String,
    required: [true, 'Academic year is required'],
    enum: ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', '1st', '2nd', '3rd', '4th']
  },
  
  // Profile Details
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot be more than 500 characters'],
    default: ''
  },
  photos: [{
    type: String // URLs or data URIs
  }],
  profileImage: {
    type: String, // Main profile image URL or data URI
    default: ''
  },
  
  // Relationship Information
  relationshipStatus: {
    type: String,
    enum: ['Single', 'In a relationship', 'Married', 'It\'s complicated'],
    default: 'Single'
  },
  lookingFor: [{
    type: String,
    enum: ['Long term', 'Short term', 'Friendship']
  }],
  interests: [{
    type: String,
    trim: true
  }],
  
  // Verification & Status
  verified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  
  // Privacy Settings
  showAge: {
    type: Boolean,
    default: true
  },
  showCollege: {
    type: Boolean,
    default: true
  },
  showDepartment: {
    type: Boolean,
    default: true
  },
  
  // Social Features
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  matches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Account Management
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
userSchema.index({ college: 1 });
userSchema.index({ department: 1 });
userSchema.index({ interests: 1 });
userSchema.index({ location: '2dsphere' }); // For future location-based features

// Virtual for age display
userSchema.virtual('displayAge').get(function() {
  return this.showAge ? this.age : null;
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12 (increased from default 10 for better security)
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to update updatedAt
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to get public profile
userSchema.methods.getPublicProfile = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.emailVerificationToken;
  delete userObject.passwordResetToken;
  delete userObject.passwordResetExpires;
  return userObject;
};

// Static method to find users by criteria
userSchema.statics.findByCriteria = function(criteria) {
  const {
    gender,
    department,
    college,
    interests,
    lookingFor,
    ageMin,
    ageMax,
    excludeId
  } = criteria;
  
  let query = { isActive: true };
  
  if (gender && gender !== 'all') {
    query.gender = gender;
  }
  
  if (department && department !== 'all') {
    query.department = department;
  }
  
  if (college) {
    query.college = new RegExp(college, 'i');
  }
  
  if (interests && interests.length > 0) {
    query.interests = { $in: interests };
  }
  
  if (lookingFor && lookingFor !== 'all') {
    query.lookingFor = lookingFor;
  }
  
  if (ageMin || ageMax) {
    query.age = {};
    if (ageMin) query.age.$gte = ageMin;
    if (ageMax) query.age.$lte = ageMax;
  }
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  return this.find(query).select('-password -emailVerificationToken -passwordResetToken');
};

module.exports = mongoose.model('User', userSchema);
