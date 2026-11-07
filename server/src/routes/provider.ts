import { Router } from 'express';
import { z } from 'zod';
import { all, one, run } from '../db.js';
import { HttpError, wrap } from '../middleware/error.js';
import { dayRangeUtc, isDate, nowIso, todayLocal } from '../lib/slots.js';

// Mounted behind requireAuth(['provider']) in index.ts.
// Every route only ever touches the logged-in doctor's OWN data (req.user.providerId).
export const providerRouter = Router();

providerRouter.use((req, _res, next) => {
  if (!req.user?.providerId) return next(new HttpError(403, 'forbidden'));
  next();
});

const id = z.coerce.number().int().positive();
const mine = (req: { user?: { providerId: number | null } }) => req.user!.providerId as number;

const ratingOf = async (providerId: number) => {
  const r = (await one<{ avg: number | null; n: number }>(
    'SELECT avg(rating) AS avg, count(*) AS n FROM reviews WHERE provider_id = ? AND approved', [providerId],
  ))!;
  return { avg: r.avg === null ? null : Math.round(r.avg * 10) / 10, count: r.n };
};

providerRouter.get('/me', wrap(async (req, res) => {
  const p = await one(
    'SELECT id, name_ar, name_en, specialty_ar, specialty_en FROM providers WHERE id = ?', [mine(req)],
  );
  if (!p) throw new HttpError(404, 'not_found');
  res.json({ provider: p, rating: await ratingOf(mine(req)) });
}));

// ----- own appointments -----

providerRouter.get('/appointments', wrap(async (req, res) => {
  const q = z.object({ from: z.string(), to: z.string() }).parse(req.query);
  if (!isDate(q.from) || !isDate(q.to) || q.to < q.from) throw new HttpError(400, 'invalid_date');
  const rows = await all(
    `SELECT a.id, a.status, a.start_at, a.end_at, a.patient_name, a.phone, a.email, a.notes, a.lang,
            a.provider_id, p.name_en AS provider_name_en, p.name_ar AS provider_name_ar,
            a.service_id, s.name_en AS service_name_en, s.name_ar AS service_name_ar, s.duration_min
       FROM appointments a
       JOIN providers p ON p.id = a.provider_id
       JOIN services  s ON s.id = a.service_id
      WHERE a.provider_id = ? AND a.start_at >= ? AND a.start_at < ?
      ORDER BY a.start_at`,
    [mine(req), dayRangeUtc(q.from).from, dayRangeUtc(q.to).to],
  );
  res.json({ appointments: rows, today: todayLocal() });
}));

// A doctor can mark a visit completed / no-show or undo that. Cancelling stays with the admin.
providerRouter.patch(
  '/appointments/:id',
  wrap(async (req, res) => {
    const aid = id.parse(req.params.id);
    const { status } = z.object({ status: z.enum(['confirmed', 'completed', 'no_show']) }).parse(req.body);
    const row = await one<{ status: string }>('SELECT status FROM appointments WHERE id = ? AND provider_id = ?', [aid, mine(req)]);
    if (!row) throw new HttpError(404, 'not_found');
    if (row.status === 'cancelled' || row.status === status) throw new HttpError(409, 'invalid_status_change');
    await run('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), aid]);
    res.json({ appointment: { id: aid, status } });
  }),
);

// ----- own reviews (published and waiting) -----

providerRouter.get('/reviews', wrap(async (req, res) => {
  const rows = await all<any>(
    `SELECT r.id, r.rating, r.comment, r.approved, r.created_at, a.patient_name, a.start_at,
            s.name_ar AS service_name_ar, s.name_en AS service_name_en
       FROM reviews r
       JOIN appointments a ON a.id = r.appointment_id
       JOIN services s ON s.id = a.service_id
      WHERE r.provider_id = ?
      ORDER BY r.created_at DESC
      LIMIT 200`,
    [mine(req)],
  );
  res.json({
    rating: await ratingOf(mine(req)),
    pending: rows.filter((r) => !r.approved).length,
    reviews: rows.map((r) => ({
      id: r.id, rating: r.rating, comment: r.comment, approved: r.approved, createdAt: r.created_at, startAt: r.start_at,
      name: String(r.patient_name).trim().split(/\s+/)[0],
      service: { nameAr: r.service_name_ar, nameEn: r.service_name_en },
    })),
  });
}));
