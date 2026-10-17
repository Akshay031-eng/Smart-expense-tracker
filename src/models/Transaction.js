const mongoose = require('mongoose');
const { TRANSACTION_TYPES, PAYMENT_METHOD_IDS, isValidCategory } = require('../config/categories');

const MAX_AMOUNT_MINOR = 100_000_000_000; // 1,000,000,000.00 - far above any real expense

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    // Integer minor units (paise / cents): 123450 = 1,234.50
    amount: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_AMOUNT_MINOR,
      validate: { validator: Number.isInteger, message: 'Amount must be a whole number of paise/cents.' },
    },
    category: {
      type: String,
      required: true,
      validate: {
        validator(value) {
          return isValidCategory(this.type, value);
        },
        message: 'Category does not match the transaction type.',
      },
    },
    description: { type: String, trim: true, maxlength: 120, default: '' },
    paymentMethod: { type: String, enum: PAYMENT_METHOD_IDS, default: 'upi' },
    // Calendar day stored as UTC midnight (see utils/dates.js).
    date: { type: Date, required: true },
  },
  { timestamps: true },
);

// Every query starts with "this user's transactions in a date range".
transactionSchema.index({ user: 1, date: -1 });
// Dashboard / budget sums filter by type as well.
transactionSchema.index({ user: 1, type: 1, date: -1 });

module.exports = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
module.exports.MAX_AMOUNT_MINOR = MAX_AMOUNT_MINOR;
