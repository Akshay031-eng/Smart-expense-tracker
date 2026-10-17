/**
 * Categories, payment methods and currencies.
 *
 * `dot` is a Tailwind class (listed here in full so Tailwind generates it) and
 * `color` is the same colour for Chart.js. Keeping both here means the legend
 * dots in the HTML always match the chart.
 */

const EXPENSE_CATEGORIES = [
  { id: 'food', label: 'Food & Dining', color: '#f97316', dot: 'bg-orange-500' },
  { id: 'groceries', label: 'Groceries', color: '#22c55e', dot: 'bg-green-500' },
  { id: 'rent', label: 'Rent & Housing', color: '#6366f1', dot: 'bg-indigo-500' },
  { id: 'bills', label: 'Bills & Utilities', color: '#0ea5e9', dot: 'bg-sky-500' },
  { id: 'transport', label: 'Transport', color: '#eab308', dot: 'bg-yellow-500' },
  { id: 'shopping', label: 'Shopping', color: '#ec4899', dot: 'bg-pink-500' },
  { id: 'entertainment', label: 'Entertainment', color: '#a855f7', dot: 'bg-purple-500' },
  { id: 'health', label: 'Health & Fitness', color: '#ef4444', dot: 'bg-red-500' },
  { id: 'education', label: 'Education', color: '#14b8a6', dot: 'bg-teal-500' },
  { id: 'travel', label: 'Travel', color: '#06b6d4', dot: 'bg-cyan-500' },
  { id: 'personal', label: 'Personal Care', color: '#f43f5e', dot: 'bg-rose-500' },
  { id: 'other', label: 'Other', color: '#64748b', dot: 'bg-slate-500' },
];

const INCOME_CATEGORIES = [
  { id: 'salary', label: 'Salary', color: '#10b981', dot: 'bg-emerald-500' },
  { id: 'freelance', label: 'Freelance', color: '#3b82f6', dot: 'bg-blue-500' },
  { id: 'business', label: 'Business', color: '#8b5cf6', dot: 'bg-violet-500' },
  { id: 'investment', label: 'Investments', color: '#84cc16', dot: 'bg-lime-500' },
  { id: 'gift', label: 'Gifts', color: '#d946ef', dot: 'bg-fuchsia-500' },
  { id: 'refund', label: 'Refunds', color: '#f59e0b', dot: 'bg-amber-500' },
  { id: 'other_income', label: 'Other Income', color: '#78716c', dot: 'bg-stone-500' },
];

const PAYMENT_METHODS = [
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'cash', label: 'Cash' },
  { id: 'bank', label: 'Bank transfer' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'other', label: 'Other' },
];

const CURRENCIES = [
  { code: 'INR', label: 'Indian Rupee (₹)', locale: 'en-IN' },
  { code: 'USD', label: 'US Dollar ($)', locale: 'en-US' },
  { code: 'CAD', label: 'Canadian Dollar ($)', locale: 'en-CA' },
  { code: 'EUR', label: 'Euro (€)', locale: 'en-IE' },
  { code: 'GBP', label: 'British Pound (£)', locale: 'en-GB' },
  { code: 'AUD', label: 'Australian Dollar ($)', locale: 'en-AU' },
  { code: 'AED', label: 'UAE Dirham', locale: 'en-AE' },
  { code: 'SGD', label: 'Singapore Dollar ($)', locale: 'en-SG' },
];

/** Budget key for the "whole month" budget (all expense categories together). */
const OVERALL_BUDGET = 'overall';

const TRANSACTION_TYPES = ['expense', 'income'];

const byId = new Map([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => [c.id, c]));

function categoriesFor(type) {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

function isValidCategory(type, id) {
  return categoriesFor(type).some((category) => category.id === id);
}

function getCategory(id) {
  if (id === OVERALL_BUDGET) {
    return { id, label: 'Overall monthly budget', color: '#0f766e', dot: 'bg-teal-700' };
  }
  return byId.get(id) || { id, label: id, color: '#64748b', dot: 'bg-slate-500' };
}

function getPaymentMethod(id) {
  return PAYMENT_METHODS.find((method) => method.id === id) || { id, label: id };
}

module.exports = {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_IDS: PAYMENT_METHODS.map((m) => m.id),
  CURRENCIES,
  CURRENCY_CODES: CURRENCIES.map((c) => c.code),
  OVERALL_BUDGET,
  TRANSACTION_TYPES,
  categoriesFor,
  isValidCategory,
  getCategory,
  getPaymentMethod,
};
