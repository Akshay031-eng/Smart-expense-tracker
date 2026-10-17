const { createApp, request, useDatabase, csrfFrom, signedInAgent, postForm, User } = require('../helpers');

useDatabase('auth');
const app = createApp();

const sessionId = (res) => {
  const cookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('set.sid='));
  return cookie && cookie.split(';')[0];
};

describe('public pages', () => {
  test('landing page and auth pages render', async () => {
    const home = await request(app).get('/').expect(200);
    expect(home.text).toContain('Know where every rupee goes.');
    await request(app).get('/login').expect(200);
    await request(app).get('/register').expect(200);
  });

  test('security headers are set', async () => {
    const res = await request(app).get('/');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('protected pages redirect guests to sign in', async () => {
    for (const path of ['/dashboard', '/transactions', '/budgets', '/settings']) {
      const res = await request(app).get(path).expect(302);
      expect(res.headers.location).toBe('/login');
    }
  });

  test('unknown pages are 404', async () => {
    await request(app).get('/does-not-exist').expect(404);
  });

  test('health check reports the database', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'connected' });
  });
});

describe('register', () => {
  test('shows validation errors', async () => {
    const agent = request.agent(app);
    const token = await csrfFrom(agent, '/register');
    const res = await agent
      .post('/register')
      .type('form')
      .send({ _csrf: token, name: 'A', email: 'not-an-email', password: 'short', confirmPassword: 'other' })
      .expect(422);
    expect(res.text).toContain('Enter your name');
    expect(res.text).toContain('Enter a valid email address.');
    expect(res.text).toContain('Password must be 8 to 72 characters.');
    expect(res.text).toContain('Passwords do not match.');
    expect(await User.countDocuments()).toBe(0);
  });

  test('creates the account, hashes the password and signs in', async () => {
    const { agent, user, password } = await signedInAgent(app, { email: 'Asha@Example.com' });
    expect(user.email).toBe('asha@example.com');
    const stored = await User.findById(user._id).select('+passwordHash');
    expect(stored.passwordHash).not.toBe(password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    await agent.get('/dashboard').expect(200);
  });

  test('rejects a duplicate email', async () => {
    await signedInAgent(app, { email: 'dup@example.com' });
    const agent = request.agent(app);
    const token = await csrfFrom(agent, '/register');
    const res = await agent
      .post('/register')
      .type('form')
      .send({ _csrf: token, name: 'Second', email: 'dup@example.com', password: 'password123', confirmPassword: 'password123' })
      .expect(409);
    expect(res.text).toContain('already exists');
  });
});

describe('login and logout', () => {
  test('wrong password gives one generic message', async () => {
    await signedInAgent(app, { email: 'login@example.com', password: 'right-password' });
    const agent = request.agent(app);
    const token = await csrfFrom(agent, '/login');
    const wrong = await agent.post('/login').type('form').send({ _csrf: token, email: 'login@example.com', password: 'nope-nope' }).expect(401);
    expect(wrong.text).toContain('Incorrect email or password.');
    const unknown = await agent.post('/login').type('form').send({ _csrf: token, email: 'nobody@example.com', password: 'nope-nope' }).expect(401);
    expect(unknown.text).toContain('Incorrect email or password.');
  });

  test('a new session id is issued at login (no session fixation)', async () => {
    await signedInAgent(app, { email: 'fix@example.com', password: 'right-password' });
    const agent = request.agent(app);
    const page = await agent.get('/login');
    const before = sessionId(page);
    const token = /name="_csrf" value="([a-f0-9]+)"/.exec(page.text)[1];
    const res = await agent.post('/login').type('form').send({ _csrf: token, email: 'fix@example.com', password: 'right-password' }).expect(302);
    expect(res.headers.location).toBe('/dashboard');
    const after = sessionId(res);
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  test('returns to the page the user asked for', async () => {
    await signedInAgent(app, { email: 'back@example.com', password: 'right-password' });
    const agent = request.agent(app);
    await agent.get('/budgets').expect(302);
    const token = await csrfFrom(agent, '/login');
    const res = await agent.post('/login').type('form').send({ _csrf: token, email: 'back@example.com', password: 'right-password' });
    expect(res.headers.location).toBe('/budgets');
  });

  test('logout ends the session', async () => {
    const { agent } = await signedInAgent(app);
    await postForm(agent, '/logout').expect(302);
    await agent.get('/dashboard').expect(302);
  });

  test('rate limits repeated login attempts', async () => {
    const limitedApp = createApp({ authRateLimit: 2 });
    const agent = request.agent(limitedApp);
    const token = await csrfFrom(agent, '/login');
    const attempt = () => agent.post('/login').type('form').send({ _csrf: token, email: 'x@example.com', password: 'wrong-pass' });
    await attempt().expect(401);
    await attempt().expect(401);
    const blocked = await attempt().expect(429);
    expect(blocked.text).toContain('Too many attempts');
  });
});

describe('CSRF protection', () => {
  test('rejects a form post without the token', async () => {
    const { agent } = await signedInAgent(app);
    const res = await agent.post('/transactions').type('form').send({ type: 'expense', amount: '10', category: 'food', date: '2026-10-01', paymentMethod: 'upi' });
    expect(res.status).toBe(403);
  });

  test('rejects a wrong token', async () => {
    const agent = request.agent(app);
    await agent.get('/login');
    await agent.post('/login').type('form').send({ _csrf: 'f'.repeat(64), email: 'a@b.co', password: 'x' }).expect(403);
  });
});

describe('demo account', () => {
  test('signs in to a ready-made account with sample data, refreshed at most every few hours', async () => {
    const agent = request.agent(app);
    const token = await csrfFrom(agent, '/');
    const res = await agent.post('/demo').type('form').send({ _csrf: token }).expect(302);
    expect(res.headers.location).toBe('/dashboard');
    const dashboard = await agent.get('/dashboard').expect(200);
    expect(dashboard.text).toContain('shared demo account');

    const { Transaction } = require('../helpers');
    const demo = await User.findOne({ isDemo: true });
    const first = await Transaction.find({ user: demo._id }).select('_id').lean();
    expect(first.length).toBeGreaterThan(50);

    // Second click: no reseed, same data.
    const again = request.agent(app);
    const token2 = await csrfFrom(again, '/');
    await again.post('/demo').type('form').send({ _csrf: token2 }).expect(302);
    const second = await Transaction.find({ user: demo._id }).select('_id').lean();
    expect(second.map(String).sort()).toEqual(first.map(String).sort());
  });

  test('demo settings are read-only', async () => {
    const agent = request.agent(app);
    const token = await csrfFrom(agent, '/');
    await agent.post('/demo').type('form').send({ _csrf: token });
    agent.csrf = await csrfFrom(agent, '/settings');
    await postForm(agent, '/settings/profile', { _method: 'PUT', name: 'Hacker', currency: 'USD' }).expect(302);
    const demo = await User.findOne({ isDemo: true });
    expect(demo.name).toBe('Demo User');
  });
});
