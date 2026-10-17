const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

/** Hide the password in "mongodb+srv://user:password@host" before logging. */
function redactUri(uri) {
  return String(uri).replace(/\/\/([^:/@]+):([^@]+)@/, '//$1:****@');
}

async function connectDb(uri) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  } catch (error) {
    error.message =
      `Could not connect to MongoDB at ${redactUri(uri)}. ` +
      'Is MongoDB running and is MONGODB_URI in .env correct? ' +
      `(${error.message})`;
    throw error;
  }
  return mongoose.connection;
}

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDb, isDbConnected, redactUri };
