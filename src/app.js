/**
 * Builds the Express app. Kept separate from server.js so tests can create an
 * app without opening a port.
 */
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const methodOverride = require('method-override');
const config = require('./config/env');
const { loadUser } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/security');
const { flash, viewHelpers } = require('./middleware/locals');
const { notFound, errorHandler } = require('./middleware/errors');
const { SESSION_COOKIE } = require('./controllers/authController');
const { createRouter } = require('./routes');

const ROOT = path.join(__dirname, '..');
/** Folder of an installed npm package (some packages don't export package.json). */
function packageDir(name) {
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch {
    return path.join(ROOT, 'node_modules', name);
  }
}

/**
 * @param {object} [options]
 * @param {import('express-session').Store} [options.sessionStore] defaults to the in-memory store
 * @param {number} [options.authRateLimit] login/register attempts per 15 minutes per IP
 */
function createApp({ sessionStore, authRateLimit } = {}) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(ROOT, 'views'));
  // Render / Heroku / Nginx terminate HTTPS in front of the app: trust one proxy
  // hop so secure cookies and the rate limiter see the real protocol and IP.
  if (config.isProd) app.set('trust proxy', 1);

  // Security headers + a strict Content Security Policy: only our own scripts,
  // styles and fonts may load, which blocks most XSS payloads even if one slipped through.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: config.isProd ? [] : null,
        },
      },
    }),
  );
  app.use(compression());
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

  // Static files: our CSS/JS, plus Chart.js and the Inter font served from node_modules (no CDN).
  const staticOptions = { maxAge: config.isProd ? '7d' : 0 };
  app.use(express.static(path.join(ROOT, 'public'), staticOptions));
  app.use('/vendor/chart.js', express.static(path.join(packageDir('chart.js'), 'dist'), staticOptions));
  app.use('/fonts/inter', express.static(path.join(packageDir('@fontsource-variable/inter'), 'files'), staticOptions));
  app.use(
    '/fonts/bricolage',
    express.static(path.join(packageDir('@fontsource-variable/bricolage-grotesque'), 'files'), staticOptions),
  );

  // Forms: urlencoded with extended:false gives flat string values only (no nested objects).
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(express.json({ limit: '20kb' }));
  // HTML forms can only send GET/POST: <input name="_method" value="DELETE"> turns a POST into DELETE.
  app.use(
    methodOverride((req) => {
      if (req.body && typeof req.body._method === 'string') {
        const method = req.body._method.toUpperCase();
        delete req.body._method;
        if (['PUT', 'PATCH', 'DELETE'].includes(method)) return method;
      }
      return undefined;
    }),
  );

  app.use(
    session({
      name: SESSION_COOKIE,
      secret: config.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true, // not readable from JavaScript
        sameSite: 'lax', // not sent on cross-site POSTs
        secure: config.isProd, // HTTPS only in production
        maxAge: config.sessionMaxAgeMs,
      },
    }),
  );

  app.use(flash);
  app.use(csrfProtection);
  app.use(loadUser);
  app.use(viewHelpers);

  app.use(createRouter({ authRateLimit }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
