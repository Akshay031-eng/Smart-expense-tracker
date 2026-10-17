/**
 * Starts a throw-away MongoDB for the test run (mongodb-memory-server).
 * Set TEST_MONGO_URL to use an existing server instead, e.g. in CI or Docker:
 *   TEST_MONGO_URL=mongodb://127.0.0.1:27017 npm test
 */
module.exports = async function globalSetup() {
  if (process.env.TEST_MONGO_URL) return;
  const { MongoMemoryServer } = require('mongodb-memory-server-core');
  const server = await MongoMemoryServer.create();
  globalThis.__MONGO_SERVER__ = server;
  process.env.TEST_MONGO_URL = server.getUri();
};
