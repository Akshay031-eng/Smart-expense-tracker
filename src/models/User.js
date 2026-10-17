const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const config = require('../config/env');
const { CURRENCY_CODES } = require('../config/categories');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    // Never returned by queries unless asked for explicitly with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    currency: { type: String, enum: CURRENCY_CODES, default: 'INR' },
    isDemo: { type: Boolean, default: false },
    // Demo account only: when its sample data was last generated.
    demoSeededAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptRounds);
};

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
