const { parseAmountToMinor, minorToInput, formatMoney, currencySymbol } = require('../../src/utils/money');
const dates = require('../../src/utils/dates');

describe('money', () => {
  test.each([
    ['249.50', 24950],
    ['249.5', 24950],
    ['1,23,456', 12345600],
    [' 10 ', 1000],
    ['0.01', 1],
  ])('parses %p as %p minor units', (input, expected) => {
    expect(parseAmountToMinor(input)).toBe(expected);
  });

  test.each(['', 'abc', '-5', '0', '0.00', '1.234', '1e5', '12345678901', null, undefined, '10.5.5'])(
    'rejects %p',
    (input) => {
      expect(parseAmountToMinor(input)).toBeNull();
    },
  );

  test('never goes through floating point (0.1 + 0.2 problem)', () => {
    expect(parseAmountToMinor('0.10') + parseAmountToMinor('0.20')).toBe(parseAmountToMinor('0.30'));
  });

  test('minorToInput gives the value for an edit form', () => {
    expect(minorToInput(24950)).toBe('249.50');
    expect(minorToInput(5)).toBe('0.05');
    expect(minorToInput(100000)).toBe('1000.00');
  });

  test('formats rupees with Indian digit grouping', () => {
    expect(formatMoney(12345600, 'INR')).toBe('₹1,23,456');
    expect(formatMoney(250050, 'INR')).toBe('₹2,500.50');
    expect(formatMoney(0, 'INR')).toBe('₹0');
  });

  test('formats other currencies in their own style', () => {
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
    expect(currencySymbol('INR')).toBe('₹');
    expect(currencySymbol('GBP')).toBe('£');
  });
});

describe('dates', () => {
  test('parses calendar days as UTC midnight and rejects impossible dates', () => {
    expect(dates.parseDateInput('2026-10-17').toISOString()).toBe('2026-10-17T00:00:00.000Z');
    expect(dates.parseDateInput('2026-02-30')).toBeNull();
    expect(dates.parseDateInput('17/10/2026')).toBeNull();
    expect(dates.parseDateInput(undefined)).toBeNull();
  });

  test('month ranges are [first day, first day of next month)', () => {
    const { start, end } = dates.monthRange('2026-12');
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  test('month arithmetic crosses years and knows leap years', () => {
    expect(dates.addMonths('2026-01', -1)).toBe('2025-12');
    expect(dates.addMonths('2026-11', 3)).toBe('2027-02');
    expect(dates.daysInMonth('2028-02')).toBe(29);
    expect(dates.daysInMonth('2026-02')).toBe(28);
  });

  test('"today" follows the configured time zone', () => {
    // 20:00 UTC on 31 Oct is already 1 Nov in India (UTC+5:30).
    const now = new Date('2026-10-31T20:00:00Z');
    expect(dates.toDateInput(dates.today('Asia/Kolkata', now))).toBe('2026-11-01');
    expect(dates.toDateInput(dates.today('UTC', now))).toBe('2026-10-31');
  });

  test('validates month keys', () => {
    expect(dates.isValidMonthKey('2026-10')).toBe(true);
    expect(dates.isValidMonthKey('2026-13')).toBe(false);
    expect(dates.isValidMonthKey('1999-01')).toBe(false);
    expect(dates.isValidMonthKey(['2026-10'])).toBe(false);
  });

  test('labels', () => {
    expect(dates.monthLabel('2026-10')).toBe('October 2026');
    expect(dates.monthLabel('2026-10', { short: true })).toBe('Oct');
    expect(dates.formatDate(new Date('2026-10-07T00:00:00Z'))).toBe('7 Oct 2026');
  });
});
