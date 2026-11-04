import { CLINIC_TZ } from '../i18n';

/** Today's date in the clinic's time zone, as 'YYYY-MM-DD'. */
export function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** 'YYYY-MM' shifted by n months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The clinic-local calendar day ('YYYY-MM-DD') of an instant (UTC ISO string). */
export const localYmd = (iso: string): string => ymdFmt.format(new Date(iso));

/** Last day of 'YYYY-MM' as 'YYYY-MM-DD'. */
export function endOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' shifted by n days. */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
