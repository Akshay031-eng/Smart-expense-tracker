const { createApp, useDatabase, signedInAgent, postForm, Transaction, Budget } = require('../helpers');
const { getDashboard } = require('../../src/services/analytics');
const config = require('../../src/config/env');
const { today, monthKeyOf, toDateInput } = require('../../src/utils/dates');

useDatabase('budgets');
const app = createApp();

describe('budgets', () => {
  test('creates, updates (one per category) and removes a budget', async () => {
    const { agent, user } = await signedInAgent(app);
    await postForm(agent, '/budgets', { category: 'food', limit: '5000' }).expect(302);
    await postForm(agent, '/budgets', { category: 'food', limit: '6000.50' }).expect(302);
    const budgets = await Budget.find({ user: user._id }).lean();
    expect(budgets).toHaveLength(1);
    expect(budgets[0]).toMatchObject({ category: 'food', limit: 600050 });

    await postForm(agent, '/budgets/food', { _method: 'DELETE' }).expect(302);
    expect(await Budget.countDocuments({ user: user._id })).toBe(0);
  });

  test('rejects invalid limits and categories', async () => {
    const { agent } = await signedInAgent(app);
    await postForm(agent, '/budgets', { category: 'food', limit: '0' }).expect(422);
    await postForm(agent, '/budgets', { category: 'salary', limit: '100' }).expect(422);
    expect(await Budget.countDocuments()).toBe(0);
  });

  test('shows this month\'s spending against each limit', async () => {
    const { agent, user } = await signedInAgent(app);
    const day = today(config.timeZone);
    await Transaction.create({ user: user._id, type: 'expense', amount: 450000, category: 'food', date: day });
    await Budget.create({ user: user._id, category: 'food', limit: 500000 });
    const res = await agent.get('/budgets').expect(200);
    expect(res.text).toContain('₹4,500 of ₹5,000');
    expect(res.text).toContain('90% used');
  });
});

describe('dashboard page', () => {
  test('a new account sees an empty month with a call to action', async () => {
    const { agent } = await signedInAgent(app);
    const res = await agent.get('/dashboard').expect(200);
    expect(res.text).toContain('No transactions yet this month');
    expect(res.text).toContain('Add your first expense');
  });

  test('shows totals and budget alerts for the month', async () => {
    const { agent, user } = await signedInAgent(app);
    const day = today(config.timeZone);
    await Transaction.insertMany([
      { user: user._id, type: 'income', amount: 5000000, category: 'salary', date: day },
      { user: user._id, type: 'expense', amount: 600000, category: 'food', date: day },
    ]);
    await Budget.create({ user: user._id, category: 'food', limit: 500000 });
    const res = await agent.get('/dashboard').expect(200);
    expect(res.text).toContain('₹50,000');
    expect(res.text).toContain('Food &amp; Dining budget exceeded');
    expect(res.text).toContain('id="dashboard-data"');
  });

  test('a future or malformed month falls back to the current month', async () => {
    const { agent } = await signedInAgent(app);
    const current = monthKeyOf(today(config.timeZone));
    const [year] = current.split('-');
    for (const month of [`${Number(year) + 1}-01`, 'garbage', '2026-13']) {
      const res = await agent.get(`/dashboard?month=${month}`).expect(200);
      expect(res.text).toContain(`Day ${today(config.timeZone).getUTCDate()} of`);
    }
  });

  test('a past month shows the full month and a link back', async () => {
    const { agent } = await signedInAgent(app);
    const res = await agent.get('/dashboard?month=2025-01').expect(200);
    expect(res.text).toContain('January 2025');
    expect(res.text).toContain('Full month');
  });
});

describe('analytics service', () => {
  test('computes totals, categories, budgets, trend and the daily running total', async () => {
    const { user } = await signedInAgent(app);
    const d = (text) => new Date(`${text}T00:00:00Z`);
    await Transaction.insertMany([
      { user: user._id, type: 'income', amount: 10000000, category: 'salary', date: d('2026-03-01') },
      { user: user._id, type: 'expense', amount: 2000000, category: 'rent', date: d('2026-03-02') },
      { user: user._id, type: 'expense', amount: 300000, category: 'food', date: d('2026-03-05') },
      { user: user._id, type: 'expense', amount: 200000, category: 'food', date: d('2026-03-10') },
      { user: user._id, type: 'expense', amount: 900000, category: 'shopping', date: d('2026-03-20') }, // after "today": still in the month
      { user: user._id, type: 'expense', amount: 400000, category: 'food', date: d('2026-02-03') }, // last month, same period
      { user: user._id, type: 'expense', amount: 999900, category: 'food', date: d('2026-04-01') }, // next month: excluded
    ]);
    await Budget.insertMany([
      { user: user._id, category: 'overall', limit: 4000000 },
      { user: user._id, category: 'food', limit: 600000 },
    ]);

    const result = await getDashboard(user, '2026-03', d('2026-03-15'));

    expect(result.totals).toEqual({ income: 10000000, expense: 3400000, net: 6600000 });
    expect(result.categories.map((c) => [c.category, c.total])).toEqual([
      ['rent', 2000000],
      ['shopping', 900000],
      ['food', 500000],
    ]);
    expect(result.prevExpense).toBe(400000);
    expect(result.savingsRate).toBe(66);

    const food = result.budgets.find((b) => b.category === 'food');
    expect(food).toMatchObject({ spent: 500000, percent: 83, status: 'warning' });
    expect(result.budgets[0].category).toBe('overall');

    expect(result.charts.trend).toHaveLength(6);
    expect(result.charts.trend.at(-1)).toMatchObject({ month: '2026-03', income: 10000000, expense: 3400000 });
    expect(result.charts.trend.at(-2)).toMatchObject({ month: '2026-02', expense: 400000 });

    // Running total up to day 15 (the shopping on day 20 isn't reached yet)
    expect(result.charts.daily).toHaveLength(15);
    expect(result.charts.daily[0]).toBe(0);
    expect(result.charts.daily[1]).toBe(2000000);
    expect(result.charts.daily[14]).toBe(2500000);

    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.count).toBe(5);
    expect(toDateInput(result.recent[0].date)).toBe('2026-03-20');
  });
});
