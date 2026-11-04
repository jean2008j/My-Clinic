import { useEffect, useMemo, useState } from 'react';
import { publicApi, type DayAvail } from '../lib/api';
import { addMonths, todayYmd } from '../lib/dates';
import { useI18n } from '../i18n';

interface Props {
  providerId: number;
  serviceId: number;
  value: string | null;
  onSelect: (date: string) => void;
  /** change to force a reload (e.g. after "slot already taken") */
  reloadKey?: number;
  /** patient's own booking token (rescheduling) */
  excludeToken?: string;
}

const MONTHS_AHEAD = 2; // server allows ~60 days ahead

export default function MonthCalendar({ providerId, serviceId, value, onSelect, reloadKey = 0, excludeToken }: Props) {
  const { t, lang, dir, locale, formatYmd } = useI18n();
  const thisMonth = todayYmd().slice(0, 7);
  const [month, setMonth] = useState(() => (value ? value.slice(0, 7) : thisMonth));
  const [days, setDays] = useState<Map<string, DayAvail> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDays(null);
    setFailed(false);
    publicApi.availability(providerId, serviceId, month, excludeToken)
      .then((list) => { if (!cancelled) setDays(new Map(list.map((d) => [d.date, d]))); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [providerId, serviceId, month, reloadKey, excludeToken]);

  // Week starts on Saturday in Arabic, Monday in English.
  const weekStart = lang === 'ar' ? 6 : 1;
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const dow = (weekStart + i) % 7; // 0 = Sunday; 2023-01-01 was a Sunday
      return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' }).format(new Date(Date.UTC(2023, 0, 1 + dow)));
    }),
    [locale, weekStart],
  );

  const [y, m] = month.split('-').map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() - weekStart + 7) % 7;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const title = formatYmd(`${month}-01`, { weekday: undefined, day: undefined });

  const prevGlyph = dir === 'rtl' ? '›' : '‹';
  const nextGlyph = dir === 'rtl' ? '‹' : '›';

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="btn btn-ghost btn-sm" aria-label={t('cal.prev')} disabled={month <= thisMonth} onClick={() => setMonth(addMonths(month, -1))}>{prevGlyph}</button>
        <strong>{title}</strong>
        <button type="button" className="btn btn-ghost btn-sm" aria-label={t('cal.next')} disabled={month >= addMonths(thisMonth, MONTHS_AHEAD)} onClick={() => setMonth(addMonths(month, 1))}>{nextGlyph}</button>
      </div>

      {failed && <div className="alert alert-error" role="alert">{t('cal.loadError')}</div>}

      <div className={days ? 'cal-grid' : 'cal-grid loading'}>
        {weekdays.map((w) => <div key={w} className="cal-dow">{w}</div>)}
        {Array.from({ length: offset }, (_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}`;
          const info = days?.get(date);
          const free = (info?.slots ?? 0) > 0;
          const cls = ['cal-day', free ? 'free' : '', value === date ? 'selected' : '', info?.holiday ? 'holiday' : ''].join(' ').trim();
          return (
            <button
              key={date}
              type="button"
              className={cls}
              disabled={!free}
              aria-pressed={value === date}
              title={info?.holiday ? t('cal.closed') : undefined}
              onClick={() => onSelect(date)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
