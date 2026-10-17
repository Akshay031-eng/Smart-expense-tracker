/**
 * Money is stored as an integer number of minor units (paise / cents).
 * 0.1 + 0.2 !== 0.3 in floating point, so amounts are never stored as decimals.
 */
const { CURRENCIES } = require('../config/categories');

const AMOUNT_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const formatters = new Map();

/**
 * "1,234.5" -> 123450. Returns null for anything that is not a positive
 * amount with at most 2 decimals. Parsed as text, never through a float.
 */
function parseAmountToMinor(input) {
  const text = String(input ?? '').trim().replace(/,/g, '');
  if (!AMOUNT_PATTERN.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return minor > 0 ? minor : null;
}

/** 123450 -> "1234.50" (the value an <input> needs when editing). */
function minorToInput(minor) {
  const value = Math.abs(Math.trunc(minor || 0));
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

/** style: "whole" (no decimals), "cents" (always 2 decimals) or "compact" (₹1.2L, $3.4K). */
function getFormatter(currency, style) {
  const key = `${currency}:${style}`;
  if (!formatters.has(key)) {
    const locale = (CURRENCIES.find((c) => c.code === currency) || CURRENCIES[0]).locale;
    const options = { style: 'currency', currency };
    if (style === 'compact') Object.assign(options, { notation: 'compact', maximumFractionDigits: 1 });
    else if (style === 'whole') Object.assign(options, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    else Object.assign(options, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatters.set(key, new Intl.NumberFormat(locale, options));
  }
  return formatters.get(key);
}

/**
 * 123450 + "INR" -> "₹1,234.50" ; 123400 -> "₹1,234" (whole amounts without ".00").
 */
function formatMoney(minor, currency = 'INR', { compact = false } = {}) {
  const value = Math.round(minor || 0);
  const style = compact ? 'compact' : value % 100 === 0 ? 'whole' : 'cents';
  return getFormatter(currency, style).format(value / 100);
}

/** "INR" -> "₹", "CAD" -> "$" (as shown in that currency's own locale). */
function currencySymbol(currency = 'INR') {
  const part = getFormatter(currency, 'whole').formatToParts(0).find((p) => p.type === 'currency');
  return part ? part.value : currency;
}

/** Rounds minor units to whole rupees/dollars: forecasts and daily allowances don't need paise. */
const roundToWhole = (minor) => Math.round(minor / 100) * 100;
const floorToWhole = (minor) => Math.floor(minor / 100) * 100;

module.exports = { parseAmountToMinor, minorToInput, formatMoney, currencySymbol, roundToWhole, floorToWhole };
