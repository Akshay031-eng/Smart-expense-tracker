const config = require('../config/env');
const Budget = require('../models/Budget');
const { EXPENSE_CATEGORIES, OVERALL_BUDGET, getCategory } = require('../config/categories');
const { collectErrors } = require('../middleware/validators');
const { sumByCategory, sumByType } = require('../services/analytics');
const { parseAmountToMinor } = require('../utils/money');
const { today, monthKeyOf, monthRange, monthLabel, daysInMonth } = require('../utils/dates');

async function index(req, res, { errors = {}, status = 200 } = {}) {
  const todayDate = today(config.timeZone);
  const monthKey = monthKeyOf(todayDate);
  const { start, end } = monthRange(monthKey);

  const [budgets, categoryTotals, totals] = await Promise.all([
    Budget.find({ user: req.user._id }).lean(),
    sumByCategory(req.user._id, start, end, 'expense'),
    sumByType(req.user._id, start, end),
  ]);

  const limits = new Map(budgets.map((b) => [b.category, b.limit]));
  const spent = new Map(categoryTotals.map((c) => [c.category, c.total]));
  spent.set(OVERALL_BUDGET, totals.expense);

  const rows = [OVERALL_BUDGET, ...EXPENSE_CATEGORIES.map((c) => c.id)].map((key) => {
    const limit = limits.get(key) ?? null;
    const used = spent.get(key) || 0;
    const ratio = limit ? used / limit : 0;
    return {
      key,
      info: getCategory(key),
      limit,
      spent: used,
      percent: limit ? Math.round(ratio * 100) : null,
      status: !limit ? 'none' : ratio > 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'ok',
    };
  });

  const categoryLimitTotal = budgets.filter((b) => b.category !== OVERALL_BUDGET).reduce((sum, b) => sum + b.limit, 0);

  res.status(status).render('budgets/index', {
    title: 'Budgets',
    monthLabel: monthLabel(monthKey),
    daysLeft: daysInMonth(monthKey) - todayDate.getUTCDate() + 1,
    overall: rows[0],
    rows: rows.slice(1),
    categoryLimitTotal,
    errors,
  });
}

async function upsert(req, res) {
  const errors = collectErrors(req);
  if (errors) return index(req, res, { errors: { [req.body.category || 'form']: Object.values(errors)[0] }, status: 422 });

  // Upsert: update the limit if this budget exists, otherwise create it.
  // The unique { user, category } index guarantees one budget per category.
  await Budget.updateOne(
    { user: req.user._id, category: req.body.category },
    { $set: { limit: parseAmountToMinor(req.body.limit) } },
    { upsert: true, runValidators: true },
  );
  req.flash('success', `Budget saved for ${getCategory(req.body.category).label}.`);
  return res.redirect('/budgets');
}

async function destroy(req, res) {
  await Budget.deleteOne({ user: req.user._id, category: String(req.params.category) });
  req.flash('success', `Budget removed for ${getCategory(String(req.params.category)).label}.`);
  res.redirect('/budgets');
}

module.exports = { index: (req, res) => index(req, res), upsert, destroy };
