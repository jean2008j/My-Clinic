import { useCallback, useEffect, useState } from 'react';
import { adminReviewsApi, type AdminReview } from '../../lib/api';
import { errorKey } from '../../lib/errors';
import { useI18n, type MessageKey } from '../../i18n';
import { Stars } from '../../components/Stars';

export default function ReviewsTab() {
  const { t, lang, formatDate } = useI18n();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [list, setList] = useState<AdminReview[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const nm = (o: { nameAr: string; nameEn: string }) => (lang === 'ar' ? o.nameAr : o.nameEn);

  const load = useCallback(() => {
    setError(null);
    adminReviewsApi.list(filter).then(setList).catch((e) => setError(errorKey(e)));
  }, [filter]);
  useEffect(() => { setList(null); load(); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); load(); } catch (e) { setError(errorKey(e)); }
  }

  return (
    <div>
      <div className="toolbar">
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as 'pending' | 'all')}>
          <option value="pending">{t('rev.filter.pending')}</option>
          <option value="all">{t('rev.filter.all')}</option>
        </select>
      </div>
      {error && <div className="alert alert-error" role="alert">{t(error)}</div>}
      {!list && !error && <p className="muted">{t('common.loading')}</p>}
      {list && list.length === 0 && <p className="muted">{t('rev.empty')}</p>}

      <ul className="appt-list">
        {list?.map((r) => (
          <li key={r.id} className="appt card">
            <div className="appt-top">
              <Stars value={r.rating} />
              <span className={r.approved ? 'chip status-confirmed' : 'chip status-no_show'}>
                {r.approved ? t('provider.published') : t('provider.pending')}
              </span>
            </div>
            {r.comment && <p>“{r.comment}”</p>}
            <div className="muted">
              {r.patientName} · {nm(r.provider)} · {nm(r.service)} · {formatDate(r.startAt, { weekday: undefined })}
            </div>
            {deleting === r.id ? (
              <div className="confirm-box">
                <p>{t('rev.confirmDelete')}</p>
                <div className="actions">
                  <button className="btn btn-danger btn-sm" onClick={() => { setDeleting(null); run(() => adminReviewsApi.remove(r.id)); }}>{t('rev.delete')}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDeleting(null)}>{t('common.back')}</button>
                </div>
              </div>
            ) : (
              <div className="actions">
                {r.approved
                  ? <button className="btn btn-outline btn-sm" onClick={() => run(() => adminReviewsApi.setApproved(r.id, false))}>{t('rev.hide')}</button>
                  : <button className="btn btn-primary btn-sm" onClick={() => run(() => adminReviewsApi.setApproved(r.id, true))}>{t('rev.approve')}</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => setDeleting(r.id)}>{t('rev.delete')}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
