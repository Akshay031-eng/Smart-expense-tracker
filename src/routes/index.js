const express = require('express');
const config = require('../config/env');
const { isDbConnected } = require('../config/db');
const { requireAuth, requireGuest } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');
const rules = require('../middleware/validators');
const auth = require('../controllers/authController');
const dashboard = require('../controllers/dashboardController');
const transactions = require('../controllers/transactionController');
const budgets = require('../controllers/budgetController');
const settings = require('../controllers/settingsController');

function createRouter({ authRateLimit = config.authRateLimit } = {}) {
  const router = express.Router();
  const limiter = authLimiter(authRateLimit);

  // Public
  router.get('/', (req, res) => (req.user ? res.redirect('/dashboard') : res.render('home', { title: 'Track spending, stay on budget' })));
  router.get('/health', (req, res) => {
    const up = isDbConnected();
    res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'degraded', database: up ? 'connected' : 'disconnected' });
  });

  // Auth (Express 5 passes errors from async handlers to the error handler automatically)
  router.get('/login', requireGuest, auth.showLogin);
  router.post('/login', requireGuest, limiter, rules.loginRules, auth.login);
  router.get('/register', requireGuest, auth.showRegister);
  router.post('/register', requireGuest, limiter, rules.registerRules, auth.register);
  router.post('/demo', limiter, auth.demoLogin);
  router.post('/logout', auth.logout);

  // Signed-in users only (requireAuth on each route, so unknown URLs still get a 404)
  router.get('/dashboard', requireAuth, dashboard.show);

  router.get('/transactions', requireAuth, transactions.index);
  router.get('/transactions/new', requireAuth, transactions.newForm);
  router.get('/transactions/export', requireAuth, transactions.exportCsv);
  router.post('/transactions', requireAuth, rules.transactionRules, transactions.create);
  router.get('/transactions/:id/edit', requireAuth, transactions.editForm);
  router.put('/transactions/:id', requireAuth, rules.transactionRules, transactions.update);
  router.delete('/transactions/:id', requireAuth, transactions.destroy);

  router.get('/budgets', requireAuth, budgets.index);
  router.post('/budgets', requireAuth, rules.budgetRules, budgets.upsert);
  router.delete('/budgets/:category', requireAuth, budgets.destroy);

  router.get('/settings', requireAuth, settings.show);
  router.put('/settings/profile', requireAuth, rules.profileRules, settings.updateProfile);
  router.put('/settings/password', requireAuth, rules.passwordRules, settings.updatePassword);

  return router;
}

module.exports = { createRouter };
