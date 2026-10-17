const config = require('../config/env');

/**
 * An error can happen before the session / view-helper middleware ran
 * (e.g. a request body that is too large), so make sure the layout has what it needs.
 */
function ensureLocals(res) {
  const locals = res.locals;
  if (!('currentUser' in locals)) locals.currentUser = null;
  if (!('flash' in locals)) locals.flash = [];
  if (!locals.csrfToken) locals.csrfToken = '';
  if (!locals.appName) locals.appName = config.appName;
  if (!locals.isActive) locals.isActive = () => false;
  if (!('demoEnabled' in locals)) locals.demoEnabled = config.demoEnabled;
}

function notFound(req, res) {
  ensureLocals(res);
  res.status(404).render('errors/error', {
    title: 'Page not found',
    status: 404,
    message: "The page you're looking for doesn't exist or was moved.",
  });
}

// Express recognises error handlers by their 4 arguments, so `next` must stay.
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  // A malformed id in the URL (e.g. /transactions/abc/edit) is simply "not found".
  if (error.name === 'CastError') return notFound(req, res);

  const status = Number(error.status || error.statusCode) || 500;
  if (status >= 500 && !config.isTest) console.error(error);
  if (res.headersSent) return undefined;

  ensureLocals(res);
  return res.status(status).render('errors/error', {
    title: status === 403 ? 'Request blocked' : 'Something went wrong',
    status,
    // Never show internal error details (stack traces, DB messages) to users.
    message: status < 500 ? error.message : 'An unexpected error occurred. Please try again in a moment.',
  });
}

module.exports = { notFound, errorHandler };
