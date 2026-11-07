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
  idleTimeoutMillis: 30_000,
});
pool.on('error', (e) => console.error('Postgres pool error:', e.message));

// Queries inside transaction() automatically use the transaction's connection.
const txStore = new AsyncLocalStorage<pg.PoolClient>();

// Every connection looks in "clinic" first. Done once per connection and awaited BEFORE its first query.
// (Needs a session-mode connection: Supabase "Session pooler" or "Direct connection", not the transaction pooler on port 6543.)
const ready = new WeakSet<pg.PoolClient>();
async function acquire(): Promise<pg.PoolClient> {
  const client = await pool.connect();
  if (!ready.has(client)) {
    try {
      await client.query('SET search_path TO clinic, extensions, public');
      ready.add(client);
    } catch (e) {
      client.release(e as Error); // drop the broken connection
      throw e;
    }
  }
  return client;
}

// Keep the "?" placeholders the code was written with: they become $1, $2, ...
const toPg = (sql: string) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

type Param = string | number | boolean | null;

async function query(sql: string, params: Param[]) {
  const inTx = txStore.getStore();
  if (inTx) return inTx.query(toPg(sql), params);
  const client = await acquire();
  try {
    return await client.query(toPg(sql), params);
  } finally {
    client.release();
  }
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
  const client = await acquire();
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
