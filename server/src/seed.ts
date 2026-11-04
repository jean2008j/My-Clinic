import bcrypt from 'bcryptjs';
import { db, one, transaction } from './db.js';

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@clinic.local';
const adminPass = process.env.SEED_ADMIN_PASSWORD ?? 'Admin12345';
const providerPass = process.env.SEED_PROVIDER_PASSWORD ?? 'Doctor12345';

const hash = (p: string) => bcrypt.hashSync(p, 10);

const providers = [
  {
    email: 'dr.sara@clinic.local',
    ar: 'د. سارة الأحمد', en: 'Dr. Sara Al-Ahmad',
    spAr: 'طب أسنان عام', spEn: 'General Dentistry',
    bioAr: 'خبرة أكثر من 10 سنوات في طب الأسنان العام والتجميلي.',
    bioEn: 'Over 10 years of experience in general and cosmetic dentistry.',
  },
  {
    email: 'dr.omar@clinic.local',
    ar: 'د. عمر خليل', en: 'Dr. Omar Khalil',
    spAr: 'جراحة وزراعة أسنان', spEn: 'Oral Surgery & Implants',
    bioAr: 'متخصص بزراعة الأسنان وجراحة الفم.',
    bioEn: 'Specialist in dental implants and oral surgery.',
  },
];

const services: [string, string, number][] = [
  ['كشف واستشارة', 'Check-up & Consultation', 20],
  ['تنظيف الأسنان', 'Teeth Cleaning', 30],
  ['حشو سن', 'Dental Filling', 45],
  ['تبييض الأسنان', 'Teeth Whitening', 60],
  ['علاج عصب', 'Root Canal Treatment', 90],
  ['زراعة سن (استشارة)', 'Implant Consultation', 30],
];

const seed = () => transaction(() => {
  db.prepare(`INSERT OR IGNORE INTO users (email,password_hash,role) VALUES (?,?, 'admin')`)
    .run(adminEmail, hash(adminPass));

  const providerIds: number[] = [];
  for (const p of providers) {
    db.prepare(`INSERT OR IGNORE INTO users (email,password_hash,role) VALUES (?,?, 'provider')`)
      .run(p.email, hash(providerPass));
    const u = one<{ id: number }>('SELECT id FROM users WHERE email=?', [p.email])!;
    const existing = one<{ id: number }>('SELECT id FROM providers WHERE user_id=?', [u.id]);
    if (existing) { providerIds.push(existing.id); continue; }
    const r = db.prepare(
      `INSERT INTO providers (user_id,name_ar,name_en,specialty_ar,specialty_en,bio_ar,bio_en)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(u.id, p.ar, p.en, p.spAr, p.spEn, p.bioAr, p.bioEn);
    providerIds.push(Number(r.lastInsertRowid));
  }

  const n = one<{ n: number }>('SELECT count(*) AS n FROM services')!.n;
  if (n > 0) return;

  const sids = services.map(([ar, en, dur]) =>
    Number(db.prepare('INSERT INTO services (name_ar,name_en,duration_min) VALUES (?,?,?)')
      .run(ar, en, dur).lastInsertRowid));

  const link = db.prepare('INSERT OR IGNORE INTO provider_services VALUES (?,?)');
  const map = new Map<number, number[]>([
    [providerIds[0], sids.slice(0, 5)],
    [providerIds[1], [sids[0], sids[2], sids[4], sids[5]]],
  ]);
  for (const [pid, list] of map) for (const sid of list) link.run(pid, sid);

  // Mon-Fri 09:00-13:00 & 14:00-17:30; Dr. Omar also Saturday morning
  const wh = db.prepare('INSERT INTO working_hours (provider_id,weekday,start_time,end_time) VALUES (?,?,?,?)');
  for (const pid of providerIds) {
    for (let d = 1; d <= 5; d++) { wh.run(pid, d, '09:00', '13:00'); wh.run(pid, d, '14:00', '17:30'); }
  }
  wh.run(providerIds[1], 6, '09:00', '13:00');
});

seed();
console.log('Seed complete.');
console.log(`  Admin:    ${adminEmail} / ${adminPass}`);
console.log(`  Provider: dr.sara@clinic.local / ${providerPass}`);
console.log(`  Provider: dr.omar@clinic.local / ${providerPass}`);
db.close();
