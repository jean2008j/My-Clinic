import { Router } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { all, one, run, transaction } from '../db.js';
import { config } from '../config.js';
import { HttpError, wrap } from '../middleware/error.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getSlots, isDate, isMonth, monthAvailability, nowIso, todayLocal, toUtcIso } from '../lib/slots.js';

export const publicRouter = Router();

// ---------- helpers ----------

// Arabic-Indic digits (٠١٢٣...) and Persian digits -> Latin, so "٠٩٩٩١٢٣٤٥٦" works.
const normalizeDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
   .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

const phoneField = z
  .string()
  .transform((s) => normalizeDigits(s).trim().replace(/[\s\-()]/g, ''))
  .pipe(z.string().regex(/^\+?[0-9]{6,15}$/, 'invalid_phone'));

const patientFields = {
  patientName: z.string().trim().min(2).max(100),
  phone: phoneField,
  email: z.string().trim().max(120).email().optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional(),
};

const id = z.coerce.number().int().positive();
const tokenRe = /^[0-9a-f]{32}$/;

interface ProviderRow { id: number; name_ar: string; name_en: string; active: boolean }
interface ServiceRow { id: number; duration_min: number; active: boolean }

/** Provider + service must exist, be active, and the provider must offer the service. */
async function resolve(providerId: number, serviceId: number) {
  const provider = await one<ProviderRow>('SELECT id, name_ar, name_en, active FROM providers WHERE id = ?', [providerId]);
  const service = await one<ServiceRow>('SELECT id, duration_min, active FROM services WHERE id = ?', [serviceId]);
  const link = await one('SELECT 1 AS x FROM provider_services WHERE provider_id = ? AND service_id = ?', [providerId, serviceId]);
  if (!provider?.active || !service?.active || !link) throw new HttpError(404, 'not_found');
  return { provider, service };
}

const SELECT_APPT = `
  SELECT a.*, p.name_ar AS provider_name_ar, p.name_en AS provider_name_en,
         s.name_ar AS service_name_ar, s.name_en AS service_name_en, s.duration_min
    FROM appointments a
    JOIN providers p ON p.id = a.provider_id
    JOIN services  s ON s.id = a.service_id`;

const byToken = async (token: string) => {
  if (!tokenRe.test(token)) throw new HttpError(404, 'not_found');
  const row = await one<any>(`${SELECT_APPT} WHERE a.manage_token = ?`, [token]);
  if (!row) throw new HttpError(404, 'not_found');
  return row;
};

const byId = async (rowId: number) => (await one<any>(`${SELECT_APPT} WHERE a.id = ?`, [rowId]))!;

const canModify = (row: { status: string; start_at: string }) =>
  row.status === 'confirmed' &&
  DateTime.fromISO(row.start_at).toMillis() > DateTime.now().plus({ hours: config.booking.changeCutoffHours }).toMillis();

async function toDto(row: any) {
  const review = await one<{ rating: number; comment: string | null }>(
    'SELECT rating, comment FROM reviews WHERE appointment_id = ?', [row.id],
  );
  return {
    id: row.id,
    manageToken: row.manage_token,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    provider: { id: row.provider_id, nameAr: row.provider_name_ar, nameEn: row.provider_name_en },
    service: { id: row.service_id, nameAr: row.service_name_ar, nameEn: row.service_name_en, durationMin: row.duration_min },
    patient: { name: row.patient_name, phone: row.phone, email: row.email, notes: row.notes },
    lang: row.lang,
    canModify: canModify(row),
    review: review ? { rating: review.rating, comment: review.comment } : null,
    canReview: row.status === 'completed' && !review,
  };
}

/** Parse a slot start (UTC ISO) and confirm it is a real free slot. Returns its UTC ISO. */
async function assertSlotFree(providerId: number, durationMin: number, start: string, excludeId = 0) {
  const dt = DateTime.fromISO(start, { zone: config.tz });
  if (!dt.isValid) throw new HttpError(400, 'invalid_start');
  const startIso = toUtcIso(dt);
  const slots = await getSlots(providerId, durationMin, dt.toISODate()!, excludeId);
  if (!slots.some((s) => s.start === startIso)) throw new HttpError(409, 'slot_unavailable');
  return dt;
}

// ---------- catalogue ----------

publicRouter.get('/services', wrap(async (_req, res) => {
  const rows = await all(
    `SELECT id, name_ar, name_en, description_ar, description_en, duration_min
       FROM services WHERE active ORDER BY id`,
  );
  res.json({ services: rows });
}));

publicRouter.get('/providers', wrap(async (req, res) => {
  const { serviceId } = z.object({ serviceId: id.optional() }).parse(req.query);
  const rows = await all<any>(
    `SELECT id, name_ar, name_en, specialty_ar, specialty_en, bio_ar, bio_en
       FROM providers WHERE active ORDER BY id`,
  );
  const links = await all<{ provider_id: number; service_id: number }>(
    'SELECT provider_id, service_id FROM provider_services',
  );
  // Average of the reviews the clinic approved (what visitors see).
  const ratings = await all<{ provider_id: number; avg: number; n: number }>(
    'SELECT provider_id, avg(rating) AS avg, count(*) AS n FROM reviews WHERE approved GROUP BY provider_id',
  );
  const providers = rows
    .map((p) => {
      const r = ratings.find((x) => x.provider_id === p.id);
      return {
        ...p,
        serviceIds: links.filter((l) => l.provider_id === p.id).map((l) => l.service_id),
        ratingAvg: r ? Math.round(r.avg * 10) / 10 : null,
        ratingCount: r ? r.n : 0,
      };
    })
    .filter((p) => !serviceId || p.serviceIds.includes(serviceId));
  res.json({ providers });
}));

publicRouter.get('/holidays', wrap(async (_req, res) => {
  const rows = await all(
    `SELECT id, provider_id, day, reason_ar, reason_en FROM holidays WHERE day >= ? ORDER BY day`,
    [todayLocal()],
  );
  res.json({ holidays: rows });
}));

// ---------- availability ----------

// Free slots of one day
// Optional `token` = the patient's own booking: its current time is then shown as free (so it can be kept / moved around).
const excludeIdOf = async (token?: string) =>
  token ? (await one<{ id: number }>('SELECT id FROM appointments WHERE manage_token = ?', [token]))?.id ?? 0 : 0;
const tokenParam = z.string().regex(tokenRe).optional();

publicRouter.get('/slots', wrap(async (req, res) => {
  const q = z.object({ providerId: id, serviceId: id, date: z.string(), token: tokenParam }).parse(req.query);
  if (!isDate(q.date)) throw new HttpError(400, 'invalid_date');
  const { service } = await resolve(q.providerId, q.serviceId);
  const slots = await getSlots(q.providerId, service.duration_min, q.date, await excludeIdOf(q.token));
  res.json({ date: q.date, durationMin: service.duration_min, slots });
}));

// Calendar of a month: free slot count per day (0 = full / closed), holiday flag
publicRouter.get('/availability', wrap(async (req, res) => {
  const q = z.object({ providerId: id, serviceId: id, month: z.string(), token: tokenParam }).parse(req.query);
  if (!isMonth(q.month)) throw new HttpError(400, 'invalid_month');
  const { service } = await resolve(q.providerId, q.serviceId);
  const days = await monthAvailability(q.providerId, service.duration_min, q.month, await excludeIdOf(q.token));
  res.json({ month: q.month, days });
}));

// ---------- booking ----------

const bookLimit = rateLimit(10, 60 * 60 * 1000);   // 10 bookings / hour / IP
const manageLimit = rateLimit(60, 60 * 60 * 1000); // 60 manage actions / hour / IP

const createSchema = z.object({
  providerId: id,
  serviceId: id,
  start: z.string().min(10),
  lang: z.enum(['ar', 'en']).default('ar'),
  ...patientFields,
});

publicRouter.post(
  '/appointments',
  bookLimit,
  wrap(async (req, res) => {
    const b = createSchema.parse(req.body);

    const created = await transaction(async () => {
      // Everything below runs in one locked transaction, so two people can't grab the same slot.
      const { service } = await resolve(b.providerId, b.serviceId);
      const dt = await assertSlotFree(b.providerId, service.duration_min, b.start);

      const upcoming = (await one<{ n: number }>(
        `SELECT count(*) AS n FROM appointments WHERE phone = ? AND status = 'confirmed' AND start_at > ?`,
        [b.phone, nowIso()],
      ))!.n;
      if (upcoming >= config.booking.maxUpcomingPerPhone) throw new HttpError(409, 'too_many_bookings');

      const r = await run(
        `INSERT INTO appointments (provider_id, service_id, patient_name, phone, email, notes, start_at, end_at, lang)
         VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`,
        [
          b.providerId, b.serviceId, b.patientName, b.phone, b.email || null, b.notes || null,
          toUtcIso(dt), toUtcIso(dt.plus({ minutes: service.duration_min })), b.lang,
        ],
      );
      return byId(r.id!);
    });

    res.status(201).json({ appointment: await toDto(created) });
  }),
);

// Patient views his booking with the secret link token
publicRouter.get('/appointments/:token', manageLimit, wrap(async (req, res) => {
  res.json({ appointment: await toDto(await byToken(req.params.token)) });
}));

// Edit contact details and/or move to another time (same doctor, same service)
const patchSchema = z
  .object({ start: z.string().min(10), ...patientFields })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'empty_update');

publicRouter.patch(
  '/appointments/:token',
  manageLimit,
  wrap(async (req, res) => {
    const b = patchSchema.parse(req.body);

    const updated = await transaction(async () => {
      const row = await byToken(req.params.token);
      if (!canModify(row)) throw new HttpError(403, 'cannot_modify');

      let { start_at, end_at } = row;
      if (b.start) {
        const dt = await assertSlotFree(row.provider_id, row.duration_min, b.start, row.id);
        start_at = toUtcIso(dt);
        end_at = toUtcIso(dt.plus({ minutes: row.duration_min }));
      }
      await run(
        `UPDATE appointments
            SET patient_name = ?, phone = ?, email = ?, notes = ?, start_at = ?, end_at = ?, updated_at = ?
          WHERE id = ?`,
        [
          b.patientName ?? row.patient_name,
          b.phone ?? row.phone,
          b.email !== undefined ? b.email || null : row.email,
          b.notes !== undefined ? b.notes || null : row.notes,
          start_at, end_at, nowIso(), row.id,
        ],
      );
      return byId(row.id);
    });

    res.json({ appointment: await toDto(updated) });
  }),
);

publicRouter.post(
  '/appointments/:token/cancel',
  manageLimit,
  wrap(async (req, res) => {
    const row = await byToken(req.params.token);
    if (row.status === 'cancelled') throw new HttpError(409, 'already_cancelled');
    if (!canModify(row)) throw new HttpError(403, 'cannot_modify');
    await run(`UPDATE appointments SET status = 'cancelled', updated_at = ? WHERE id = ?`, [nowIso(), row.id]);
    res.json({ appointment: await toDto(await byId(row.id)) });
  }),
);

// ---------- reviews ----------

// The patient reviews a COMPLETED visit once, using the secret booking link. It shows publicly after the admin approves it.
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

publicRouter.post(
  '/appointments/:token/review',
  manageLimit,
  wrap(async (req, res) => {
    const b = reviewSchema.parse(req.body);
    const row = await byToken(req.params.token);
    if (row.status !== 'completed') throw new HttpError(403, 'cannot_review');
    if (await one('SELECT 1 AS x FROM reviews WHERE appointment_id = ?', [row.id])) throw new HttpError(409, 'already_reviewed');
    await run('INSERT INTO reviews (appointment_id, provider_id, rating, comment) VALUES (?,?,?,?)', [
      row.id, row.provider_id, b.rating, b.comment || null,
    ]);
    res.status(201).json({ appointment: await toDto(await byId(row.id)) });
  }),
);

// Approved reviews, newest first. Only the patient's first name is shown.
publicRouter.get('/reviews', wrap(async (req, res) => {
  const q = z.object({ providerId: id.optional(), limit: z.coerce.number().int().min(1).max(50).default(12) }).parse(req.query);
  const rows = await all<any>(
    `SELECT r.id, r.rating, r.comment, r.created_at, a.patient_name,
            p.id AS provider_id, p.name_ar AS provider_name_ar, p.name_en AS provider_name_en
       FROM reviews r
       JOIN appointments a ON a.id = r.appointment_id
       JOIN providers p ON p.id = r.provider_id
      WHERE r.approved AND (?::int IS NULL OR r.provider_id = ?)
      ORDER BY r.created_at DESC
      LIMIT ?`,
    [q.providerId ?? null, q.providerId ?? null, q.limit],
  );
  res.json({
    reviews: rows.map((r) => ({
      id: r.id, rating: r.rating, comment: r.comment, createdAt: r.created_at,
      name: String(r.patient_name).trim().split(/\s+/)[0],
      provider: { id: r.provider_id, nameAr: r.provider_name_ar, nameEn: r.provider_name_en },
    })),
  });
}));
