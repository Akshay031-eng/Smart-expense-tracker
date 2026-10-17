const config = require('../config/env');
const { getDashboard } = require('../services/analytics');
const { today, monthKeyOf, isValidMonthKey } = require('../utils/dates');

async function show(req, res) {
  const todayDate = today(config.timeZone);
  const currentKey = monthKeyOf(todayDate);
  const requested = typeof req.query.month === 'string' ? req.query.month : '';
  // Past months only; anything else falls back to the current month.
  const monthKey = isValidMonthKey(requested) && requested <= currentKey ? requested : currentKey;

  const dashboard = await getDashboard(req.user, monthKey, todayDate);
  res.render('dashboard', { title: 'Dashboard', dashboard });
}

module.exports = { show };
