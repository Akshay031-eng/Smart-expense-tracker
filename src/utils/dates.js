/**
 * Date helpers.
 *
 * A transaction has a calendar day, not a moment in time, so it is stored as
 * UTC midnight of the day the user picked ("2026-10-17" -> 2026-10-17T00:00Z).
 * Month ranges are therefore simple UTC ranges: [1st 00:00, next 1st 00:00).
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n) => String(n).padStart(2, '0');

/** "2026-10-17" -> Date at UTC midnight, or null if invalid (e.g. "2026-02-30"). */
function parseDateInput(text) {
  if (typeof text !== 'string' || !DATE_PATTERN.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return null;
  return date;
}

/** Date -> "2026-10-17" */
function toDateInput(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Today's calendar date in a time zone, as UTC midnight. */
function today(timeZone = 'UTC', now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  const text = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return parseDateInput(text);
}

/** Date -> "2026-10" */
function monthKeyOf(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function isValidMonthKey(key) {
  const match = typeof key === 'string' && MONTH_PATTERN.exec(key);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 && Number(match[1]) >= 2000;
}

function splitMonthKey(key) {
  const [year, month] = key.split('-').map(Number);
  return { year, month };
}

/** "2026-10" -> { start: 2026-10-01, end: 2026-11-01 } (end is exclusive). */
function monthRange(key) {
  const { year, month } = splitMonthKey(key);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

function addMonths(key, count) {
  const { year, month } = splitMonthKey(key);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return monthKeyOf(date);
}

function daysInMonth(key) {
  const { year, month } = splitMonthKey(key);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(date, count) {
  return new Date(new Date(date).getTime() + count * DAY_MS);
}

/** "2026-10" -> "October 2026" (or "Oct" with { short: true }) */
function monthLabel(key, { short = false, withYear = !short } = {}) {
  const { year, month } = splitMonthKey(key);
  const name = (short ? SHORT_MONTHS : LONG_MONTHS)[month - 1];
  return withYear ? `${name} ${year}` : name;
}

/** Date -> "17 Oct 2026" */
function formatDate(date) {
  const d = new Date(date);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

module.exports = {
  DAY_MS,
  parseDateInput,
  toDateInput,
  today,
  monthKeyOf,
  isValidMonthKey,
  monthRange,
  addMonths,
  daysInMonth,
  addDays,
  monthLabel,
  formatDate,
};
