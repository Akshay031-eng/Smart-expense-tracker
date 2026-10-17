const mongoose = require('mongoose');
const { csvCell, toCsv } = require('../../src/services/csv');
const { buildTransactions } = require('../../src/services/demoData');
const { safeRedirect } = require('../../src/middleware/auth');
const { isValidCategory } = require('../../src/config/categories');

describe('csv', () => {
  test('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Lunch, dinner')).toBe('"Lunch, dinner"');
    expect(csvCell('5" screen')).toBe('"5"" screen"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
  });

  test('neutralises spreadsheet formulas (CSV injection)', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  test('starts with a UTF-8 BOM and uses CRLF', () => {
    const csv = toCsv([{ key: 'a', header: 'A' }], [{ a: '₹' }]);
    expect(csv.startsWith('﻿A\r\n₹\r\n')).toBe(true);
  });
});

describe('safeRedirect', () => {
  test.each([
    ['/transactions?page=2', '/transactions?page=2'],
    ['//evil.example', '/dashboard'],
    ['https://evil.example', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
    [undefined, '/dashboard'],
  ])('%p -> %p', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});

describe('demo data', () => {
  const user = new mongoose.Types.ObjectId();
  const today = new Date('2026-10-17T00:00:00Z');

  test('is valid, never in the future, and covers 4 months', () => {
    const rows = buildTransactions(user, today);
    expect(rows.length).toBeGreaterThan(80);
    expect(rows.every((r) => r.date <= today)).toBe(true);
    expect(rows.every((r) => Number.isInteger(r.amount) && r.amount > 0)).toBe(true);
    expect(rows.every((r) => isValidCategory(r.type, r.category))).toBe(true);
    const months = new Set(rows.map((r) => r.date.toISOString().slice(0, 7)));
    expect([...months].sort()).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
  });

  test('is the same for the same day', () => {
    const a = buildTransactions(user, today).map((r) => r.amount);
    const b = buildTransactions(user, today).map((r) => r.amount);
    expect(a).toEqual(b);
  });
});
