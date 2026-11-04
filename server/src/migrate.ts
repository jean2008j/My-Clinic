import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');

if (process.argv.includes('--reset')) {
  console.log('Dropping existing tables...');
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of ['reviews', 'appointments', 'holidays', 'working_hours',
                   'provider_services', 'services', 'providers', 'users']) {
    db.exec(`DROP TABLE IF EXISTS ${t}`);
  }
  db.exec('PRAGMA foreign_keys = ON');
}

console.log('Applying schema...');
db.exec(schema);
console.log('Schema ready.');
db.close();
