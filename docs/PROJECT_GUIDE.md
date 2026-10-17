# Project guide: how Smart Expense Tracker works

This guide explains what the app does, how a request flows through it, why each design decision was made, and the questions an interviewer is likely to ask.

## 1. The 30-second pitch

> "Smart Expense Tracker is a server-rendered Node.js app built with Express, MongoDB, EJS and Tailwind. Users record expenses and income, set monthly budgets per category, and the dashboard turns that into a forecast, budget alerts and comparisons with last month. Money is stored as integer paise, every query is scoped to the signed-in user, and it has CSRF protection, a strict Content Security Policy, rate-limited login and 88 automated tests running in CI against a real MongoDB."

## 2. Architecture (MVC)

```
Browser ──HTTP──▶ Express app (src/app.js)
                   │  helmet (CSP) → static files → body parser → method-override
                   │  → session (MongoDB store) → flash → CSRF → loadUser → view helpers
                   ▼
                 routes/index.js ──▶ middleware (requireAuth, validators, rate limit)
                   ▼
                 controllers/*  ──▶ services/* (analytics, insights, csv, demo data)
                   ▼                      ▼
                 views/*.ejs         models/* (Mongoose) ──▶ MongoDB
```

- **Routes** list every URL and the middleware it needs.
- **Controllers** read the request, call services and models, and render a view or redirect.
- **Services** hold business logic. `insights.js` has no database access at all, so it is unit-tested with plain numbers.
- **Models** define schemas, validation and indexes.
- **Views** are EJS templates. `<%= %>` escapes HTML, which protects against XSS.

### Example: adding an expense

1. The form posts `POST /transactions` with a hidden `_csrf` token.
2. `csrfProtection` compares the token with the one stored in the session (timing-safe).
3. `requireAuth` checks there is a signed-in user.
4. `transactionRules` (express-validator) check the amount, category, date and payment method. On failure the form is shown again with HTTP 422, the messages and the typed values.
5. The controller converts `"249.50"` into `24950` paise and `"2026-10-05"` into a UTC-midnight `Date`, then calls `Transaction.create({ ..., user: req.user._id })`.
6. A flash message is stored and the browser is redirected (Post/Redirect/Get, so a refresh doesn't submit twice).

## 3. Key design decisions

| Decision | Why | Alternative and why not |
|---|---|---|
| **Money as integer paise** (`24950` = ₹249.50) | Floats can't represent 0.1 exactly: `0.1 + 0.2 !== 0.3`. Integers add up exactly. Input is parsed as text, never through `parseFloat`. | `Decimal128`: exact, but awkward in JavaScript and aggregation. |
| **Dates as UTC midnight of the chosen day** | A transaction has a calendar day, not a moment. Month ranges become simple `[1st, next 1st)` queries. | Local-time timestamps: an expense at 11 p.m. in India falls on the next day in UTC and lands in the wrong month. |
| **"Today" from `APP_TIMEZONE`** | At 1 a.m. IST on the 1st it is still the previous day in UTC; users expect the new month. | Server time: wrong for 5.5 hours every month. |
| **Compound indexes `{user, date}` and `{user, type, date}`** | Every query is "this user, this date range". The index makes it a range scan instead of a collection scan. | No index: fine at 100 rows, slow at 1 million. |
| **Server-rendered EJS** | One server, no API layer to secure separately, fast first paint, works without JavaScript. | React SPA: needs a JSON API, token handling and a separate deploy; overkill for forms and tables. |
| **Sessions in MongoDB** (`connect-mongo`) | Logins survive restarts and deploys, and expired sessions are removed by a TTL index. | Memory store: everyone is logged out on every restart. JWT: hard to revoke, and still needs CSRF care in cookies. |
| **Budgets repeat monthly** (one document per user + category, unique index) | Users set a limit once. The unique index also makes the upsert safe. | One budget per month: more data and more work for users. |
| **Forecast excludes rent and bills** | Rent paid on day 2 × 15 would predict an absurd month. Only variable spending is extrapolated, and there are no pace warnings before day 5. | Naive `spent / day × days`: false alarms every month. |
| **Insights as pure functions** | Easy to test every rule with plain numbers; no database needed. | Logic inside the controller: hard to test. |
| **Chart.js and fonts served from `node_modules`** | No CDN, so the CSP can stay `'self'` only. | CDN: adds third-party origins to the CSP. |

## 4. Security

| Risk | Protection |
|---|---|
| Password theft | bcrypt hash (cost 12), `passwordHash` hidden from queries by default (`select: false`) |
| Account enumeration by timing | When an email isn't found, a dummy hash is still compared, so failed logins take the same time |
| Brute force | `express-rate-limit`: 20 login/register attempts per 15 minutes per IP |
| Session fixation | `req.session.regenerate()` at login issues a new session id |
| Session cookie theft | `httpOnly`, `sameSite=lax`, `secure` in production |
| CSRF | Per-session random token in every form, checked on every POST/PUT/DELETE |
| XSS | EJS escapes output; CSP allows only our own scripts (no inline JavaScript at all) |
| Seeing or editing someone else's data (IDOR) | Every query includes `user: req.user._id`; a foreign id returns 404 |
| NoSQL operator injection (`?type[$ne]=x`) | Only plain strings are read from the query and validated against allow-lists |
| Regex injection / ReDoS in search | Search text is escaped before it becomes a regex |
| CSV / formula injection | Cells starting with `= + - @` are prefixed with `'` |
| Open redirect (`returnTo=https://evil`) | `safeRedirect` only allows paths that start with a single `/` |
| Huge requests | Body limit 20 kB, field length limits |
| Leaking errors | Users see a generic message for 500s; details only in the server log |

## 5. Interview questions and answers

**Why Express and not a full framework like NestJS?**
The app is small and request/response based. Express keeps the flow explicit: middleware, routes, controllers. I organised it as MVC myself. NestJS adds modules, decorators and dependency injection, which pay off in large teams.

**What does Express 5 change?**
Rejected promises from async handlers go to the error handler automatically, so no `try/catch` or `asyncHandler` wrapper is needed. Path syntax is stricter, and `req.query` is a getter.

**Why MongoDB for this app?**
A transaction is a self-contained document, the schema is simple, and aggregation gives the sums I need. Mongoose adds schema validation on top. The data is still relational in one place (transactions belong to users), which I handle with an indexed `user` field instead of joins.

**How does the dashboard calculate totals?**
With aggregation pipelines: `$match` on user and date range, then `$group` by type or category with `$sum: '$amount'`. The 6-month trend runs six small indexed queries in parallel with `Promise.all`. The daily running total loads one month's `{date, amount}` and buckets it in JavaScript, because one user's month is small.

**How do you send PUT and DELETE from an HTML form?**
Forms only support GET and POST. A hidden `_method` field plus `method-override` turns the POST into PUT or DELETE before routing, which keeps the routes RESTful.

**Why validate on the server if the browser validates too?**
Anyone can send a request without the browser (curl, Postman). Server validation with express-validator is the real check. The browser's `required` and `inputmode` only improve the experience.

**How do you prevent one user from editing another user's transaction?**
I never load by id alone: it's always `findOne({ _id, user: req.user._id })`. Someone else's id simply isn't found and returns 404. There's a test with two users for exactly this case.

**How does CSRF protection work here?**
Each session gets a random 32-byte token. Every form includes it as a hidden field. The server compares it with `crypto.timingSafeEqual`. A malicious site can make the browser send the cookie, but it can't read the token, so its forged request fails with 403.

**What is the Post/Redirect/Get pattern?**
After a successful POST I redirect to a GET page. Refreshing then reloads the GET page instead of submitting the form again, and the flash message survives the redirect via the session.

**How would you scale this?**
Run several app instances behind a load balancer (sessions are already in MongoDB, so any instance can serve any user). Add a cache or pre-computed monthly summaries for the dashboard, and move rate limiting to Redis so limits are shared across instances.

**Why is the demo reseed "atomic"?**
`updateOne({ _id, demoSeededAt older than 6h }, { $set: { demoSeededAt: now } })` matches only once. Of two simultaneous requests, only the one that gets `modifiedCount === 1` regenerates the data, so it can't be duplicated.

**What would you add next?**
Recurring transactions (rent, subscriptions) with a scheduler, receipt photo upload, CSV import, shared budgets for households, and email alerts at 80% of a budget.

## 6. Resume bullets

- Built a **Smart Expense & Budget Tracker** (Node.js, Express 5, MongoDB/Mongoose, EJS, Tailwind CSS) with full CRUD for expenses and income, filters, search, pagination and CSV export.
- Designed **monthly category budgets and rule-based insights** (month-end forecast, budget alerts at 80%, comparison with last month, unusual-spending detection) using MongoDB aggregation pipelines and compound indexes.
- Secured the app with **bcrypt, session regeneration, CSRF tokens, a strict CSP, rate limiting and per-user data isolation**; covered by 88 Jest/Supertest tests running in GitHub Actions; deployed on Render with MongoDB Atlas.
