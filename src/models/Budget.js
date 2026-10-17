const mongoose = require('mongoose');
const { EXPENSE_CATEGORIES, OVERALL_BUDGET } = require('../config/categories');

const BUDGET_KEYS = [OVERALL_BUDGET, ...EXPENSE_CATEGORIES.map((c) => c.id)];

/**
 * A monthly spending limit. It repeats every month, so a user sets it once.
 * category = an expense category id, or "overall" for the whole month.
 */
const budgetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true, enum: BUDGET_KEYS },
    limit: {
      type: Number,
      required: true,
      min: 100,
      max: 100_000_000_000,
      validate: { validator: Number.isInteger, message: 'Limit must be a whole number of paise/cents.' },
    },
  },
  { timestamps: true },
);

// One budget per category per user; also makes "upsert" safe.
budgetSchema.index({ user: 1, category: 1 }, { unique: true });

module.exports = mongoose.models.Budget || mongoose.model('Budget', budgetSchema);
module.exports.BUDGET_KEYS = BUDGET_KEYS;
