import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/legal_contract_analyser';

const isSsl = connectionString.includes('sslmode=require') || connectionString.includes('neon.tech') || process.env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString,
  ssl: isSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query<T = any>(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
}
