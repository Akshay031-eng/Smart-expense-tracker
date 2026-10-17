const mongoose = require('mongoose');
const config = require('../config/env');
const Transaction = require('../models/Transaction');
const {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  TRANSACTION_TYPES,
  isValidCategory,
  getCategory,
  getPaymentMethod,
} = require('../config/categories');
const { collectErrors } = require('../middleware/validators');
const { safeRedirect } = require('../middleware/auth');
const { parseAmountToMinor, minorToInput } = require('../utils/money');
const { parseDateInput, toDateInput, today, addDays } = require('../utils/dates');
const { toCsv } = require('../services/csv');

const PAGE_SIZE = 15;
const EXPORT_LIMIT = 20_000;

const SORTS = {
  newest: { date: -1, createdAt: -1 },
  oldest: { date: 1, createdAt: 1 },
  highest: { amount: -1, date: -1 },
  lowest: { amount: 1, date: -1 },
};

// Only plain strings from the query string are used, so arrays or objects
// (?type[$ne]=x) can never reach a MongoDB query.
const str = (value) => (typeof value === 'string' ? value.trim() : '');

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function readFilters(query) {
  const type = TRANSACTION_TYPES.includes(str(query.type)) ? str(query.type) : '';
  let category = str(query.category);
  const categoryOk = type ? isValidCategory(type, category) : isValidCategory('expense', category) || isValidCategory('income', category);
  if (!categoryOk) category = '';

  return {
    type,
    category,
    from: parseDateInput(str(query.from)) ? str(query.from) : '',
    to: parseDateInput(str(query.to)) ? str(query.to) : '',
    q: str(query.q).slice(0, 60),
    sort: SORTS[str(query.sort)] ? str(query.sort) : 'newest',
    page: Math.max(1, Number.parseInt(str(query.page), 10) || 1),
  };
}

function buildQuery(userId, filters) {
  const query = { user: userId };
  if (filters.type) query.type = filters.type;
  if (filters.category) query.category = filters.category;
  if (filters.from || filters.to) {
    query.date = {};
    if (filters.from) query.date.$gte = parseDateInput(filters.from);
    if (filters.to) query.date.$lt = addDays(parseDateInput(filters.to), 1); // "to" is inclusive
  }
  // User text is escaped, so "(" or ".*" are matched literally and can't build a slow regex.
  if (filters.q) query.description = { $regex: escapeRegex(filters.q), $options: 'i' };
  return query;
}

/** "?type=expense&page=2" for links that keep the current filters. */
function queryString(filters, overrides = {}) {
  const params = new URLSearchParams();
  const merged = { ...filters, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value && !(key === 'sort' && value === 'newest') && !(key === 'page' && Number(value) === 1)) {
      params.set(key, value);
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function index(req, res) {
  const filters = readFilters(req.query);
  const query = buildQuery(req.user._id, filters);

  const [total, totalsRows] = await Promise.all([
    Transaction.countDocuments(query),
    Transaction.aggregate([{ $match: query }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pages);

  const transactions = await Transaction.find(query)
    .sort(SORTS[filters.sort])
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  const totals = { income: 0, expense: 0 };
  for (const row of totalsRows) totals[row._id] = row.total;

  res.render('transactions/index', {
    title: 'Transactions',
    transactions,
    filters: { ...filters, page },
    totals,
    pagination: { page, pages, total, from: total ? (page - 1) * PAGE_SIZE + 1 : 0, to: Math.min(page * PAGE_SIZE, total) },
    hasFilters: Boolean(filters.type || filters.category || filters.from || filters.to || filters.q),
    queryString: (overrides) => queryString({ ...filters, page }, overrides),
    expenseCategories: EXPENSE_CATEGORIES,
    incomeCategories: INCOME_CATEGORIES,
  });
}

function formView(res, { mode, values, errors = {}, status = 200, id = null }) {
  res.status(status).render('transactions/form', {
    title: mode === 'edit' ? 'Edit transaction' : values.type === 'income' ? 'Add income' : 'Add expense',
    mode,
    id,
    values,
    errors,
    expenseCategories: EXPENSE_CATEGORIES,
    incomeCategories: INCOME_CATEGORIES,
    paymentMethods: PAYMENT_METHODS,
  });
}

function valuesFromBody(body) {
  return {
    type: TRANSACTION_TYPES.includes(body.type) ? body.type : 'expense',
    amount: str(body.amount),
    category: str(body.category),
    date: str(body.date),
    description: str(body.description),
    paymentMethod: str(body.paymentMethod),
    returnTo: safeRedirect(body.returnTo, '/transactions'),
  };
}

function fieldsFromValues(values) {
  return {
    type: values.type,
    amount: parseAmountToMinor(values.amount),
    category: values.category,
    date: parseDateInput(values.date),
    description: values.description,
    paymentMethod: values.paymentMethod,
  };
}

function newForm(req, res) {
  const type = req.query.type === 'income' ? 'income' : 'expense';
  formView(res, {
    mode: 'new',
    values: {
      type,
      amount: '',
      category: '',
      date: toDateInput(today(config.timeZone)),
      description: '',
      paymentMethod: 'upi',
      returnTo: safeRedirect(str(req.query.returnTo), '/transactions'),
    },
  });
}

async function create(req, res) {
  const values = valuesFromBody(req.body);
  const errors = collectErrors(req);
  if (errors) return formView(res, { mode: 'new', values, errors, status: 422 });

  await Transaction.create({ ...fieldsFromValues(values), user: req.user._id });
  req.flash('success', values.type === 'income' ? 'Income added.' : 'Expense added.');
  return res.redirect(values.returnTo);
}

/** Loads a transaction only if it belongs to the signed-in user (prevents IDOR). */
async function findOwn(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return Transaction.findOne({ _id: req.params.id, user: req.user._id });
}

const notFound = (res) =>
  res.status(404).render('errors/error', { title: 'Not found', status: 404, message: 'That transaction does not exist.' });

async function editForm(req, res) {
  const transaction = await findOwn(req);
  if (!transaction) return notFound(res);
  return formView(res, {
    mode: 'edit',
    id: transaction.id,
    values: {
      type: transaction.type,
      amount: minorToInput(transaction.amount),
      category: transaction.category,
      date: toDateInput(transaction.date),
      description: transaction.description,
      paymentMethod: transaction.paymentMethod,
      returnTo: safeRedirect(str(req.query.returnTo), '/transactions'),
    },
  });
}

async function update(req, res) {
  const transaction = await findOwn(req);
  if (!transaction) return notFound(res);

  const values = valuesFromBody(req.body);
  const errors = collectErrors(req);
  if (errors) return formView(res, { mode: 'edit', id: transaction.id, values, errors, status: 422 });

  transaction.set(fieldsFromValues(values));
  await transaction.save(); // runs the schema validators (category must match type)
  req.flash('success', 'Transaction updated.');
  return res.redirect(values.returnTo);
}

async function destroy(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
  const result = await Transaction.deleteOne({ _id: req.params.id, user: req.user._id });
  if (!result.deletedCount) return notFound(res);
  req.flash('success', 'Transaction deleted.');
  return res.redirect(safeRedirect(req.body.returnTo, '/transactions'));
}

async function exportCsv(req, res) {
  const filters = readFilters(req.query);
  const rows = await Transaction.find(buildQuery(req.user._id, filters))
    .sort(SORTS[filters.sort])
    .limit(EXPORT_LIMIT)
    .lean();

  const csv = toCsv(
    [
      { key: 'date', header: 'Date' },
      { key: 'type', header: 'Type' },
      { key: 'category', header: 'Category' },
      { key: 'description', header: 'Description' },
      { key: 'paymentMethod', header: 'Payment method' },
      { key: 'amount', header: 'Amount' },
      { key: 'currency', header: 'Currency' },
    ],
    rows.map((row) => ({
      date: toDateInput(row.date),
      type: row.type,
      category: getCategory(row.category).label,
      description: row.description,
      paymentMethod: getPaymentMethod(row.paymentMethod).label,
      amount: minorToInput(row.amount),
      currency: req.user.currency,
    })),
  );

  const stamp = toDateInput(today(config.timeZone));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="transactions-${stamp}.csv"`);
  res.send(csv);
}

module.exports = { index, newForm, create, editForm, update, destroy, exportCsv, readFilters, buildQuery, queryString };
