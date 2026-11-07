// Change a login password:  npm run user:password -- dr.sara@clinic.local "NewStrongPassword"
import bcrypt from 'bcryptjs';
import { closeDb, one, run } from './db.js';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run user:password -- <email> "<new password>"');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Please use at least 10 characters.');
  process.exit(1);
}
if (!(await one('SELECT 1 AS x FROM users WHERE lower(email) = lower(?)', [email]))) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}
await run('UPDATE users SET password_hash = ? WHERE lower(email) = lower(?)', [bcrypt.hashSync(password, 10), email]);
console.log(`Password changed for ${email}`);
await closeDb();
