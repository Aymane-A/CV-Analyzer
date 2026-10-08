const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['candidate', 'recruiter'], default: 'candidate' },

  // Old accounts have no such field, so they count as verified. /register sets it to false explicitly.
  emailVerified:  { type: Boolean, default: true },
  passwordChangedAt: { type: Date },
  verifyCodeHash: { type: String, select: false },
  verifyExpires:  Date,
  verifyAttempts: { type: Number, default: 0 },
  verifySentAt:   Date,
  resetCodeHash:  { type: String, select: false },
  resetExpires:   Date,
  resetAttempts:  { type: Number, default: 0 },
  resetSentAt:    Date
}, { timestamps: true });

// Accounts that never verified their email are deleted after 24 hours
userSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60, partialFilterExpression: { emailVerified: false } });

module.exports = mongoose.model('User', userSchema);
