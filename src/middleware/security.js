const crypto = require('node:crypto');
const rateLimit = require('express-rate-limit');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection (synchronizer token pattern).
 * Each session gets a random token. Every form sends it back in a hidden
 * `_csrf` field; a request from another site cannot read the token, so it
 * cannot forge a valid POST / PUT / DELETE.
 */
function csrfProtection(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (SAFE_METHODS.has(req.method)) return next();

  const sent = String((req.body && req.body._csrf) || req.get('x-csrf-token') || '');
  const expected = Buffer.from(req.session.csrfToken);
  const received = Buffer.from(sent);
  // timingSafeEqual: comparison time does not reveal how many characters matched.
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    const error = new Error('Your form expired or was sent from another site. Please refresh the page and try again.');
    error.status = 403;
    return next(error);
  }
  return next();
}

/** Brute-force protection for login / register (per IP). */
function authLimiter(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(req, res) {
      const view = req.path.includes('register') ? 'auth/register' : 'auth/login';
      res.status(429).render(view, {
        title: view.endsWith('login') ? 'Sign in' : 'Create account',
        errors: { form: 'Too many attempts. Please wait 15 minutes and try again.' },
        values: { name: req.body?.name || '', email: req.body?.email || '' },
      });
    },
  });
}

module.exports = { csrfProtection, authLimiter };
