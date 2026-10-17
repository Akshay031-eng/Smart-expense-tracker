/**
 * All configuration in one place. Values come from environment variables;
 * a local `.env` file is loaded automatically when it exists.
 */
const path = require('node:path');

try {
  // Built into Node.js (>= 20.12) - no dotenv dependency needed.
  // Existing environment variables are never overwritten.
  process.loadEnvFile(path.join(__dirname, '..', '..', '.env'));
} catch {
  // No .env file: rely on real environment variables (Render, CI, tests).
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

function toInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

const config = {
  env: NODE_ENV,
  isProd,
  isTest,
  appName: 'Smart Expense Tracker',
  port: toInt(process.env.PORT, 3000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_expense_tracker',

  sessionSecret: process.env.SESSION_SECRET || (isProd ? '' : 'dev-only-secret-change-me-in-production'),
  // "mongo" keeps sessions in MongoDB (survive restarts); "memory" is for tests / quick local runs.
  sessionStore: process.env.SESSION_STORE || (isTest ? 'memory' : 'mongo'),
  sessionMaxAgeMs: 7 * 24 * 60 * 60 * 1000,

  // Used for "today" and the current month, so a user in India at 1 a.m. on the 1st
  // already sees the new month even though it is still the previous day in UTC.
  timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',

  bcryptRounds: isTest ? 4 : toInt(process.env.BCRYPT_ROUNDS, 12),
  authRateLimit: toInt(process.env.AUTH_RATE_LIMIT, 20),

  demoEnabled: process.env.DEMO_ENABLED !== 'false',
  demoEmail: (process.env.DEMO_EMAIL || 'demo@smartexpense.app').toLowerCase(),
};

if (isProd && config.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters in production.');
}

module.exports = config;
