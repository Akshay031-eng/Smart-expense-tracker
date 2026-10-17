/**
 * "Smart insights": plain rules over numbers the dashboard already computed.
 * Pure functions (no database), so every rule is unit-tested.
 */

const { roundToWhole, floorToWhole } = require('../utils/money');

const LEVEL_ORDER = { danger: 0, warning: 1, good: 2, info: 3 };

// Paid once a month: extrapolating them would wildly overestimate the forecast
// (rent paid on day 2 x 15 = nonsense). Only variable spending is extrapolated.
const FIXED_CATEGORIES = new Set(['rent', 'bills']);

// The first few days of a month are too noisy for pace warnings.
const MIN_DAYS_FOR_PACE = 5;

const percent = (ratio) => `${Math.round(ratio * 100)}%`;
const percentDown = (ratio) => `${Math.floor(ratio * 100)}%`;

/**
 * Month-end forecast: fixed costs as they are + variable spending extrapolated
 * from the average so far per day.
 */
function projectMonthEnd({ expense, categories = [], daysElapsed, daysInMonth }) {
  if (!daysElapsed) return expense;
  const fixed = categories
    .filter((c) => FIXED_CATEGORIES.has(c.category))
    .reduce((sum, c) => sum + c.total, 0);
  const variable = Math.max(0, expense - fixed);
  // Rounded to whole rupees/dollars: a forecast with paise looks falsely precise.
  return roundToWhole(fixed + (variable / daysElapsed) * daysInMonth);
}

/**
 * @param {object} input
 * @param {boolean} input.isCurrentMonth
 * @param {number} input.daysElapsed      days of the month that have passed, today included
 * @param {number} input.daysInMonth
 * @param {number} input.income           minor units
 * @param {number} input.expense          minor units
 * @param {number} input.prevExpense      previous month (same period for the current month)
 * @param {{category: string, total: number}[]} input.categories  expense per category, biggest first
 * @param {Object<string, number>} input.categoryAverages  average per month over the 3 months before
 * @param {number|null} input.overallBudget
 * @param {{category: string, limit: number, spent: number}[]} input.categoryBudgets
 * @param {{amount: number, description: string, category: string}|null} input.biggest
 * @param {number} input.transactionCount
 * @param {(minor: number) => string} input.format
 * @param {(categoryId: string) => string} input.label
 * @returns {{id: string, level: 'danger'|'warning'|'good'|'info', title: string, text: string}[]}
 */
function buildInsights(input) {
  const {
    isCurrentMonth,
    daysElapsed,
    daysInMonth,
    income = 0,
    expense = 0,
    prevExpense = 0,
    categories = [],
    categoryAverages = {},
    overallBudget = null,
    categoryBudgets = [],
    biggest = null,
    transactionCount = 0,
    format,
    label,
  } = input;

  if (!transactionCount) {
    return [
      {
        id: 'empty',
        level: 'info',
        title: isCurrentMonth ? 'No transactions yet this month' : 'No transactions this month',
        text: isCurrentMonth
          ? 'Add your first expense or income and your insights will appear here.'
          : 'Nothing was recorded for this month.',
      },
    ];
  }

  const insights = [];
  const add = (id, level, title, text, priority) => insights.push({ id, level, title, text, priority });
  const spent = isCurrentMonth ? "You've spent" : 'You spent';
  // Days still to come, today included.
  const daysRemaining = Math.max(1, daysInMonth - daysElapsed + 1);
  const alerted = new Set();

  // 1. Overall budget and month-end forecast
  if (overallBudget) {
    if (expense > overallBudget) {
      add(
        'budget-over',
        'danger',
        'Over your monthly budget',
        `${spent} ${format(expense)}, ${format(expense - overallBudget)} over your ${format(overallBudget)} budget.`,
        10,
      );
    } else if (isCurrentMonth && expense > 0 && daysElapsed >= MIN_DAYS_FOR_PACE) {
      const projected = projectMonthEnd({ expense, categories, daysElapsed, daysInMonth });
      const perDay = floorToWhole((overallBudget - expense) / daysRemaining);
      if (projected > overallBudget) {
        add(
          'budget-pace',
          'warning',
          'On track to overspend',
          `At this pace you'll spend about ${format(projected)} this month, ${format(projected - overallBudget)} over budget. ` +
            `Keep spending under ${format(perDay)} a day to stay within it.`,
          20,
        );
      } else {
        add(
          'budget-pace',
          'good',
          'On track with your budget',
          `Forecast: about ${format(projected)} of your ${format(overallBudget)} budget. ` +
            `You can spend up to ${format(perDay)} a day for the rest of the month.`,
          20,
        );
      }
    } else if (!isCurrentMonth) {
      add(
        'budget-closed',
        'good',
        'Stayed within budget',
        `You spent ${format(expense)} of your ${format(overallBudget)} budget (${percent(expense / overallBudget)}).`,
        20,
      );
    }
  } else if (isCurrentMonth && expense > 0 && daysElapsed >= MIN_DAYS_FOR_PACE && daysElapsed < daysInMonth) {
    const projected = projectMonthEnd({ expense, categories, daysElapsed, daysInMonth });
    add(
      'forecast',
      'info',
      'Month-end forecast',
      `At your current pace you'll spend about ${format(projected)} this month. Set an overall budget to track it.`,
      60,
    );
  }

  // 2. Category budgets close to or over their limit (worst first, max 3)
  categoryBudgets
    .filter((b) => b.limit > 0 && b.spent / b.limit >= 0.8)
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit)
    .slice(0, 3)
    .forEach((b) => {
      alerted.add(b.category);
      const ratio = b.spent / b.limit;
      if (ratio > 1) {
        add(
          `budget-${b.category}`,
          'danger',
          `${label(b.category)} budget exceeded`,
          `${spent} ${format(b.spent)} of ${format(b.limit)}, ${format(b.spent - b.limit)} over.`,
          15,
        );
      } else {
        const left = isCurrentMonth ? ` for the next ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}` : '';
        add(
          `budget-${b.category}`,
          'warning',
          `${label(b.category)} budget ${percentDown(ratio)} used`,
          `${format(b.spent)} of ${format(b.limit)} spent; ${format(b.limit - b.spent)} left${left}.`,
          25,
        );
      }
    });

  // 3. Savings rate (income vs expenses)
  if (income > 0) {
    const rate = (income - expense) / income;
    if (rate < 0) {
      add(
        'savings-negative',
        'danger',
        'Spending more than you earn',
        `Expenses are ${format(expense - income)} higher than income this month.`,
        12,
      );
    } else if (rate >= 0.2) {
      add('savings', 'good', 'Healthy savings rate', `You kept ${percent(rate)} of your income${isCurrentMonth ? ' so far' : ''}.`, 40);
    } else {
      add('savings', 'info', `Savings rate: ${percent(rate)}`, 'A common target is to save at least 20% of income.', 45);
    }
  }

  // 4. Compared with last month
  if (prevExpense > 0 && expense > 0) {
    const change = (expense - prevExpense) / prevExpense;
    const period = isCurrentMonth ? 'the same days last month' : 'the month before';
    if (change >= 0.15) {
      add(
        'trend-up',
        'warning',
        'Spending is up',
        `${spent} ${percent(change)} more than in ${period} (${format(expense)} vs ${format(prevExpense)}).`,
        30,
      );
    } else if (change <= -0.15) {
      add(
        'trend-down',
        'good',
        'Spending is down',
        `${spent} ${percent(-change)} less than in ${period} (${format(expense)} vs ${format(prevExpense)}).`,
        30,
      );
    }
  }

  // 5. A category far above its usual level (not already covered by a budget alert)
  const unusual = categories
    .filter((c) => {
      const average = categoryAverages[c.category];
      return !alerted.has(c.category) && average > 0 && c.total >= average * 1.5 && c.total - average >= expense * 0.05;
    })
    .sort((a, b) => b.total / categoryAverages[b.category] - a.total / categoryAverages[a.category])[0];
  if (unusual) {
    const average = categoryAverages[unusual.category];
    add(
      `unusual-${unusual.category}`,
      'warning',
      `Unusual spending on ${label(unusual.category)}`,
      `${format(unusual.total)} ${isCurrentMonth ? 'so far' : 'this month'} vs a 3-month average of ${format(average)} ` +
        `(${(unusual.total / average).toFixed(1)}×).`,
      35,
    );
  }

  // 6. Where the money went
  if (categories.length && expense > 0) {
    const top = categories[0];
    add(
      'top-category',
      'info',
      `Top category: ${label(top.category)}`,
      `${percent(top.total / expense)} of your spending (${format(top.total)}).`,
      50,
    );
  }

  if (biggest) {
    add(
      'biggest',
      'info',
      'Largest expense',
      `${format(biggest.amount)}${biggest.description ? ` for ${biggest.description}` : ''} (${label(biggest.category)}).`,
      55,
    );
  }

  return insights
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.priority - b.priority)
    .slice(0, 6)
    .map(({ priority, ...insight }) => insight);
}

module.exports = { buildInsights, projectMonthEnd, FIXED_CATEGORIES, MIN_DAYS_FOR_PACE };
