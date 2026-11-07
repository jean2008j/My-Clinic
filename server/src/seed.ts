import bcrypt from 'bcryptjs';
import { closeDb, one, run, transaction } from './db.js';

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

async function seed() {
  await transaction(async () => {
    await run(`INSERT INTO users (email,password_hash,role) VALUES (?,?, 'admin') ON CONFLICT DO NOTHING`,
      [adminEmail, hash(adminPass)]);

    const providerIds: number[] = [];
    for (const p of providers) {
      await run(`INSERT INTO users (email,password_hash,role) VALUES (?,?, 'provider') ON CONFLICT DO NOTHING`,
        [p.email, hash(providerPass)]);
      const u = (await one<{ id: number }>('SELECT id FROM users WHERE lower(email) = lower(?)', [p.email]))!;
      const existing = await one<{ id: number }>('SELECT id FROM providers WHERE user_id = ?', [u.id]);
      if (existing) { providerIds.push(existing.id); continue; }
      const r = await run(
        `INSERT INTO providers (user_id,name_ar,name_en,specialty_ar,specialty_en,bio_ar,bio_en)
         VALUES (?,?,?,?,?,?,?) RETURNING id`,
        [u.id, p.ar, p.en, p.spAr, p.spEn, p.bioAr, p.bioEn],
      );
      providerIds.push(r.id!);
    }

    const n = (await one<{ n: number }>('SELECT count(*) AS n FROM services'))!.n;
    if (n > 0) return;

    const sids: number[] = [];
    for (const [ar, en, dur] of services) {
      const r = await run('INSERT INTO services (name_ar,name_en,duration_min) VALUES (?,?,?) RETURNING id', [ar, en, dur]);
      sids.push(r.id!);
    }

    const map = new Map<number, number[]>([
      [providerIds[0], sids.slice(0, 5)],
      [providerIds[1], [sids[0], sids[2], sids[4], sids[5]]],
    ]);
    for (const [pid, list] of map) {
      for (const sid of list) {
        await run('INSERT INTO provider_services (provider_id, service_id) VALUES (?,?) ON CONFLICT DO NOTHING', [pid, sid]);
      }
    }

    // Mon-Fri 09:00-13:00 & 14:00-17:30; Dr. Omar also Saturday morning
    const wh = (pid: number, d: number, s: string, e: string) =>
      run('INSERT INTO working_hours (provider_id,weekday,start_time,end_time) VALUES (?,?,?,?)', [pid, d, s, e]);
    for (const pid of providerIds) {
      for (let d = 1; d <= 5; d++) { await wh(pid, d, '09:00', '13:00'); await wh(pid, d, '14:00', '17:30'); }
    }
    await wh(providerIds[1], 6, '09:00', '13:00');
  });
}

await seed();
console.log('Seed complete.');
console.log(`  Admin:    ${adminEmail} / ${adminPass}`);
console.log(`  Provider: dr.sara@clinic.local / ${providerPass}`);
console.log(`  Provider: dr.omar@clinic.local / ${providerPass}`);
await closeDb();
