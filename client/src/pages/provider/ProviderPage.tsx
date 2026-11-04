import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { providerApi, type AdminAppointment, type AppointmentStatus, type DoctorReview, type Rating } from '../../lib/api';
import { addDays, todayYmd } from '../../lib/dates';
import { errorKey } from '../../lib/errors';
import { useI18n, type MessageKey } from '../../i18n';
import ApptCard from '../../components/ApptCard';
import { Stars } from '../../components/Stars';

type TabId = 'schedule' | 'reviews';

export default function ProviderPage() {
  const { t, pick } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get('tab') === 'reviews' ? 'reviews' : 'schedule';
  const [name, setName] = useState('');
  const [nameRow, setNameRow] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    providerApi.me().then((r) => setNameRow(r.provider as unknown as Record<string, string>)).catch(() => setNameRow(null));
  }, []);
  useEffect(() => { if (nameRow) setName(pick(nameRow, 'name')); }, [nameRow, pick]);

  return (
    <div className="container page">
      <h1>{t('page.provider')}</h1>
      {name && <p className="muted">{t('provider.hello', { name })}</p>}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'schedule'} className={tab === 'schedule' ? 'tab active' : 'tab'} onClick={() => setParams({ tab: 'schedule' })}>{t('provider.tab.schedule')}</button>
        <button role="tab" aria-selected={tab === 'reviews'} className={tab === 'reviews' ? 'tab active' : 'tab'} onClick={() => setParams({ tab: 'reviews' })}>{t('provider.tab.reviews')}</button>
      </div>

      {tab === 'schedule' ? <Schedule /> : <Reviews />}
    </div>
  );
}

function Schedule() {
  const { t, dir, formatYmd } = useI18n();
  const today = todayYmd();
  const [day, setDay] = useState(today);
  const [list, setList] = useState<AdminAppointment[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    providerApi.appointments(day)
      .then((a) => { if (!cancelled) setList(a); })
      .catch((e) => { if (!cancelled) setError(errorKey(e)); });
    return () => { cancelled = true; };
  }, [day]);
  useEffect(() => { setList(null); setError(null); return load(); }, [load]);

  async function change(a: AdminAppointment, status: AppointmentStatus) {
    if (status === 'cancelled') return; // doctors do not cancel; the admin does
    setBusyId(a.id); setError(null);
    try {
      await providerApi.setStatus(a.id, status);
      setList((l) => l?.map((x) => (x.id === a.id ? { ...x, status } : x)) ?? null);
    } catch (e) {
      setError(errorKey(e));
      load();
    } finally {
      setBusyId(null);
    }
  }

  const active = list?.filter((a) => a.status !== 'cancelled').length ?? 0;
  const prev = dir === 'rtl' ? '›' : '‹';
  const next = dir === 'rtl' ? '‹' : '›';

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-group">
          <button className="btn btn-ghost btn-sm" aria-label={t('provider.prevDay')} onClick={() => setDay(addDays(day, -1))}>{prev}</button>
          <input className="select" type="date" dir="ltr" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <button className="btn btn-ghost btn-sm" aria-label={t('provider.nextDay')} onClick={() => setDay(addDays(day, 1))}>{next}</button>
          <button className="btn btn-outline btn-sm" onClick={() => setDay(today)}>{t('admin.today')}</button>
        </div>
      </div>

      <h2>{formatYmd(day)}</h2>
      <p className="muted">{t('admin.dayCount', { n: active })}</p>
      {error && <div className="alert alert-error" role="alert">{t(error)}</div>}
      {!list && !error && <p className="muted">{t('common.loading')}</p>}
      {list && list.length === 0 && <p className="muted">{t('admin.noAppts')}</p>}

      <ul className="appt-list narrow-list">
        {list?.map((a) => (
          <ApptCard key={a.id} appt={a} busy={busyId === a.id} allowCancel={false} onStatus={(s) => change(a, s)} />
        ))}
      </ul>
    </div>
  );
}

function Reviews() {
  const { t, lang, formatDate } = useI18n();
  const [data, setData] = useState<{ rating: Rating; pending: number; reviews: DoctorReview[] } | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => { providerApi.reviews().then(setData).catch((e) => setError(errorKey(e))); }, []);

  if (error) return <div className="alert alert-error" role="alert">{t(error)}</div>;
  if (!data) return <p className="muted">{t('common.loading')}</p>;

  return (
    <div>
      <div className="kpis">
        <div className="card kpi">
          <div className="kpi-value">{data.rating.avg ?? '–'}</div>
          {data.rating.avg !== null && <Stars value={data.rating.avg} />}
          <div className="muted">{t('provider.avg')}</div>
        </div>
        <div className="card kpi"><div className="kpi-value">{data.rating.count}</div><div className="muted">{t('provider.count')}</div></div>
        <div className="card kpi"><div className="kpi-value">{data.pending}</div><div className="muted">{t('provider.pending')}</div></div>
      </div>

      {data.reviews.length === 0 && <p className="muted">{t('provider.noReviews')}</p>}
      <ul className="appt-list narrow-list">
        {data.reviews.map((r) => (
          <li key={r.id} className="appt card">
            <div className="appt-top">
              <Stars value={r.rating} />
              <span className={r.approved ? 'chip status-confirmed' : 'chip status-no_show'}>{r.approved ? t('provider.published') : t('provider.pending')}</span>
            </div>
            {r.comment && <p>“{r.comment}”</p>}
            <div className="muted">{r.name} · {lang === 'ar' ? r.service.nameAr : r.service.nameEn} · {formatDate(r.startAt, { weekday: undefined })}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
