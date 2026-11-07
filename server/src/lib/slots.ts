import { DateTime } from 'luxon';
import { all } from '../db.js';
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

type Block = { start_time: string; end_time: string };

/** Everything needed to compute slots for a range of days, loaded with only 3 queries. */
interface ProviderData {
  holidays: Set<string>;                 // 'YYYY-MM-DD'
  blocksByWeekday: Map<number, Block[]>; // 0 = Sunday
  busy: (readonly [number, number])[];   // [startMs, endMs] of active appointments
}

/** Loads data for the clinic-local days [fromDate, toDateExclusive). */
async function loadData(providerId: number, fromDate: string, toDateExclusive: string, excludeId: number): Promise<ProviderData> {
  const from = dayRangeUtc(fromDate).from;
  const to = dayRangeUtc(toDateExclusive).from;

  const holidayRows = await all<{ day: string }>(
    'SELECT day FROM holidays WHERE day >= ? AND day < ? AND (provider_id IS NULL OR provider_id = ?)',
    [fromDate, toDateExclusive, providerId],
  );
  const blockRows = await all<Block & { weekday: number }>(
    'SELECT weekday, start_time, end_time FROM working_hours WHERE provider_id = ? ORDER BY start_time',
    [providerId],
  );
  const busyRows = await all<{ start_at: string; end_at: string }>(
    `SELECT start_at, end_at FROM appointments
      WHERE provider_id = ? AND status <> 'cancelled' AND id <> ?
        AND end_at > ? AND start_at < ?`,
    [providerId, excludeId, from, to],
  );

  const blocksByWeekday = new Map<number, Block[]>();
  for (const b of blockRows) {
    const list = blocksByWeekday.get(b.weekday) ?? [];
    list.push(b);
    blocksByWeekday.set(b.weekday, list);
  }
  return {
    holidays: new Set(holidayRows.map((h) => h.day)),
    blocksByWeekday,
    busy: busyRows.map((b) => [Date.parse(b.start_at), Date.parse(b.end_at)] as const),
  };
}

/** Is this local day inside the bookable window (not in the past, not too far ahead)? */
function inWindow(day: DateTime, now: DateTime) {
  const today = now.startOf('day');
  if (day.toMillis() < today.toMillis()) return false;
  if (day.toMillis() > today.plus({ days: config.booking.maxAdvanceDays }).toMillis()) return false;
  return true;
}

/** Pure computation: bookable slots of one local date, from already loaded data. */
function slotsForDay(data: ProviderData, durationMin: number, date: string, now: DateTime): Slot[] {
  const zone = config.tz;
  const { slotStepMin, minNoticeMin } = config.booking;

  const day = DateTime.fromISO(date, { zone });
  if (!day.isValid || !inWindow(day, now)) return [];
  if (data.holidays.has(date)) return [];

  const weekday = day.weekday % 7; // luxon: Mon=1..Sun=7  ->  our schema: Sun=0..Sat=6
  const blocks = data.blocksByWeekday.get(weekday) ?? [];
  if (blocks.length === 0) return [];

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
      const free = !data.busy.some(([bs, be]) => s < be && e > bs);
      if (s >= earliest && free) {
        slots.push({ start: toUtcIso(cursor), end: toUtcIso(end), time: cursor.toFormat('HH:mm') });
      }
      cursor = cursor.plus({ minutes: slotStepMin });
    }
  }
  return slots;
}

/**
 * All bookable slots for one provider, one service duration, one local date.
 * Applies: working hours, holidays (clinic-wide + provider), no overlap with existing
 * appointments (any duration), minimum notice, and maximum days ahead.
 * `excludeId` lets an appointment be moved without blocking itself.
 */
export async function getSlots(providerId: number, durationMin: number, date: string, excludeId = 0): Promise<Slot[]> {
  const day = DateTime.fromISO(date, { zone: config.tz });
  const now = DateTime.now().setZone(config.tz);
  if (!day.isValid || !inWindow(day, now)) return [];
  const data = await loadData(providerId, date, day.plus({ days: 1 }).toISODate()!, excludeId);
  return slotsForDay(data, durationMin, date, now);
}

/** For a calendar view: each day of the month with the number of free slots (3 queries for the whole month). */
export async function monthAvailability(providerId: number, durationMin: number, month: string, excludeId = 0) {
  const first = DateTime.fromISO(`${month}-01`, { zone: config.tz });
  const next = first.plus({ months: 1 });
  const data = await loadData(providerId, first.toISODate()!, next.toISODate()!, excludeId);
  const now = DateTime.now().setZone(config.tz);

  const days: { date: string; slots: number; holiday: boolean }[] = [];
  for (let d = first; d.month === first.month; d = d.plus({ days: 1 })) {
    const date = d.toISODate()!;
    days.push({ date, slots: slotsForDay(data, durationMin, date, now).length, holiday: data.holidays.has(date) });
  }
  return days;
}
