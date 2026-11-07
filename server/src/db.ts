import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { config } from './config.js';

// PostgreSQL (Supabase). Everything lives in the "clinic" schema, so it never touches other apps in the same database.

// Return the same shapes the app always used: ISO strings for instants, 'YYYY-MM-DD' for dates, plain numbers for counts/averages.
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz -> '2026-11-10T09:00:00.000Z'
pg.types.setTypeParser(1082, (v) => v);                          // date -> '2026-11-10'
pg.types.setTypeParser(20, (v) => Number(v));                    // bigint (count(*)) -> number
pg.types.setTypeParser(1700, (v) => Number(v));                  // numeric (avg) -> number

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is not set. Put your Supabase connection string in server/.env (see .env.example).');
}

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.databasePoolMax,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  idleTimeoutMillis: 10_000,
});
pool.on('error', (e) => console.error('Postgres pool error:', e.message));

// Queries inside transaction() automatically use the transaction's connection.
const txStore = new AsyncLocalStorage<pg.PoolClient>();

// The SQL in the routes uses bare table names. Here every table name that follows FROM / JOIN / INTO / UPDATE gets the
// "clinic." prefix, so no per-connection `search_path` is needed. That makes it work through ANY Supabase connection
// type, including the transaction pooler (port 6543) that serverless hosts such as Vercel need.
const TABLES = 'users|providers|services|provider_services|working_hours|holidays|appointments|reviews';
const QUALIFY = new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+(${TABLES})\\b`, 'gi');

// Keep the "?" placeholders the code was written with: they become $1, $2, ...
const toPg = (sql: string) => {
  let i = 0;
  return sql.replace(QUALIFY, '$1 clinic.$2').replace(/\?/g, () => `$${++i}`);
};

type Param = string | number | boolean | null;

function query(sql: string, params: Param[]) {
  return (txStore.getStore() ?? pool).query(toPg(sql), params);
}

export async function all<T = any>(sql: string, params: Param[] = []): Promise<T[]> {
  return (await query(sql, params)).rows as T[];
}

export async function one<T = any>(sql: string, params: Param[] = []): Promise<T | null> {
  return ((await query(sql, params)).rows[0] as T | undefined) ?? null;
}

/** INSERT ... RETURNING id gives `id`; UPDATE / DELETE give `changes` (rows touched). */
export async function run(sql: string, params: Param[] = []) {
  const r = await query(sql, params);
  return { changes: r.rowCount ?? 0, id: (r.rows[0]?.id as number | undefined) ?? null };
}

// Arbitrary app-wide lock number for pg_advisory_xact_lock.
const BOOKING_LOCK = 727001;

/**
 * Runs fn inside a transaction. Writers are serialized with an advisory lock (the Postgres
 * counterpart of SQLite's BEGIN IMMEDIATE), which is what makes check-then-insert booking safe.
 * The database's no_overlap constraint is the final safety net.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [BOOKING_LOCK]);
    const result = await txStore.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export const closeDb = () => pool.end();
