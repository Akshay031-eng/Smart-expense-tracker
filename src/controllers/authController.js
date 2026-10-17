const bcrypt = require('bcryptjs');
const config = require('../config/env');
const User = require('../models/User');
const { signIn, signOut } = require('../middleware/auth');
const { collectErrors } = require('../middleware/validators');
const { ensureDemoUser } = require('../services/demoData');
const { today } = require('../utils/dates');

const SESSION_COOKIE = 'set.sid';

// Comparing against a dummy hash when the email doesn't exist makes a failed
// login take the same time either way, so response time can't reveal which emails are registered.
let dummyHash;
const getDummyHash = () => (dummyHash ||= bcrypt.hash('not-a-real-password', config.bcryptRounds));

function showLogin(req, res) {
  res.render('auth/login', { title: 'Sign in', errors: {}, values: {} });
}

async function login(req, res) {
  const values = { email: req.body.email || '' };
  const errors = collectErrors(req);
  if (errors) return res.status(422).render('auth/login', { title: 'Sign in', errors, values });

  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  const passwordOk = user
    ? await user.verifyPassword(req.body.password)
    : await bcrypt.compare(req.body.password, await getDummyHash()).then(() => false);

  if (!passwordOk) {
    return res.status(401).render('auth/login', {
      title: 'Sign in',
      errors: { form: 'Incorrect email or password.' },
      values,
    });
  }

  const redirectTo = await signIn(req, user._id);
  req.flash('success', `Welcome back, ${user.name.split(' ')[0]}!`);
  return res.redirect(redirectTo);
}

function showRegister(req, res) {
  res.render('auth/register', { title: 'Create account', errors: {}, values: {} });
}

async function register(req, res) {
  const values = { name: req.body.name || '', email: req.body.email || '' };
  const errors = collectErrors(req);
  if (errors) return res.status(422).render('auth/register', { title: 'Create account', errors, values });

  let user;
  try {
    user = await User.create({
      name: req.body.name,
      email: req.body.email,
      passwordHash: await User.hashPassword(req.body.password),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).render('auth/register', {
        title: 'Create account',
        errors: { email: 'An account with this email already exists. Try signing in.' },
        values,
      });
    }
    throw error;
  }

  await signIn(req, user._id);
  req.flash('success', 'Account created. Add your first transaction to get started.');
  return res.redirect('/dashboard');
}

async function logout(req, res) {
  await signOut(req);
  res.clearCookie(SESSION_COOKIE);
  res.redirect('/');
}

async function demoLogin(req, res) {
  if (!config.demoEnabled) return res.status(404).render('errors/error', { title: 'Not found', status: 404, message: 'The demo is turned off.' });
  const user = await ensureDemoUser(config.demoEmail, today(config.timeZone));
  await signIn(req, user._id);
  return res.redirect('/dashboard');
}

module.exports = { SESSION_COOKIE, showLogin, login, showRegister, register, logout, demoLogin };
