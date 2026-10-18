const { Pool } = require("pg");
require("dotenv").config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000
});

module.exports = pool;