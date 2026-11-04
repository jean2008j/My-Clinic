import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminApi, type Holiday, type Provider } from '../../lib/api';
import { todayYmd } from '../../lib/dates';
import { errorKey } from '../../lib/errors';
import { useI18n, type MessageKey } from '../../i18n';

export default function HolidaysTab({ providers }: { providers: Provider[] }) {
  const { t, pick, formatYmd } = useI18n();
  const [list, setList] = useState<Holiday[] | null>(null);
  const [day, setDay] = useState('');
  const [who, setWho] = useState(''); // '' = whole clinic
  const [reasonAr, setReasonAr] = useState('');
  const [reasonEn, setReasonEn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<{ key: MessageKey; n?: number } | null>(null);

  const load = useCallback(() => {
    adminApi.holidays().then(setList).catch((e) => setError(errorKey(e)));
  }, []);
  useEffect(load, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!day) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await adminApi.addHoliday({ day, providerId: who ? Number(who) : null, reasonAr, reasonEn });
      setNotice(r.affectedAppointments > 0 ? { key: 'hol.affected', n: r.affectedAppointments } : { key: 'hol.added' });
      setDay(''); setReasonAr(''); setReasonEn('');
      load();
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(h: Holiday) {
    setError(null); setNotice(null);
    try {
      await adminApi.deleteHoliday(h.id);
      setNotice({ key: 'hol.removed' });
      load();
    } catch (err) {
      setError(errorKey(err));
    }
  }

  const providerName = (id: number | null) => {
    const p = providers.find((x) => x.id === id);
    return id === null ? t('hol.wholeClinic') : p ? pick(p, 'name') : `#${id}`;
  };

  return (
    <div className="two-col">
      <form className="card" onSubmit={add} noValidate>
        <h2>{t('hol.add')}</h2>
        {error && <div className="alert alert-error" role="alert">{t(error)}</div>}
        {notice && <div className="alert alert-ok" role="status">{t(notice.key, { n: notice.n ?? 0 })}</div>}

        <label className="field">
          <span>{t('hol.date')}</span>
          <input type="date" dir="ltr" min={todayYmd()} value={day} onChange={(e) => setDay(e.target.value)} required />
        </label>
        <label className="field">
          <span>{t('hol.who')}</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">{t('hol.wholeClinic')}</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{pick(p, 'name')}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t('hol.reasonAr')}</span>
          <input dir="rtl" maxLength={200} value={reasonAr} onChange={(e) => setReasonAr(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('hol.reasonEn')}</span>
          <input dir="ltr" maxLength={200} value={reasonEn} onChange={(e) => setReasonEn(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={busy || !day}>{t('hol.submit')}</button>
      </form>

      <div className="card">
        <h2>{t('hol.upcoming')}</h2>
        {!list && <p className="muted">{t('common.loading')}</p>}
        {list && list.length === 0 && <p className="muted">{t('hol.empty')}</p>}
        <ul className="appt-list">
          {list?.map((h) => (
            <li key={h.id} className="appt">
              <div className="appt-top">
                <strong>{formatYmd(h.day)}</strong>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(h)}>{t('hol.delete')}</button>
              </div>
              <div className="muted">{providerName(h.provider_id)}{pick(h as unknown as Record<string, any>, 'reason') ? ` · ${pick(h as unknown as Record<string, any>, 'reason')}` : ''}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
