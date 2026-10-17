module.exports = async function globalTeardown() {
  if (globalThis.__MONGO_SERVER__) await globalThis.__MONGO_SERVER__.stop();
};
