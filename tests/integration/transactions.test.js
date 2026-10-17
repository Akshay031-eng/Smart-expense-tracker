const { createApp, useDatabase, signedInAgent, postForm, Transaction } = require('../helpers');

useDatabase('transactions');
const app = createApp();

const expense = (overrides = {}) => ({
  type: 'expense',
  amount: '249.50',
  category: 'food',
  date: '2026-10-05',
  paymentMethod: 'upi',
  description: 'Lunch',
  ...overrides,
});

describe('create', () => {
  test('saves the amount as integer paise and redirects', async () => {
    const { agent, user } = await signedInAgent(app);
    const res = await postForm(agent, '/transactions', expense()).expect(302);
    expect(res.headers.location).toBe('/transactions');
    const saved = await Transaction.findOne({ user: user._id }).lean();
    expect(saved).toMatchObject({ type: 'expense', amount: 24950, category: 'food', description: 'Lunch' });
    expect(saved.date.toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });

  test.each([
    ['amount', { amount: '-5' }, 'Enter an amount above 0'],
    ['amount', { amount: '12.345' }, 'Enter an amount above 0'],
    ['category', { type: 'income', category: 'food' }, 'Choose a category.'],
    ['date', { date: '2026-02-30' }, 'Choose a valid date.'],
    ['paymentMethod', { paymentMethod: 'bitcoin' }, 'Choose a payment method.'],
  ])('rejects an invalid %s', async (_, override, message) => {
    const { agent } = await signedInAgent(app);
    const res = await postForm(agent, '/transactions', expense(override)).expect(422);
    expect(res.text).toContain(message);
    expect(await Transaction.countDocuments()).toBe(0);
  });

  test('only redirects back to pages on this site', async () => {
    const { agent } = await signedInAgent(app);
    const res = await postForm(agent, '/transactions', expense({ returnTo: 'https://evil.example' }));
    expect(res.headers.location).toBe('/transactions');
  });
});

describe('list, filter and export', () => {
  async function seeded() {
    const ctx = await signedInAgent(app);
    await Transaction.insertMany([
      { user: ctx.user._id, type: 'expense', amount: 50000, category: 'food', date: new Date('2026-10-02'), description: 'Swiggy dinner' },
      { user: ctx.user._id, type: 'expense', amount: 1800000, category: 'rent', date: new Date('2026-10-01'), description: 'House rent' },
      { user: ctx.user._id, type: 'income', amount: 8500000, category: 'salary', date: new Date('2026-10-01'), description: 'Salary' },
      { user: ctx.user._id, type: 'expense', amount: 99900, category: 'shopping', date: new Date('2026-09-20'), description: '=HYPERLINK("http://evil")' },
    ]);
    return ctx;
  }

  test('lists only my transactions with totals', async () => {
    const { agent } = await seeded();
    const other = await signedInAgent(app);
    await Transaction.create({ user: other.user._id, type: 'expense', amount: 777700, category: 'travel', date: new Date('2026-10-03'), description: 'Someone else trip' });

    const res = await agent.get('/transactions').expect(200);
    expect(res.text).toContain('Swiggy dinner');
    expect(res.text).not.toContain('Someone else trip');
    expect(res.text).toContain('Showing 1–4 of 4');
  });

  test('filters by type, category, dates and text', async () => {
    const { agent } = await seeded();
    const byType = await agent.get('/transactions?type=income').expect(200);
    expect(byType.text).toContain('Showing 1–1 of 1');
    const byCategory = await agent.get('/transactions?category=rent').expect(200);
    expect(byCategory.text).toContain('House rent');
    expect(byCategory.text).not.toContain('Swiggy dinner');
    const byDate = await agent.get('/transactions?from=2026-10-01&to=2026-10-31').expect(200);
    expect(byDate.text).toContain('Showing 1–3 of 3');
    const byText = await agent.get('/transactions?q=SWIGGY').expect(200);
    expect(byText.text).toContain('Showing 1–1 of 1');
  });

  test('treats search text literally and ignores operator injection', async () => {
    const { agent } = await seeded();
    await agent.get('/transactions?q=(.*').expect(200);
    const res = await agent.get('/transactions?type[$ne]=income&category[$gt]=').expect(200);
    expect(res.text).toContain('Showing 1–4 of 4');
  });

  test('escapes user text in HTML (no stored XSS)', async () => {
    const { agent } = await signedInAgent(app);
    await postForm(agent, '/transactions', expense({ description: '<script>alert(1)</script>' })).expect(302);
    const res = await agent.get('/transactions').expect(200);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('exports the filtered list as CSV with formulas neutralised', async () => {
    const { agent } = await seeded();
    const res = await agent.get('/transactions/export?type=expense').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="transactions-\d{4}-\d{2}-\d{2}\.csv"/);
    const lines = res.text.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('Date,Type,Category,Description,Payment method,Amount,Currency');
    expect(lines).toHaveLength(4);
    expect(res.text).toContain('2026-10-01,expense,Rent & Housing,House rent,UPI,18000.00,INR');
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe('edit and delete', () => {
  test('edits my own transaction', async () => {
    const { agent, user } = await signedInAgent(app);
    const tx = await Transaction.create({ user: user._id, type: 'expense', amount: 1000, category: 'food', date: new Date('2026-10-01') });
    await agent.get(`/transactions/${tx.id}/edit`).expect(200);
    await postForm(agent, `/transactions/${tx.id}`, { ...expense({ amount: '1500', category: 'groceries' }), _method: 'PUT' }).expect(302);
    const updated = await Transaction.findById(tx.id).lean();
    expect(updated).toMatchObject({ amount: 150000, category: 'groceries' });
  });

  test("cannot see, edit or delete someone else's transaction (IDOR)", async () => {
    const owner = await signedInAgent(app);
    const attacker = await signedInAgent(app);
    const tx = await Transaction.create({ user: owner.user._id, type: 'expense', amount: 5000, category: 'food', date: new Date('2026-10-01') });

    await attacker.agent.get(`/transactions/${tx.id}/edit`).expect(404);
    await postForm(attacker.agent, `/transactions/${tx.id}`, { ...expense({ amount: '1' }), _method: 'PUT' }).expect(404);
    await postForm(attacker.agent, `/transactions/${tx.id}`, { _method: 'DELETE' }).expect(404);

    const still = await Transaction.findById(tx.id).lean();
    expect(still.amount).toBe(5000);
  });

  test('deletes my own transaction', async () => {
    const { agent, user } = await signedInAgent(app);
    const tx = await Transaction.create({ user: user._id, type: 'expense', amount: 1000, category: 'food', date: new Date('2026-10-01') });
    await postForm(agent, `/transactions/${tx.id}`, { _method: 'DELETE' }).expect(302);
    expect(await Transaction.findById(tx.id)).toBeNull();
  });

  test('a malformed id is a 404, not a crash', async () => {
    const { agent } = await signedInAgent(app);
    await agent.get('/transactions/not-an-id/edit').expect(404);
  });
});
