/**
 * Realistic sample data for the demo account: the last 4 months up to today,
 * with salary, rent, bills, groceries, food delivery, transport and some
 * one-off purchases - enough for every chart and insight to have something to show.
 *
 * A seeded random generator keeps the data the same for the same day.
 */
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const dates = require('../utils/dates');

const DEMO_NAME = 'Demo User';
const DEMO_PASSWORD = 'demo-password-123';
const RESEED_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Small deterministic PRNG (mulberry32). */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RUPEE = 100; // minor units per rupee

const DESCRIPTIONS = {
  food: ['Swiggy order', 'Zomato dinner', 'Office lunch', 'Chai & samosa', 'Pizza night', 'Cafe coffee', 'Biryani takeaway'],
  groceries: ['BigBasket order', 'DMart groceries', 'Vegetables & fruits', 'Blinkit essentials', 'Milk & bread'],
  transport: ['Uber ride', 'Ola auto', 'Metro card recharge', 'Petrol', 'Rapido bike'],
  shopping: ['Amazon order', 'Myntra clothes', 'Flipkart headphones', 'Shoes', 'Home decor'],
  entertainment: ['Movie tickets', 'Concert pass', 'Gaming top-up', 'Bowling with friends'],
  health: ['Pharmacy', 'Doctor consultation', 'Lab tests'],
  personal: ['Haircut', 'Skincare products'],
  education: ['Online course', 'Books'],
  travel: ['Train tickets', 'Weekend hotel stay', 'Flight to Goa'],
};

function buildTransactions(userId, todayDate) {
  const random = createRandom(Number(dates.toDateInput(todayDate).replace(/-/g, '')));
  const between = (min, max) => Math.round(min + random() * (max - min));
  const pick = (list) => list[Math.floor(random() * list.length)];
  const rows = [];

  const add = (type, category, rupees, date, description, paymentMethod = 'upi') => {
    if (date > todayDate) return; // never create future transactions
    rows.push({ user: userId, type, category, amount: rupees * RUPEE, date, description, paymentMethod });
  };

  const currentKey = dates.monthKeyOf(todayDate);
  for (let offset = -3; offset <= 0; offset += 1) {
    const key = dates.addMonths(currentKey, offset);
    const { start } = dates.monthRange(key);
    const lastDay = offset === 0 ? todayDate.getUTCDate() : dates.daysInMonth(key);
    const day = (n) => dates.addDays(start, Math.min(n, dates.daysInMonth(key)) - 1);

    // Income
    add('income', 'salary', 85_000, day(1), 'Monthly salary', 'bank');
    if (random() < 0.6) add('income', 'freelance', between(6_000, 18_000), day(between(10, 25)), 'Freelance website project', 'bank');
    if (offset === -2) add('income', 'refund', 1_499, day(14), 'Amazon refund', 'card');

    // Fixed costs
    add('expense', 'rent', 18_000, day(2), 'House rent', 'bank');
    add('expense', 'bills', between(1_100, 2_100), day(5), 'Electricity bill');
    add('expense', 'bills', 799, day(7), 'Broadband');
    add('expense', 'bills', 399, day(9), 'Mobile recharge');
    add('expense', 'entertainment', 649, day(3), 'Netflix subscription', 'card');
    add('expense', 'health', 1_200, day(4), 'Gym membership', 'card');

    // Variable spending, spread over the days that have passed
    for (let d = 1; d <= lastDay; d += 1) {
      const date = day(d);
      if (d % 7 === 6) add('expense', 'groceries', between(1_400, 3_200), date, pick(DESCRIPTIONS.groceries));
      if (random() < 0.42) add('expense', 'food', between(150, 850), date, pick(DESCRIPTIONS.food));
      if (random() < 0.38) add('expense', 'transport', between(60, 420), date, pick(DESCRIPTIONS.transport));
      if (random() < 0.07) add('expense', 'shopping', between(700, 4_200), date, pick(DESCRIPTIONS.shopping), 'card');
      if (random() < 0.06) add('expense', 'entertainment', between(300, 1_400), date, pick(DESCRIPTIONS.entertainment));
      if (random() < 0.03) add('expense', 'health', between(200, 1_500), date, pick(DESCRIPTIONS.health));
      if (random() < 0.04) add('expense', 'personal', between(250, 900), date, pick(DESCRIPTIONS.personal), 'cash');
    }

    // One-offs that make the insights interesting
    if (offset === -2) add('expense', 'travel', 14_500, day(18), 'Flight to Goa', 'card');
    if (offset === -1) add('expense', 'education', 3_499, day(12), 'Online course: Node.js', 'card');
    if (offset === 0) {
      add('expense', 'shopping', 5_999, day(Math.min(lastDay, 8)), 'Smartwatch', 'card');
      add('expense', 'food', 2_400, day(Math.min(lastDay, 6)), "Friend's birthday dinner");
    }
  }
  return rows;
}

const DEMO_BUDGETS = [
  { category: 'overall', limit: 60_000 * RUPEE },
  { category: 'food', limit: 7_000 * RUPEE },
  { category: 'groceries', limit: 9_000 * RUPEE },
  { category: 'shopping', limit: 8_000 * RUPEE },
  { category: 'transport', limit: 3_500 * RUPEE },
  { category: 'entertainment', limit: 3_000 * RUPEE },
];

/** Replace the demo user's data with fresh sample data ending today. */
async function seedDemoData(userId, todayDate) {
  await Promise.all([Transaction.deleteMany({ user: userId }), Budget.deleteMany({ user: userId })]);
  const transactions = buildTransactions(userId, todayDate);
  await Transaction.insertMany(transactions);
  await Budget.insertMany(DEMO_BUDGETS.map((b) => ({ ...b, user: userId })));
  return transactions.length;
}

/**
 * Returns the demo user, creating it on first use and refreshing its data when
 * it is older than 6 hours. The refresh is claimed atomically
 * (one updateOne with a date condition), so two visitors clicking "Try demo"
 * at the same moment cannot both reseed and duplicate the data.
 */
async function ensureDemoUser(email, todayDate, now = new Date()) {
  let user = await User.findOne({ email });
  if (!user) {
    try {
      user = await User.create({
        name: DEMO_NAME,
        email,
        passwordHash: await User.hashPassword(DEMO_PASSWORD),
        isDemo: true,
      });
    } catch (error) {
      if (error.code !== 11000) throw error; // created by a parallel request
      user = await User.findOne({ email });
    }
  }
  if (!user.isDemo) {
    const error = new Error('The demo email belongs to a normal account.');
    error.status = 409;
    throw error;
  }

  const staleBefore = new Date(now.getTime() - RESEED_AFTER_MS);
  // Atomic claim: only the request whose update actually matched does the reseed.
  const claim = await User.updateOne(
    { _id: user._id, $or: [{ demoSeededAt: null }, { demoSeededAt: { $lt: staleBefore } }] },
    { $set: { demoSeededAt: now } },
  );
  if (claim.modifiedCount === 1) await seedDemoData(user._id, todayDate);
  return user;
}

module.exports = { buildTransactions, seedDemoData, ensureDemoUser, DEMO_BUDGETS, DEMO_PASSWORD, createRandom };
