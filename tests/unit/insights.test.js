const { buildInsights, projectMonthEnd } = require('../../src/services/insights');

const R = 100; // minor units per rupee
const format = (minor) => `₹${Math.round(minor / R)}`;
const label = (id) => ({ food: 'Food', rent: 'Rent', shopping: 'Shopping', bills: 'Bills' })[id] || id;

const base = (overrides = {}) => ({
  isCurrentMonth: true,
  daysElapsed: 15,
  daysInMonth: 30,
  income: 0,
  expense: 0,
  prevExpense: 0,
  categories: [],
  categoryAverages: {},
  overallBudget: null,
  categoryBudgets: [],
  biggest: null,
  transactionCount: 10,
  format,
  label,
  ...overrides,
});

const ids = (insights) => insights.map((i) => i.id);

describe('projectMonthEnd', () => {
  test('extrapolates variable spending but not fixed costs like rent', () => {
    // Day 2: rent 18,000 + 400 on food. Naive forecast would be 18,400 / 2 * 30 = 2,76,000.
    const forecast = projectMonthEnd({
      expense: 18_400 * R,
      categories: [{ category: 'rent', total: 18_000 * R }, { category: 'food', total: 400 * R }],
      daysElapsed: 2,
      daysInMonth: 30,
    });
    expect(forecast).toBe((18_000 + 6_000) * R);
  });
});

describe('buildInsights', () => {
  test('empty month gets a single onboarding insight', () => {
    const result = buildInsights(base({ transactionCount: 0 }));
    expect(ids(result)).toEqual(['empty']);
  });

  test('over the overall budget is the first, most severe insight', () => {
    const result = buildInsights(base({ expense: 32_000 * R, overallBudget: 30_000 * R, categories: [{ category: 'food', total: 32_000 * R }] }));
    expect(result[0]).toMatchObject({ id: 'budget-over', level: 'danger' });
    expect(result[0].text).toContain('₹2000 over');
  });

  test('warns when the forecast exceeds the budget, with a daily allowance', () => {
    // 15 of 30 days, 20,000 spent on food -> forecast 40,000 > 30,000
    const result = buildInsights(base({ expense: 20_000 * R, overallBudget: 30_000 * R, categories: [{ category: 'food', total: 20_000 * R }] }));
    const pace = result.find((i) => i.id === 'budget-pace');
    expect(pace.level).toBe('warning');
    expect(pace.text).toContain('₹40000');
    // 10,000 left for 16 days (today included) -> 625 a day
    expect(pace.text).toContain('₹625 a day');
  });

  test('says "on track" when the forecast fits the budget', () => {
    const result = buildInsights(base({ expense: 10_000 * R, overallBudget: 30_000 * R, categories: [{ category: 'food', total: 10_000 * R }] }));
    expect(result.find((i) => i.id === 'budget-pace').level).toBe('good');
  });

  test('no pace warning in the first days of a month (too noisy)', () => {
    const result = buildInsights(base({ daysElapsed: 3, expense: 20_000 * R, overallBudget: 30_000 * R, categories: [{ category: 'rent', total: 20_000 * R }] }));
    expect(ids(result)).not.toContain('budget-pace');
  });

  test('category budget alerts at 80% and when exceeded', () => {
    const result = buildInsights(
      base({
        expense: 9_000 * R,
        categories: [{ category: 'food', total: 5_500 * R }, { category: 'shopping', total: 3_500 * R }],
        categoryBudgets: [
          { category: 'food', limit: 5_000 * R, spent: 5_500 * R },
          { category: 'shopping', limit: 4_000 * R, spent: 3_500 * R },
          { category: 'bills', limit: 4_000 * R, spent: 1_000 * R },
        ],
      }),
    );
    expect(result.find((i) => i.id === 'budget-food')).toMatchObject({ level: 'danger', title: 'Food budget exceeded' });
    expect(result.find((i) => i.id === 'budget-shopping')).toMatchObject({ level: 'warning', title: 'Shopping budget 87% used' });
    expect(ids(result)).not.toContain('budget-bills');
  });

  test('flags a category far above its 3-month average', () => {
    const result = buildInsights(
      base({
        expense: 10_000 * R,
        categories: [{ category: 'shopping', total: 6_000 * R }, { category: 'food', total: 4_000 * R }],
        categoryAverages: { shopping: 2_000 * R, food: 3_800 * R },
      }),
    );
    const unusual = result.find((i) => i.id.startsWith('unusual-'));
    expect(unusual.id).toBe('unusual-shopping');
    expect(unusual.text).toContain('3.0×');
  });

  test('compares with the same period last month', () => {
    const up = buildInsights(base({ expense: 12_000 * R, prevExpense: 10_000 * R }));
    expect(up.find((i) => i.id === 'trend-up').text).toContain('20% more');
    const down = buildInsights(base({ expense: 8_000 * R, prevExpense: 10_000 * R }));
    expect(down.find((i) => i.id === 'trend-down').level).toBe('good');
    const flat = buildInsights(base({ expense: 10_500 * R, prevExpense: 10_000 * R }));
    expect(ids(flat).some((id) => id.startsWith('trend'))).toBe(false);
  });

  test('savings rate: negative, healthy and low', () => {
    expect(buildInsights(base({ income: 10_000 * R, expense: 12_000 * R }))[0].id).toBe('savings-negative');
    expect(buildInsights(base({ income: 10_000 * R, expense: 7_000 * R })).find((i) => i.id === 'savings').level).toBe('good');
    expect(buildInsights(base({ income: 10_000 * R, expense: 9_500 * R })).find((i) => i.id === 'savings').level).toBe('info');
  });

  test('returns at most 6 insights, most severe first', () => {
    const result = buildInsights(
      base({
        income: 10_000 * R,
        expense: 40_000 * R,
        prevExpense: 20_000 * R,
        overallBudget: 30_000 * R,
        categories: [{ category: 'food', total: 25_000 * R }, { category: 'shopping', total: 15_000 * R }],
        categoryAverages: { shopping: 2_000 * R },
        categoryBudgets: [{ category: 'food', limit: 10_000 * R, spent: 25_000 * R }],
        biggest: { amount: 9_000 * R, description: 'TV', category: 'shopping' },
      }),
    );
    expect(result.length).toBeLessThanOrEqual(6);
    const order = { danger: 0, warning: 1, good: 2, info: 3 };
    const levels = result.map((i) => order[i.level]);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });
});
