import { useEffect, useState } from 'react';
import { adminApi, type Provider, type Stats } from '../../lib/api';
import { addDays, endOfMonth, todayYmd } from '../../lib/dates';
import { errorKey } from '../../lib/errors';
import { useI18n, type MessageKey } from '../../i18n';
import ProviderFilter from './ProviderFilter';

type RangeId = 'last30' | 'next30' | 'thisMonth' | 'last90';
const RANGES: { id: RangeId; label: MessageKey }[] = [
  { id: 'last30', label: 'stats.range.last30' },
  { id: 'next30', label: 'stats.range.next30' },
  { id: 'thisMonth', label: 'stats.range.thisMonth' },
  { id: 'last90', label: 'stats.range.last90' },
];

function rangeDates(id: RangeId): { from: string; to: string } {
  const today = todayYmd();
  switch (id) {
    case 'last30': return { from: addDays(today, -29), to: today };
    case 'next30': return { from: today, to: addDays(today, 29) };
    case 'thisMonth': return { from: `${today.slice(0, 7)}-01`, to: endOfMonth(today.slice(0, 7)) };
    case 'last90': return { from: addDays(today, -89), to: today };
  }
}

export default function StatsTab({ providers }: { providers: Provider[] }) {
  const { t, locale, pick } = useI18n();
  const [range, setRange] = useState<RangeId>('last30');
  const [providerId, setProviderId] = useState<number | undefined>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStats(null); setError(null);
    adminApi.stats({ ...rangeDates(range), providerId })
      .then((s) => { if (!cancelled) setStats(s); })
      .catch((e) => { if (!cancelled) setError(errorKey(e)); });
    return () => { cancelled = true; };
  }, [range, providerId]);

  const weekdayName = (dow: number) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'long' }).format(new Date(Date.UTC(2023, 0, 1 + dow)));

  const active = stats ? stats.totals.total - stats.totals.cancelled : 0;
  const maxIdx = (arr: number[]) => arr.reduce((best, v, i) => (v > arr[best] ? i : best), 0);

  return (
    <div>
      <div className="toolbar">
        <select className="select" value={range} onChange={(e) => setRange(e.target.value as RangeId)}>
          {RANGES.map((r) => <option key={r.id} value={r.id}>{t(r.label)}</option>)}
        </select>
        <ProviderFilter providers={providers} value={providerId} onChange={setProviderId} />
      </div>

      {error && <div className="alert alert-error" role="alert">{t(error)}</div>}
      {!stats && !error && <p className="muted">{t('common.loading')}</p>}

      {stats && (
        <>
          <div className="kpis">
            <Kpi label={t('stats.total')} value={stats.totals.total} />
            <Kpi label={t('stats.confirmed')} value={stats.totals.confirmed} />
            <Kpi label={t('stats.completed')} value={stats.totals.completed} />
            <Kpi label={t('stats.cancelled')} value={stats.totals.cancelled} />
            <Kpi label={t('stats.noShow')} value={stats.totals.noShow} />
            <Kpi label={t('stats.cancelRate')} value={`${stats.totals.total ? Math.round((stats.totals.cancelled / stats.totals.total) * 100) : 0}%`} />
          </div>

          {active === 0 ? <p className="muted">{t('stats.noData')}</p> : (
            <>
              <div className="highlights">
                <span className="chip">{t('stats.busiestDay')}: <bdi>{weekdayName(maxIdx(stats.byWeekday))}</bdi></span>
                <span className="chip">{t('stats.busiestHour')}: <bdi>{String(maxIdx(stats.byHour)).padStart(2, '0')}:00</bdi></span>
              </div>

              <div className="charts">
                <Bars title={t('stats.byWeekday')} rows={stats.byWeekday.map((c, dow) => ({ key: String(dow), label: weekdayName(dow), count: c }))} />
                <Bars
                  title={t('stats.byHour')}
                  rows={stats.byHour.map((c, h) => ({ key: String(h), label: `${String(h).padStart(2, '0')}:00`, count: c })).filter((r) => r.count > 0)}
                />
                <Bars title={t('stats.byService')} rows={stats.byService.map((s) => ({ key: String(s.id), label: pick({ n_ar: s.nameAr, n_en: s.nameEn }, 'n'), count: s.count }))} />
                {!providerId && (
                  <Bars title={t('stats.byProvider')} rows={stats.byProvider.map((p) => ({ key: String(p.id), label: pick({ n_ar: p.nameAr, n_en: p.nameEn }, 'n'), count: p.count }))} />
                )}
              </div>
              <p className="muted small">{t('stats.note')}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card kpi">
      <div className="kpi-value">{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}

/** Simple horizontal bar chart made of divs (no chart library needed). */
function Bars({ title, rows }: { title: string; rows: { key: string; label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="card">
      <h3>{title}</h3>
      <div className="bars">
        {rows.map((r) => (
          <div key={r.key} className="bar-row">
            <span className="bar-label"><bdi>{r.label}</bdi></span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.count / max) * 100}%` }} /></span>
            <span className="bar-num">{r.count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
