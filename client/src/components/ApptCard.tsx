import { useState } from 'react';
import type { AdminAppointment, AppointmentStatus } from '../lib/api';
import { useI18n, type MessageKey } from '../i18n';

const STATUS_KEY: Record<AppointmentStatus, MessageKey> = {
  confirmed: 'status.confirmed',
  cancelled: 'status.cancelled',
  completed: 'status.completed',
  no_show: 'status.no_show',
};

interface Props {
  appt: AdminAppointment;
  busy: boolean;
  /** the admin may cancel; a doctor may not */
  allowCancel: boolean;
  onStatus: (status: AppointmentStatus) => void;
}

/** One appointment with its action buttons (used by the admin calendar and the doctor's schedule). */
export default function ApptCard({ appt: a, busy, allowCancel, onStatus }: Props) {
  const { t, pick, formatTime } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const row = a as unknown as Record<string, any>;

  return (
    <li className={`appt ${a.status === 'cancelled' ? 'is-cancelled' : ''}`}>
      <div className="appt-top">
        <strong><bdi>{formatTime(a.start_at)} – {formatTime(a.end_at)}</bdi></strong>
        <span className={`chip status-${a.status}`}>{t(STATUS_KEY[a.status])}</span>
      </div>
      <div>{a.patient_name} · <a href={`tel:${a.phone}`} dir="ltr">{a.phone}</a></div>
      <div className="muted">{pick(row, 'service_name')} · {pick(row, 'provider_name')}</div>
      {a.notes && <div className="muted">“{a.notes}”</div>}

      {confirming ? (
        <div className="confirm-box">
          <p>{t('admin.confirmCancel')}</p>
          <div className="actions">
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => { setConfirming(false); onStatus('cancelled'); }}>{t('manage.cancelYes')}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>{t('manage.keep')}</button>
          </div>
        </div>
      ) : (
        <div className="actions">
          {a.status === 'confirmed' && (
            <>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onStatus('completed')}>{t('admin.markDone')}</button>
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => onStatus('no_show')}>{t('admin.markNoShow')}</button>
              {allowCancel && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirming(true)}>{t('admin.cancelAppt')}</button>}
            </>
          )}
          {(a.status === 'completed' || a.status === 'no_show') && (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onStatus('confirmed')}>{t('admin.reopen')}</button>
          )}
        </div>
      )}
    </li>
  );
}
