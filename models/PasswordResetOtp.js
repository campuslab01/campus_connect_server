const mongoose = require('mongoose');

const passwordResetOtpSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email: { type: String, required: true, index: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, default: Date.now },
  isUsed: { type: Boolean, default: false }
}, {
  timestamps: true
});

passwordResetOtpSchema.index({ email: 1, expiresAt: 1 });

module.exports = mongoose.model('PasswordResetOtp', passwordResetOtpSchema);