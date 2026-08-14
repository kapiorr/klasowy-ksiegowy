import pg from 'pg';
const { Pool } = pg;

const sslConfig = process.env.DB_SSL === 'true'
  ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } }
  : {};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...sslConfig,
});

export default pool;
