/**
 * Shared test helpers: a separate database per test file, an app instance,
 * and signed-in supertest agents (cookies + CSRF token handled for you).
 */
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Transaction = require('../src/models/Transaction');
const Budget = require('../src/models/Budget');

let counter = 0;

/** Connects mongoose to `<TEST_MONGO_URL>/<unique db>` for one test file. */
function useDatabase(name) {
  beforeAll(async () => {
    const dbName = `set_test_${name}_${process.pid}_${Date.now()}`;
    await mongoose.connect(process.env.TEST_MONGO_URL, { dbName });
    await Promise.all([User.init(), Transaction.init(), Budget.init()]);
  });

  afterEach(async () => {
    await Promise.all([User.deleteMany({}), Transaction.deleteMany({}), Budget.deleteMany({})]);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}

/** Reads the hidden _csrf field from a page. */
async function csrfFrom(agent, path) {
  const res = await agent.get(path);
  const match = /name="_csrf" value="([a-f0-9]+)"/.exec(res.text);
  if (!match) throw new Error(`No CSRF token found on ${path} (status ${res.status})`);
  return match[1];
}

/** Registers a new user and returns a signed-in agent. */
async function signedInAgent(app, overrides = {}) {
  const agent = request.agent(app);
  counter += 1;
  const email = overrides.email || `user${counter}_${Date.now()}@example.com`;
  const password = overrides.password || 'correct-horse-battery';
  const token = await csrfFrom(agent, '/register');
  const res = await agent
    .post('/register')
    .type('form')
    .send({ _csrf: token, name: overrides.name || 'Test User', email, password, confirmPassword: password });
  if (res.status !== 302) throw new Error(`Registration failed with ${res.status}`);
  const user = await User.findOne({ email });
  // The session (and therefore the CSRF token) changed at login.
  agent.csrf = await csrfFrom(agent, '/transactions/new');
  return { agent, user, email, password };
}

function postForm(agent, path, data = {}) {
  return agent.post(path).type('form').send({ _csrf: agent.csrf, ...data });
}

module.exports = { createApp, request, useDatabase, csrfFrom, signedInAgent, postForm, User, Transaction, Budget };
