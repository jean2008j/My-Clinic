import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, publicApi, type AdminAppointment, type AppointmentStatus, type Holiday, type Provider } from '../../lib/api';
import { addMonths, endOfMonth, localYmd, todayYmd } from '../../lib/dates';
import { errorKey } from '../../lib/errors';
import { useI18n, type MessageKey } from '../../i18n';
import ProviderFilter from './ProviderFilter';
import ApptCard from '../../components/ApptCard';

export default function CalendarTab({ providers }: { providers: Provider[] }) {
  const { t, lang, dir, locale, formatYmd } = useI18n();
  const today = todayYmd();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [providerId, setProviderId] = useState<number | undefined>();
  const [selected, setSelected] = useState<string | null>(today);
  const [appts, setAppts] = useState<AdminAppointment[] | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    Promise.all([
      adminApi.appointments({ from: `${month}-01`, to: endOfMonth(month), providerId }),
      publicApi.holidays(),
    ])
      .then(([a, h]) => { if (!cancelled) { setAppts(a); setHolidays(h); } })
      .catch((e) => { if (!cancelled) setError(errorKey(e)); });
    return () => { cancelled = true; };
  }, [month, providerId]);

  useEffect(() => { setAppts(null); return load(); }, [load]);

  // Active (not cancelled) bookings per local day, plus the full list per day.
  const byDay = useMemo(() => {
    const m = new Map<string, AdminAppointment[]>();
    for (const a of appts ?? []) {
      const d = localYmd(a.start_at);
      m.set(d, [...(m.get(d) ?? []), a]);
    }
    return m;
  }, [appts]);

  const offDays = useMemo(
    () => new Set(holidays.filter((h) => h.provider_id === null || h.provider_id === providerId || providerId === undefined).map((h) => h.day)),
    [holidays, providerId],
  );

  const weekStart = lang === 'ar' ? 6 : 1;
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' }).format(new Date(Date.UTC(2023, 0, 1 + ((weekStart + i) % 7)))));
  const [y, m] = month.split('-').map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() - weekStart + 7) % 7;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const title = formatYmd(`${month}-01`, { weekday: undefined, day: undefined });

  async function change(a: AdminAppointment, status: AppointmentStatus) {
    setBusyId(a.id); setError(null);
    try {
      await adminApi.setStatus(a.id, status);
      setAppts((list) => list?.map((x) => (x.id === a.id ? { ...x, status } : x)) ?? null);
    } catch (e) {
      setError(errorKey(e));
      load(); // someone may have changed it meanwhile
    } finally {
      setBusyId(null);
    }
  }

  const dayList = selected ? byDay.get(selected) ?? [] : [];
  const prev = dir === 'rtl' ? '›' : '‹';
  const next = dir === 'rtl' ? '‹' : '›';

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-group">
          <button className="btn btn-ghost btn-sm" aria-label={t('cal.prev')} onClick={() => setMonth(addMonths(month, -1))}>{prev}</button>
          <strong className="toolbar-title">{title}</strong>
          <button className="btn btn-ghost btn-sm" aria-label={t('cal.next')} onClick={() => setMonth(addMonths(month, 1))}>{next}</button>
          <button className="btn btn-outline btn-sm" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>{t('admin.today')}</button>
        </div>
        <ProviderFilter providers={providers} value={providerId} onChange={setProviderId} />
      </div>

      {error && <div className="alert alert-error" role="alert">{t(error)}</div>}

      <div className="admin-cal">
        <div className="card acal">
          <div className={appts ? 'acal-grid' : 'acal-grid loading'}>
            {weekdays.map((w) => <div key={w} className="cal-dow">{w}</div>)}
            {Array.from({ length: offset }, (_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: count }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`;
              const list = byDay.get(date) ?? [];
              const active = list.filter((a) => a.status !== 'cancelled').length;
              const cls = ['acal-day', date === selected ? 'selected' : '', date === today ? 'today' : '', offDays.has(date) ? 'off' : ''].join(' ').trim();
              return (
                <button key={date} type="button" className={cls} aria-pressed={date === selected} onClick={() => setSelected(date)}>
                  <span className="acal-no">{i + 1}</span>
                  {active > 0 && <span className="acal-count">{active}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card day-panel">
          {!selected ? <p className="muted">{t('admin.selectDay')}</p> : (
            <>
              <h2>{formatYmd(selected)}</h2>
              {offDays.has(selected) && <span className="chip status-cancelled">{t('admin.dayOff')}</span>}
              <p className="muted">{t('admin.dayCount', { n: dayList.filter((a) => a.status !== 'cancelled').length })}</p>
              {appts && dayList.length === 0 && <p className="muted">{t('admin.noAppts')}</p>}

              <ul className="appt-list">
                {dayList.map((a) => (
                  <ApptCard key={a.id} appt={a} busy={busyId === a.id} allowCancel onStatus={(st) => change(a, st)} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
