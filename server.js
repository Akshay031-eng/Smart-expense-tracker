const mongoose = require('mongoose');

async function main() {
  // Required inside main() so a configuration error (e.g. a missing SESSION_SECRET)
  // is reported as one clear line instead of a stack trace.
  const config = require('./src/config/env');
  const { connectDb } = require('./src/config/db');
  const { createApp } = require('./src/app');

  await connectDb(config.mongoUri);

  let sessionStore;
  if (config.sessionStore === 'mongo') {
    const MongoStore = require('connect-mongo');
    sessionStore = MongoStore.create({
      client: mongoose.connection.getClient(),
      collectionName: 'sessions',
      ttl: config.sessionMaxAgeMs / 1000,
      autoRemove: 'native', // MongoDB TTL index deletes expired sessions
      touchAfter: 24 * 60 * 60, // write an unchanged session at most once a day
    });
  }

  const app = createApp({ sessionStore });
  const server = app.listen(config.port, () => {
    console.log(`${config.appName} running at http://localhost:${config.port} (${config.env})`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error(`Failed to start: ${error.message}`);
  process.exit(1);
});
