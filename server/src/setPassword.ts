// Change a login password:  npm run user:password -- dr.sara@clinic.local "NewStrongPassword"
import bcrypt from 'bcryptjs';
import { one, run } from './db.js';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run user:password -- <email> "<new password>"');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Please use at least 10 characters.');
  process.exit(1);
}
if (!one('SELECT 1 AS x FROM users WHERE email = ?', [email])) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}
run('UPDATE users SET password_hash = ? WHERE email = ?', [bcrypt.hashSync(password, 10), email]);
console.log(`Password changed for ${email}`);
