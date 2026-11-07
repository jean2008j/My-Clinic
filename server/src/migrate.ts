import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, closeDb } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');

const client = await pool.connect();
try {
  if (process.argv.includes('--reset')) {
    console.log('Dropping the clinic schema (all clinic data is erased)...');
    await client.query('DROP SCHEMA IF EXISTS clinic CASCADE');
  }
  console.log('Applying schema...');
  await client.query('BEGIN');
  await client.query(schema);
  await client.query('COMMIT');
  console.log('Schema ready.');
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  throw e;
} finally {
  client.release();
  await closeDb();
}
