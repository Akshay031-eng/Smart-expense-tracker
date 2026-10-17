/**
 * CSV export helpers.
 *
 * Two things matter: quoting (commas, quotes and line breaks inside a value)
 * and "CSV injection": Excel runs a cell that starts with = + - @ as a formula,
 * so a description like "=HYPERLINK(...)" is prefixed with ' to keep it text.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * @param {{key: string, header: string}[]} columns
 * @param {object[]} rows
 */
function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c.key])).join(','));
  // UTF-8 BOM so Excel shows ₹ and other non-ASCII characters correctly.
  return `﻿${lines.join('\r\n')}\r\n`;
}

module.exports = { csvCell, toCsv };
