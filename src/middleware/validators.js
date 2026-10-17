/**
 * Request validation rules (express-validator). Controllers call
 * `collectErrors(req)` and re-render the form with the messages.
 */
const { body, validationResult } = require('express-validator');
const config = require('../config/env');
const {
  TRANSACTION_TYPES,
  PAYMENT_METHOD_IDS,
  CURRENCY_CODES,
  isValidCategory,
} = require('../config/categories');
const { BUDGET_KEYS } = require('../models/Budget');
const { MAX_AMOUNT_MINOR } = require('../models/Transaction');
const { parseAmountToMinor } = require('../utils/money');
const { parseDateInput, today, addDays } = require('../utils/dates');

const EARLIEST_DATE = new Date('2000-01-01T00:00:00.000Z');

/** { fieldName: "first error message" } or null when the request is valid. */
function collectErrors(req) {
  const result = validationResult(req);
  if (result.isEmpty()) return null;
  const errors = {};
  for (const error of result.array()) {
    if (!errors[error.path]) errors[error.path] = error.msg;
  }
  return errors;
}

const lowercase = (value) => String(value || '').toLowerCase();

const password = (field) =>
  body(field)
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be 8 to 72 characters.')
    // bcrypt only uses the first 72 bytes; emoji count as up to 4 bytes each.
    .custom((value) => Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('Password is too long.');

const email = () =>
  body('email').trim().isEmail().withMessage('Enter a valid email address.').bail().isLength({ max: 254 }).customSanitizer(lowercase);

const registerRules = [
  body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Enter your name (2 to 60 characters).'),
  email().custom((value) => value !== config.demoEmail).withMessage('This email is reserved for the demo account.'),
  password('password'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match.'),
];

const loginRules = [
  email(),
  body('password').isString().notEmpty().withMessage('Enter your password.'),
];

const amountRule = (field, { min = 1, message }) =>
  body(field)
    .custom((value) => {
      const minor = parseAmountToMinor(value);
      return minor !== null && minor >= min && minor <= MAX_AMOUNT_MINOR;
    })
    .withMessage(message);

const transactionRules = [
  body('type').isIn(TRANSACTION_TYPES).withMessage('Choose expense or income.'),
  amountRule('amount', { message: 'Enter an amount above 0, with at most 2 decimals (e.g. 249.50).' }),
  body('category')
    .custom((value, { req }) => isValidCategory(req.body.type, value))
    .withMessage('Choose a category.'),
  body('date')
    .custom((value) => {
      const date = parseDateInput(value);
      return Boolean(date) && date >= EARLIEST_DATE && date <= addDays(today(config.timeZone), 366);
    })
    .withMessage('Choose a valid date.'),
  body('description').optional().isString().trim().isLength({ max: 120 }).withMessage('Keep the note under 120 characters.'),
  body('paymentMethod').isIn(PAYMENT_METHOD_IDS).withMessage('Choose a payment method.'),
];

const budgetRules = [
  body('category').isIn(BUDGET_KEYS).withMessage('Choose a category.'),
  amountRule('limit', { min: 100, message: 'Enter a monthly limit of at least 1.' }),
];

const profileRules = [
  body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Enter your name (2 to 60 characters).'),
  body('currency').isIn(CURRENCY_CODES).withMessage('Choose a currency.'),
];

const passwordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Enter your current password.'),
  password('newPassword'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match.'),
];

module.exports = {
  collectErrors,
  registerRules,
  loginRules,
  transactionRules,
  budgetRules,
  profileRules,
  passwordRules,
};
