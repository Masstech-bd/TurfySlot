import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
});

try {
  await pool.query(`ALTER TABLE IF EXISTS public.turf_owner_profiles ADD COLUMN IF NOT EXISTS nid_or_trade_license VARCHAR(255);`);
  console.log('Applied ALTER TABLE for public.turf_owner_profiles.nid_or_trade_license');
} finally {
  await pool.end();
}
