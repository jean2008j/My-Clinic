import { Router } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { config } from '../config.js';
import { all, one, run } from '../db.js';
import { HttpError, wrap } from '../middleware/error.js';
import { dayRangeUtc, isDate, nowIso, todayLocal } from '../lib/slots.js';

// Mounted behind requireAuth(['admin']) in index.ts
export const adminRouter = Router();

const id = z.coerce.number().int().positive();

// ----- holidays -----

adminRouter.get('/holidays', wrap(async (_req, res) => {
  res.json({
    holidays: await all(
      `SELECT id, provider_id, day, reason_ar, reason_en FROM holidays WHERE day >= ? ORDER BY day`,
      [todayLocal()],
    ),
  });
}));

const holidaySchema = z.object({
  day: z.string(),
  providerId: id.nullable().optional(), // omit / null = whole clinic closed
  reasonAr: z.string().trim().max(200).default(''),
  reasonEn: z.string().trim().max(200).default(''),
});

adminRouter.post(
  '/holidays',
  wrap(async (req, res) => {
    const b = holidaySchema.parse(req.body);
    if (!isDate(b.day) || b.day < todayLocal()) throw new HttpError(400, 'invalid_day');
    const providerId = b.providerId ?? null;
    if (providerId && !(await one('SELECT 1 AS x FROM providers WHERE id = ?', [providerId]))) {
      throw new HttpError(404, 'provider_not_found');
    }
    if (await one('SELECT 1 AS x FROM holidays WHERE day = ? AND COALESCE(provider_id,0) = ?', [b.day, providerId ?? 0])) {
      throw new HttpError(409, 'holiday_exists');
    }
    const r = await run('INSERT INTO holidays (provider_id, day, reason_ar, reason_en) VALUES (?,?,?,?) RETURNING id', [
      providerId, b.day, b.reasonAr, b.reasonEn,
    ]);

    // Existing bookings are NOT cancelled automatically; we tell the admin how many to deal with.
    const range = dayRangeUtc(b.day);
    const affected = (await one<{ n: number }>(
      `SELECT count(*) AS n FROM appointments
        WHERE status = 'confirmed' AND start_at >= ? AND start_at < ? AND (?::int IS NULL OR provider_id = ?)`,
      [range.from, range.to, providerId, providerId],
    ))!.n;

    res.status(201).json({ holiday: { id: r.id, day: b.day, providerId }, affectedAppointments: affected });
  }),
);

adminRouter.delete(
  '/holidays/:id',
  wrap(async (req, res) => {
    const hid = id.parse(req.params.id);
    const r = await run('DELETE FROM holidays WHERE id = ?', [hid]);
    if (r.changes === 0) throw new HttpError(404, 'not_found');
    res.json({ ok: true });
  }),
);

// ----- appointments (basic list; the full dashboard comes in batch 5) -----

adminRouter.get('/appointments', wrap(async (req, res) => {
  const q = z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      providerId: id.optional(),
      status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(),
    })
    .parse(req.query);
  if ((q.from && !isDate(q.from)) || (q.to && !isDate(q.to))) throw new HttpError(400, 'invalid_date');

  const from = dayRangeUtc(q.from ?? todayLocal()).from;
  const to = q.to ? dayRangeUtc(q.to).to : '9999-12-31T00:00:00.000Z';

  const rows = await all(
    `SELECT a.id, a.status, a.start_at, a.end_at, a.patient_name, a.phone, a.email, a.notes, a.lang,
            a.provider_id, p.name_en AS provider_name_en, p.name_ar AS provider_name_ar,
            a.service_id, s.name_en AS service_name_en, s.name_ar AS service_name_ar, s.duration_min
       FROM appointments a
       JOIN providers p ON p.id = a.provider_id
       JOIN services  s ON s.id = a.service_id
      WHERE a.start_at >= ? AND a.start_at < ?
        AND (?::int IS NULL OR a.provider_id = ?)
        AND (?::text IS NULL OR a.status = ?)
      ORDER BY a.start_at`,
    [from, to, q.providerId ?? null, q.providerId ?? null, q.status ?? null, q.status ?? null],
  );
  res.json({ appointments: rows });
}));

// ----- change the status of one appointment (completed / no-show / cancelled / back to confirmed) -----

const STATUSES = ['confirmed', 'cancelled', 'completed', 'no_show'] as const;

adminRouter.patch(
  '/appointments/:id',
  wrap(async (req, res) => {
    const aid = id.parse(req.params.id);
    const { status } = z.object({ status: z.enum(STATUSES) }).parse(req.body);
    const row = await one<{ status: string }>('SELECT status FROM appointments WHERE id = ?', [aid]);
    if (!row) throw new HttpError(404, 'not_found');
    // A cancelled booking stays cancelled: its time may already have been given to someone else.
    if (row.status === 'cancelled' || row.status === status) throw new HttpError(409, 'invalid_status_change');
    await run('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), aid]);
    res.json({ appointment: { id: aid, status } });
  }),
);

// ----- statistics -----

adminRouter.get('/stats', wrap(async (req, res) => {
  const q = z.object({ from: z.string(), to: z.string(), providerId: id.optional() }).parse(req.query);
  if (!isDate(q.from) || !isDate(q.to) || q.to < q.from) throw new HttpError(400, 'invalid_date');
  const days = DateTime.fromISO(q.to).diff(DateTime.fromISO(q.from), 'days').days;
  if (days > 400) throw new HttpError(400, 'invalid_date');

  const rows = await all<{
    status: string; start_at: string; provider_id: number; service_id: number;
    p_ar: string; p_en: string; s_ar: string; s_en: string;
  }>(
    `SELECT a.status, a.start_at, a.provider_id, a.service_id,
            p.name_ar AS p_ar, p.name_en AS p_en, s.name_ar AS s_ar, s.name_en AS s_en
       FROM appointments a
       JOIN providers p ON p.id = a.provider_id
       JOIN services  s ON s.id = a.service_id
      WHERE a.start_at >= ? AND a.start_at < ? AND (?::int IS NULL OR a.provider_id = ?)`,
    [dayRangeUtc(q.from).from, dayRangeUtc(q.to).to, q.providerId ?? null, q.providerId ?? null],
  );

  const totals = { total: rows.length, confirmed: 0, completed: 0, cancelled: 0, noShow: 0 };
  const byWeekday = Array<number>(7).fill(0); // 0 = Sunday
  const byHour = Array<number>(24).fill(0);
  const byService = new Map<number, { id: number; nameAr: string; nameEn: string; count: number }>();
  const byProvider = new Map<number, { id: number; nameAr: string; nameEn: string; count: number }>();
  const byDay = new Map<string, number>();

  for (const r of rows) {
    if (r.status === 'confirmed') totals.confirmed++;
    else if (r.status === 'completed') totals.completed++;
    else if (r.status === 'cancelled') totals.cancelled++;
    else if (r.status === 'no_show') totals.noShow++;
    if (r.status === 'cancelled') continue; // charts count active bookings only

    const local = DateTime.fromISO(r.start_at, { zone: 'utc' }).setZone(config.tz);
    byWeekday[local.weekday % 7]++;
    byHour[local.hour]++;
    byDay.set(local.toISODate()!, (byDay.get(local.toISODate()!) ?? 0) + 1);
    const s = byService.get(r.service_id) ?? { id: r.service_id, nameAr: r.s_ar, nameEn: r.s_en, count: 0 };
    s.count++; byService.set(r.service_id, s);
    const p = byProvider.get(r.provider_id) ?? { id: r.provider_id, nameAr: r.p_ar, nameEn: r.p_en, count: 0 };
    p.count++; byProvider.set(r.provider_id, p);
  }

  const desc = (a: { count: number }, b: { count: number }) => b.count - a.count;
  res.json({
    range: { from: q.from, to: q.to },
    totals,
    byWeekday,
    byHour,
    byService: [...byService.values()].sort(desc),
    byProvider: [...byProvider.values()].sort(desc),
    byDay: [...byDay.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  });
}));

// ----- reviews: patients' reviews wait here until the admin approves them -----

adminRouter.get('/reviews', wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(['pending', 'approved', 'all']).default('all') }).parse(req.query);
  const rows = await all<any>(
    `SELECT r.id, r.rating, r.comment, r.approved, r.created_at, a.patient_name, a.start_at,
            p.name_ar AS provider_name_ar, p.name_en AS provider_name_en,
            s.name_ar AS service_name_ar, s.name_en AS service_name_en
       FROM reviews r
       JOIN appointments a ON a.id = r.appointment_id
       JOIN providers p ON p.id = r.provider_id
       JOIN services  s ON s.id = a.service_id
      WHERE (?::text = 'all' OR (?::text = 'pending' AND NOT r.approved) OR (?::text = 'approved' AND r.approved))
      ORDER BY r.created_at DESC
      LIMIT 300`,
    [status, status, status],
  );
  res.json({
    reviews: rows.map((r) => ({
      id: r.id, rating: r.rating, comment: r.comment, approved: r.approved, createdAt: r.created_at, startAt: r.start_at,
      patientName: r.patient_name,
      provider: { nameAr: r.provider_name_ar, nameEn: r.provider_name_en },
      service: { nameAr: r.service_name_ar, nameEn: r.service_name_en },
    })),
  });
}));

adminRouter.patch(
  '/reviews/:id',
  wrap(async (req, res) => {
    const rid = id.parse(req.params.id);
    const { approved } = z.object({ approved: z.boolean() }).parse(req.body);
    const r = await run('UPDATE reviews SET approved = ? WHERE id = ?', [approved, rid]);
    if (r.changes === 0) throw new HttpError(404, 'not_found');
    res.json({ review: { id: rid, approved } });
  }),
);

adminRouter.delete(
  '/reviews/:id',
  wrap(async (req, res) => {
    const r = await run('DELETE FROM reviews WHERE id = ?', [id.parse(req.params.id)]);
    if (r.changes === 0) throw new HttpError(404, 'not_found');
    res.json({ ok: true });
  }),
);
