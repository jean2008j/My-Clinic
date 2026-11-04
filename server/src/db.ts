import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config.js';

// Uses the SQLite built into Node.js (22.13+). No native modules to compile.
const file = resolve(config.databaseFile);
mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// NOTE: bind parameters must be string | number | bigint | null (no booleans, no undefined).
type Param = string | number | bigint | null;

export function all<T = any>(sql: string, params: Param[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function one<T = any>(sql: string, params: Param[] = []): T | null {
  return (db.prepare(sql).get(...params) as T | undefined) ?? null;
}

export function run(sql: string, params: Param[] = []) {
  return db.prepare(sql).run(...params);
}

// Runs fn inside a write transaction (BEGIN IMMEDIATE locks out other writers,
// which is what makes check-then-insert booking safe).
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
