import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, publicApi, type Appointment, type AppointmentStatus, type PatientInput } from '../lib/api';
import { errorKey } from '../lib/errors';
import { saveToken, savedTokens } from '../lib/myBookings';
import { useI18n, type MessageKey } from '../i18n';
import SlotPicker from '../components/SlotPicker';
import PatientForm from '../components/PatientForm';
import AppointmentSummary from '../components/AppointmentSummary';
import { StarInput, Stars } from '../components/Stars';

const TOKEN_RE = /[0-9a-f]{32}/i;

const STATUS_KEY: Record<AppointmentStatus, MessageKey> = {
  confirmed: 'status.confirmed',
  cancelled: 'status.cancelled',
  completed: 'status.completed',
  no_show: 'status.no_show',
};

export default function Manage() {
  const { token } = useParams();
  return token ? <ManageBooking token={token.toLowerCase()} /> : <Lookup />;
}

// ---------- no token: paste a link, or pick a booking saved on this device ----------

function Lookup() {
  const { t, lang, formatDate, formatTime } = useI18n();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [saved, setSaved] = useState<Appointment[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(savedTokens().slice(0, 5).map((tk) => publicApi.getBooking(tk))).then((rs) => {
      if (cancelled) return;
      setSaved(rs.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])));
    });
    return () => { cancelled = true; };
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const m = text.match(TOKEN_RE);
    if (!m) { setInvalid(true); return; }
    navigate(`/manage/${m[0].toLowerCase()}`);
  }

  return (
    <div className="container narrow-lg page">
      <form className="card form" onSubmit={submit} noValidate>
        <h1>{t('manage.lookup.title')}</h1>
        <p className="muted">{t('manage.lookup.text')}</p>
        {invalid && <div className="alert alert-error" role="alert">{t('manage.lookup.invalid')}</div>}
        <label className="field">
          <span>{t('manage.lookup.label')}</span>
          <input dir="ltr" value={text} onChange={(e) => { setText(e.target.value); setInvalid(false); }} />
        </label>
        <button className="btn btn-primary btn-block" disabled={!text.trim()}>{t('manage.lookup.submit')}</button>
      </form>

      {saved.length > 0 && (
        <section className="section">
          <h2>{t('manage.saved')}</h2>
          <div className="list">
            {saved.map((a) => (
              <Link key={a.id} to={`/manage/${a.manageToken}`} className="card list-item">
                <div>
                  <strong>{formatDate(a.startAt)} · <bdi>{formatTime(a.startAt)}</bdi></strong>
                  <div className="muted">{lang === 'ar' ? a.service.nameAr : a.service.nameEn} · {lang === 'ar' ? a.provider.nameAr : a.provider.nameEn}</div>
                </div>
                <span className={`chip status-${a.status}`}>{t(STATUS_KEY[a.status])}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------- one booking: view, change time, edit details, cancel ----------

type Mode = 'view' | 'reschedule' | 'edit' | 'cancel';

function ManageBooking({ token }: { token: string }) {
  const { t } = useI18n();
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [loadError, setLoadError] = useState<MessageKey | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [newStart, setNewStart] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAppt(null); setLoadError(null); setMode('view'); setNotice(null); setError(null);
    publicApi.getBooking(token)
      .then((a) => { if (!cancelled) { setAppt(a); saveToken(token); } })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof ApiError && e.code === 'not_found' ? 'manage.notFound' : errorKey(e)); });
    return () => { cancelled = true; };
  }, [token]);

  /** Run an update call, then show the new state and a success notice. */
  async function act(call: () => Promise<Appointment>, success: MessageKey) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const updated = await call();
      setAppt(updated); setMode('view'); setNewStart(null); setNotice(success);
    } catch (e) {
      const key = errorKey(e);
      setError(key);
      if (key === 'error.slot_unavailable') { setNewStart(null); setReloadKey((k) => k + 1); }
      if (key === 'error.cannot_modify') setMode('view');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="container narrow-lg page center-msg">
        <div className="alert alert-error" role="alert">{t(loadError)}</div>
        <Link to="/manage" className="btn btn-primary">{t('manage.lookup.title')}</Link>
      </div>
    );
  }
  if (!appt) return <div className="container center-msg">{t('common.loading')}</div>;

  const editable = appt.status === 'confirmed' && appt.canModify;
  const back = <button type="button" className="btn btn-ghost" onClick={() => { setMode('view'); setError(null); }}>{t('common.back')}</button>;

  return (
    <div className="container narrow-lg page">
      <div className="card">
        <div className="card-head">
          <h1>{t('page.manage')}</h1>
          <span className={`chip status-${appt.status}`}>{t(STATUS_KEY[appt.status])}</span>
        </div>

        {notice && <div className="alert alert-ok" role="status">{t(notice)}</div>}
        {error && <div className="alert alert-error" role="alert">{t(error)}</div>}

        <AppointmentSummary appt={appt} />

        {mode === 'view' && (
          <>
            {appt.status === 'cancelled' && <p className="muted">{t('manage.cancelledInfo')}</p>}
            {appt.status === 'confirmed' && !appt.canModify && <p className="muted">{t('manage.locked')}</p>}
            {editable && (
              <div className="actions">
                <button className="btn btn-primary" onClick={() => { setMode('reschedule'); setError(null); setNotice(null); }}>{t('manage.reschedule')}</button>
                <button className="btn btn-outline" onClick={() => { setMode('edit'); setError(null); setNotice(null); }}>{t('manage.editDetails')}</button>
                <button className="btn btn-danger" onClick={() => { setMode('cancel'); setError(null); setNotice(null); }}>{t('manage.cancel')}</button>
              </div>
            )}
          </>
        )}

        {appt.status === 'completed' && mode === 'view' && (
          appt.review ? (
            <div className="review-box">
              <strong>{t('review.yours')}</strong> <Stars value={appt.review.rating} />
              {appt.review.comment && <p className="muted">“{appt.review.comment}”</p>}
            </div>
          ) : appt.canReview && (
            <ReviewForm busy={busy} onSubmit={(rating, comment) => act(() => publicApi.review(token, { rating, comment: comment || undefined }), 'review.thanks')} />
          )
        )}

        {mode === 'cancel' && (
          <div className="confirm-box">
            <p><strong>{t('manage.cancelAsk')}</strong></p>
            <div className="actions">
              <button className="btn btn-danger" disabled={busy} onClick={() => act(() => publicApi.cancelBooking(token), 'manage.cancelled')}>{t('manage.cancelYes')}</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setMode('view')}>{t('manage.keep')}</button>
            </div>
          </div>
        )}
      </div>

      {mode === 'reschedule' && (
        <div className="card section-card">
          <h2>{t('manage.newTime')}</h2>
          <SlotPicker providerId={appt.provider.id} serviceId={appt.service.id} value={newStart} onChange={setNewStart} reloadKey={reloadKey} excludeToken={token} />
          <div className="actions">
            {back}
            <button className="btn btn-primary" disabled={!newStart || busy}
              onClick={() => newStart && act(() => publicApi.updateBooking(token, { start: newStart }), 'manage.rescheduled')}>
              {busy ? t('manage.saving') : t('manage.save')}
            </button>
          </div>
        </div>
      )}

      {mode === 'edit' && (
        <div className="card section-card">
          <h2>{t('manage.editDetails')}</h2>
          <PatientForm
            initial={{ patientName: appt.patient.name, phone: appt.patient.phone, email: appt.patient.email ?? '', notes: appt.patient.notes ?? '' }}
            busy={busy}
            submitLabel={busy ? t('manage.saving') : t('manage.save')}
            onSubmit={(v: PatientInput) => act(() => publicApi.updateBooking(token, v), 'manage.updated')}
            extra={back}
          />
        </div>
      )}
    </div>
  );
}

function ReviewForm({ busy, onSubmit }: { busy: boolean; onSubmit: (rating: number, comment: string) => void }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [missing, setMissing] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (rating < 1) { setMissing(true); return; }
    onSubmit(rating, comment.trim());
  }

  return (
    <form className="review-box" onSubmit={submit} noValidate>
      <h2>{t('review.title')}</h2>
      <div className="field">
        <span>{t('review.rate')}</span>
        <StarInput value={rating} onChange={(n) => { setRating(n); setMissing(false); }} />
        {missing && <small className="field-error">{t('review.pickRating')}</small>}
      </div>
      <label className="field">
        <span>{t('review.comment')}</span>
        <textarea rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <p className="muted small">{t('review.moderation')}</p>
      <button className="btn btn-primary" disabled={busy}>{busy ? t('review.sending') : t('review.submit')}</button>
    </form>
  );
}
