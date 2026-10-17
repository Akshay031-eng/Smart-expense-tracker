const config = require('../config/env');
const categories = require('../config/categories');
const { formatMoney, minorToInput, currencySymbol } = require('../utils/money');
const { formatDate, toDateInput, monthLabel } = require('../utils/dates');

/**
 * Flash messages: stored in the session, shown once on the next page render.
 * The getter only empties them when a page is actually rendered, so a message
 * survives a redirect chain.
 */
function flash(req, res, next) {
  req.flash = (type, message) => {
    req.session.flash = [...(req.session.flash || []), { type, message }];
  };
  Object.defineProperty(res.locals, 'flash', {
    enumerable: true,
    configurable: true,
    get() {
      const messages = req.session.flash || [];
      delete req.session.flash;
      return messages;
    },
  });
  next();
}

/** Helpers available in every EJS view. */
function viewHelpers(req, res, next) {
  const currency = (req.user && req.user.currency) || 'INR';
  Object.assign(res.locals, {
    appName: config.appName,
    currentPath: req.path,
    currency,
    currencySymbol: currencySymbol(currency),
    demoEnabled: config.demoEnabled,
    money: (minor, options) => formatMoney(minor, currency, options),
    minorToInput,
    formatDate,
    toDateInput,
    monthLabel,
    category: categories.getCategory,
    paymentMethod: categories.getPaymentMethod,
    isActive: (prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`),
  });
  next();
}

module.exports = { flash, viewHelpers };
