/**
 * Dashboard numbers. Every query is scoped to one user and one date range,
 * so it uses the { user, type, date } index and stays fast as data grows.
 */
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const { OVERALL_BUDGET, getCategory } = require('../config/categories');
const { formatMoney } = require('../utils/money');
const dates = require('../utils/dates');
const { buildInsights, projectMonthEnd, MIN_DAYS_FOR_PACE } = require('./insights');

const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

/** { income, expense } totals for [start, end). */
async function sumByType(userId, start, end) {
  const rows = await Transaction.aggregate([
    { $match: { user: toObjectId(userId), date: { $gte: start, $lt: end } } },
    { $group: { _id: '$type', total: { $sum: '$amount' } } },
  ]);
  const totals = { income: 0, expense: 0 };
  for (const row of rows) totals[row._id] = row.total;
  return totals;
}

/** [{ category, total }] biggest first, for one transaction type. */
async function sumByCategory(userId, start, end, type = 'expense') {
  const rows = await Transaction.aggregate([
    { $match: { user: toObjectId(userId), type, date: { $gte: start, $lt: end } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $sort: { total: -1 } },
  ]);
  return rows.map((row) => ({ category: row._id, total: row.total }));
}

/** Income and expense for the `months` months ending with `endKey` (oldest first). */
async function monthlyTrend(userId, endKey, months = 6) {
  const keys = Array.from({ length: months }, (_, i) => dates.addMonths(endKey, i - months + 1));
  // Small indexed range queries in parallel; each month is one $match + $group.
  const totals = await Promise.all(
    keys.map((key) => {
      const { start, end } = dates.monthRange(key);
      return sumByType(userId, start, end);
    }),
  );
  return keys.map((key, i) => ({ month: key, label: dates.monthLabel(key, { short: true }), ...totals[i] }));
}

/**
 * Running total of spending per day of the month (for the "spending vs budget pace" chart).
 * One month of a single user's expenses is small, so it is bucketed here instead of in the database.
 */
async function cumulativeDailySpend(userId, monthKey, lastDay) {
  const { start, end } = dates.monthRange(monthKey);
  const rows = await Transaction.find(
    { user: toObjectId(userId), type: 'expense', date: { $gte: start, $lt: end } },
    { date: 1, amount: 1, _id: 0 },
  ).lean();

  const perDay = new Array(dates.daysInMonth(monthKey)).fill(0);
  for (const row of rows) perDay[new Date(row.date).getUTCDate() - 1] += row.amount;

  let running = 0;
  return perDay.slice(0, lastDay).map((amount) => (running += amount));
}

/** Everything the dashboard shows for one month. */
async function getDashboard(user, monthKey, todayDate) {
  const userId = toObjectId(user._id);
  const currency = user.currency || 'INR';
  const format = (minor) => formatMoney(minor, currency);

  const { start, end } = dates.monthRange(monthKey);
  const currentKey = dates.monthKeyOf(todayDate);
  const isCurrentMonth = monthKey === currentKey;
  const daysInMonth = dates.daysInMonth(monthKey);
  const daysElapsed = isCurrentMonth ? todayDate.getUTCDate() : daysInMonth;

  // Fair comparison: for the current month compare with the same number of days last month.
  const prevKey = dates.addMonths(monthKey, -1);
  const prev = dates.monthRange(prevKey);
  const prevPeriodEnd = isCurrentMonth
    ? new Date(Math.min(dates.addDays(prev.start, daysElapsed).getTime(), prev.end.getTime()))
    : prev.end;
  const averageStart = dates.monthRange(dates.addMonths(monthKey, -3)).start;

  const [totals, prevTotals, categoryRows, previousCategoryRows, incomeRows, trend, daily, budgets, recent, biggest, count] =
    await Promise.all([
      sumByType(userId, start, end),
      sumByType(userId, prev.start, prevPeriodEnd),
      sumByCategory(userId, start, end, 'expense'),
      sumByCategory(userId, averageStart, start, 'expense'),
      sumByCategory(userId, start, end, 'income'),
      monthlyTrend(userId, monthKey, 6),
      cumulativeDailySpend(userId, monthKey, daysElapsed),
      Budget.find({ user: userId }).lean(),
      Transaction.find({ user: userId, date: { $gte: start, $lt: end } })
        .sort({ date: -1, createdAt: -1 })
        .limit(6)
        .lean(),
      Transaction.findOne({ user: userId, type: 'expense', date: { $gte: start, $lt: end } })
        .sort({ amount: -1 })
        .lean(),
      Transaction.countDocuments({ user: userId, date: { $gte: start, $lt: end } }),
    ]);

  const spentByCategory = new Map(categoryRows.map((row) => [row.category, row.total]));
  const overall = budgets.find((b) => b.category === OVERALL_BUDGET) || null;

  const budgetStatus = budgets
    .map((budget) => {
      const spent = budget.category === OVERALL_BUDGET ? totals.expense : spentByCategory.get(budget.category) || 0;
      const ratio = spent / budget.limit;
      return {
        category: budget.category,
        info: getCategory(budget.category),
        limit: budget.limit,
        spent,
        remaining: budget.limit - spent,
        percent: Math.round(ratio * 100),
        status: ratio > 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'ok',
      };
    })
    // Overall first, then the most-used budgets.
    .sort((a, b) => (a.category === OVERALL_BUDGET ? -1 : b.category === OVERALL_BUDGET ? 1 : b.spent / b.limit - a.spent / a.limit));

  const categoryAverages = {};
  for (const row of previousCategoryRows) categoryAverages[row.category] = Math.round(row.total / 3);

  const insights = buildInsights({
    isCurrentMonth,
    daysElapsed,
    daysInMonth,
    income: totals.income,
    expense: totals.expense,
    prevExpense: prevTotals.expense,
    categories: categoryRows,
    categoryAverages,
    overallBudget: overall ? overall.limit : null,
    categoryBudgets: budgetStatus.filter((b) => b.category !== OVERALL_BUDGET),
    biggest,
    transactionCount: count,
    format,
    label: (id) => getCategory(id).label,
  });

  const savingsRate = totals.income > 0 ? Math.round(((totals.income - totals.expense) / totals.income) * 100) : null;
  const forecast =
    isCurrentMonth && daysElapsed >= MIN_DAYS_FOR_PACE
      ? projectMonthEnd({ expense: totals.expense, categories: categoryRows, daysElapsed, daysInMonth })
      : null;

  const withInfo = (rows, total) =>
    rows.map((row) => ({ ...row, info: getCategory(row.category), share: total ? Math.round((row.total / total) * 100) : 0 }));

  return {
    monthKey,
    monthLabel: dates.monthLabel(monthKey),
    isCurrentMonth,
    prevMonthKey: prevKey,
    nextMonthKey: isCurrentMonth ? null : dates.addMonths(monthKey, 1),
    daysElapsed,
    daysInMonth,
    totals: { ...totals, net: totals.income - totals.expense },
    prevExpense: prevTotals.expense,
    savingsRate,
    forecast,
    count,
    categories: withInfo(categoryRows, totals.expense),
    incomeCategories: withInfo(incomeRows, totals.income),
    budgets: budgetStatus,
    overallBudget: overall ? overall.limit : null,
    insights,
    recent,
    charts: {
      currency,
      categories: categoryRows.map((row) => ({ label: getCategory(row.category).label, color: getCategory(row.category).color, total: row.total })),
      trend,
      daily,
      daysInMonth,
      overallBudget: overall ? overall.limit : null,
    },
  };
}

module.exports = { sumByType, sumByCategory, monthlyTrend, cumulativeDailySpend, getDashboard };
