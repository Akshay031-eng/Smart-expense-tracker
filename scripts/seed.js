/**
 * npm run seed
 * Creates (or refreshes) the demo account with 4 months of sample data.
 * Sign in with the printed email and password, or use "Try the demo".
 */
const mongoose = require('mongoose');
const config = require('../src/config/env');
const { connectDb } = require('../src/config/db');
const User = require('../src/models/User');
const { ensureDemoUser, seedDemoData, DEMO_PASSWORD } = require('../src/services/demoData');
const { today } = require('../src/utils/dates');

async function main() {
  await connectDb(config.mongoUri);
  await Promise.all([User.syncIndexes(), require('../src/models/Transaction').syncIndexes(), require('../src/models/Budget').syncIndexes()]);

  const todayDate = today(config.timeZone);
  const user = await ensureDemoUser(config.demoEmail, todayDate);
  // Always regenerate when run by hand.
  const count = await seedDemoData(user._id, todayDate);
  await User.updateOne({ _id: user._id }, { $set: { demoSeededAt: new Date() } });

  console.log(`Demo account ready: ${config.demoEmail} / ${DEMO_PASSWORD} (${count} transactions)`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
