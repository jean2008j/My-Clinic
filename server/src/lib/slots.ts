import { DateTime } from 'luxon';
import { all, one } from '../db.js';
import { config } from '../config.js';

export interface Slot {
  start: string; // UTC ISO, e.g. 2026-11-10T09:00:00.000Z  (send this back when booking)
  end: string;   // UTC ISO
  time: string;  // clinic-local 'HH:mm' for display
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export const isDate = (s: string) => DATE_RE.test(s) && DateTime.fromISO(s, { zone: config.tz }).isValid;
export const isMonth = (s: string) => MONTH_RE.test(s) && DateTime.fromISO(`${s}-01`, { zone: config.tz }).isValid;

export const toUtcIso = (dt: DateTime) => dt.toUTC().toISO()!;
export const nowIso = () => DateTime.utc().toISO()!;
export const todayLocal = () => DateTime.now().setZone(config.tz).toISODate()!;

/** Start/end of a clinic-local day as UTC ISO strings (handles DST correctly). */
export function dayRangeUtc(date: string) {
  const day = DateTime.fromISO(date, { zone: config.tz });
  return { from: toUtcIso(day.startOf('day')), to: toUtcIso(day.plus({ days: 1 }).startOf('day')) };
}

/**
 * All bookable slots for one provider, one service duration, one local date.
 * Applies: working hours, holidays (clinic-wide + provider), no overlap with existing
 * appointments (any duration), minimum notice, and maximum days ahead.
 * `excludeId` lets an appointment be moved without blocking itself.
 */
export function getSlots(providerId: number, durationMin: number, date: string, excludeId = 0): Slot[] {
  const zone = config.tz;
  const { slotStepMin, minNoticeMin, maxAdvanceDays } = config.booking;

  const day = DateTime.fromISO(date, { zone });
  if (!day.isValid) return [];

  const now = DateTime.now().setZone(zone);
  const today = now.startOf('day');
  if (day.toMillis() < today.toMillis()) return [];
  if (day.toMillis() > today.plus({ days: maxAdvanceDays }).toMillis()) return [];

  const holiday = one(
    'SELECT 1 AS x FROM holidays WHERE day = ? AND (provider_id IS NULL OR provider_id = ?)',
    [date, providerId],
  );
  if (holiday) return [];

  const weekday = day.weekday % 7; // luxon: Mon=1..Sun=7  ->  our schema: Sun=0..Sat=6
  const blocks = all<{ start_time: string; end_time: string }>(
    'SELECT start_time, end_time FROM working_hours WHERE provider_id = ? AND weekday = ? ORDER BY start_time',
    [providerId, weekday],
  );
  if (blocks.length === 0) return [];

  const range = dayRangeUtc(date);
  const busy = all<{ start_at: string; end_at: string }>(
    `SELECT start_at, end_at FROM appointments
      WHERE provider_id = ? AND status <> 'cancelled' AND id <> ?
        AND end_at > ? AND start_at < ?`,
    [providerId, excludeId, range.from, range.to],
  ).map((b) => [Date.parse(b.start_at), Date.parse(b.end_at)] as const);

  const earliest = now.plus({ minutes: minNoticeMin }).toMillis();
  const slots: Slot[] = [];

  for (const b of blocks) {
    const [sh, sm] = b.start_time.split(':').map(Number);
    const [eh, em] = b.end_time.split(':').map(Number);
    const blockEnd = day.set({ hour: eh, minute: em, second: 0, millisecond: 0 }).toMillis();
    let cursor = day.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });

    while (cursor.plus({ minutes: durationMin }).toMillis() <= blockEnd) {
      const end = cursor.plus({ minutes: durationMin });
      const s = cursor.toMillis();
      const e = end.toMillis();
      const free = !busy.some(([bs, be]) => s < be && e > bs);
      if (s >= earliest && free) {
        slots.push({ start: toUtcIso(cursor), end: toUtcIso(end), time: cursor.toFormat('HH:mm') });
      }
      cursor = cursor.plus({ minutes: slotStepMin });
    }
  }
  return slots;
}

/** For a calendar view: each day of the month with the number of free slots. */
export function monthAvailability(providerId: number, durationMin: number, month: string, excludeId = 0) {
  const first = DateTime.fromISO(`${month}-01`, { zone: config.tz });
  const holidays = new Set(
    all<{ day: string }>(
      `SELECT day FROM holidays WHERE day LIKE ? AND (provider_id IS NULL OR provider_id = ?)`,
      [`${month}-%`, providerId],
    ).map((h) => h.day),
  );
  const days: { date: string; slots: number; holiday: boolean }[] = [];
  for (let d = first; d.month === first.month; d = d.plus({ days: 1 })) {
    const date = d.toISODate()!;
    days.push({ date, slots: getSlots(providerId, durationMin, date, excludeId).length, holiday: holidays.has(date) });
  }
  return days;
}
