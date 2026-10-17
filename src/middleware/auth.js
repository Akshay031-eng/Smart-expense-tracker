const User = require('../models/User');

/** Loads the signed-in user (if any) into req.user and res.locals.currentUser. */
async function loadUser(req, res, next) {
  req.user = null;
  res.locals.currentUser = null;

  const userId = req.session && req.session.userId;
  if (userId) {
    const user = await User.findById(userId).lean();
    if (user) {
      req.user = user;
      res.locals.currentUser = user;
    } else {
      // The account was deleted: forget the stale session.
      delete req.session.userId;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  req.flash('info', 'Please sign in to continue.');
  return res.redirect('/login');
}

function requireGuest(req, res, next) {
  if (req.user) return res.redirect('/dashboard');
  return next();
}

/**
 * Signs a user in. The session id is regenerated first, so an attacker who
 * planted a session cookie before login cannot use it afterwards (session fixation).
 */
function signIn(req, userId) {
  const returnTo = req.session.returnTo;
  return new Promise((resolve, reject) => {
    req.session.regenerate((regenerateError) => {
      if (regenerateError) return reject(regenerateError);
      req.session.userId = String(userId);
      return req.session.save((saveError) => (saveError ? reject(saveError) : resolve(safeRedirect(returnTo))));
    });
  });
}

function signOut(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

/** Only allow redirects to our own pages ("/transactions"), never "//evil.com" or "https://...". */
function safeRedirect(target, fallback = '/dashboard') {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || target.includes('\\')) {
    return fallback;
  }
  return target;
}

module.exports = { loadUser, requireAuth, requireGuest, signIn, signOut, safeRedirect };
