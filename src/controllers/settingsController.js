const User = require('../models/User');
const { CURRENCIES } = require('../config/categories');
const { collectErrors } = require('../middleware/validators');

function render(req, res, { errors = {}, values = {}, status = 200 } = {}) {
  res.status(status).render('settings', {
    title: 'Settings',
    currencies: CURRENCIES,
    errors,
    values: { name: req.user.name, currency: req.user.currency, ...values },
  });
}

function show(req, res) {
  render(req, res);
}

function blockDemo(req, res) {
  if (!req.user.isDemo) return false;
  req.flash('error', 'Settings of the shared demo account cannot be changed. Create your own free account to try this.');
  res.redirect('/settings');
  return true;
}

async function updateProfile(req, res) {
  if (blockDemo(req, res)) return undefined;
  const errors = collectErrors(req);
  if (errors) return render(req, res, { errors, values: { name: req.body.name, currency: req.body.currency }, status: 422 });

  await User.updateOne({ _id: req.user._id }, { $set: { name: req.body.name, currency: req.body.currency } }, { runValidators: true });
  req.flash('success', 'Profile updated.');
  return res.redirect('/settings');
}

async function updatePassword(req, res) {
  if (blockDemo(req, res)) return undefined;
  const errors = collectErrors(req);
  if (errors) return render(req, res, { errors, status: 422 });

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.verifyPassword(req.body.currentPassword))) {
    return render(req, res, { errors: { currentPassword: 'Current password is incorrect.' }, status: 422 });
  }
  user.passwordHash = await User.hashPassword(req.body.newPassword);
  await user.save();
  req.flash('success', 'Password changed.');
  return res.redirect('/settings');
}

module.exports = { show, updateProfile, updatePassword };
