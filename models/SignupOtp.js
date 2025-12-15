const mongoose = require('mongoose');

const signupOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  isUsed: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, default: null },
  signupData: { type: Object, required: true },
});

signupOtpSchema.index({ email: 1, isUsed: 1 });

module.exports = mongoose.model('SignupOtp', signupOtpSchema);