import { useI18n } from '../i18n';

/** Read-only stars: <Stars value={4} /> */
export function Stars({ value }: { value: number }) {
  const { t } = useI18n();
  const n = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="stars" role="img" aria-label={t('review.star', { n })} dir="ltr">
      {'★'.repeat(n)}<span className="stars-off">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

/** Clickable 1-5 stars. */
export function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useI18n();
  return (
    <div className="star-input" role="radiogroup" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t('review.star', { n })}
          className={n <= value ? 'star on' : 'star'}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}
