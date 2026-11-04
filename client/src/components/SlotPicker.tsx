import { useEffect, useState } from 'react';
import MonthCalendar from './MonthCalendar';
import { publicApi, type Slot } from '../lib/api';
import { errorKey } from '../lib/errors';
import { useI18n, type MessageKey } from '../i18n';

interface Props {
  providerId: number;
  serviceId: number;
  /** selected slot start (UTC ISO) */
  value: string | null;
  onChange: (start: string) => void;
  reloadKey?: number;
  /** patient's own booking token (rescheduling): keeps its current time selectable */
  excludeToken?: string;
}

/** Calendar + free times of the chosen day. */
export default function SlotPicker({ providerId, serviceId, value, onChange, reloadKey = 0, excludeToken }: Props) {
  const { t, formatYmd } = useI18n();
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setSlots(null);
    setError(null);
    publicApi.slots(providerId, serviceId, date, excludeToken)
      .then((s) => { if (!cancelled) setSlots(s); })
      .catch((e) => { if (!cancelled) setError(errorKey(e)); });
    return () => { cancelled = true; };
  }, [providerId, serviceId, date, reloadKey, excludeToken]);

  return (
    <div className="slotpicker">
      <MonthCalendar providerId={providerId} serviceId={serviceId} value={date} onSelect={setDate} reloadKey={reloadKey} excludeToken={excludeToken} />

      <div className="slots">
        {!date && <p className="muted">{t('book.pickDate')}</p>}
        {date && (
          <>
            <h3>{t('book.availableTimes')} — {formatYmd(date)}</h3>
            {error && <div className="alert alert-error" role="alert">{t(error)}</div>}
            {!error && !slots && <p className="muted">{t('common.loading')}</p>}
            {slots && slots.length === 0 && <p className="muted">{t('book.noTimes')}</p>}
            {slots && slots.length > 0 && (
              <div className="slot-grid">
                {slots.map((s) => (
                  <button
                    key={s.start}
                    type="button"
                    className={value === s.start ? 'slot selected' : 'slot'}
                    aria-pressed={value === s.start}
                    onClick={() => onChange(s.start)}
                  >
                    <bdi>{s.time}</bdi>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
