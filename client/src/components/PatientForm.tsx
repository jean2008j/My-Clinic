import { useState, type FormEvent, type ReactNode } from 'react';
import { isValidEmail, isValidPhone } from '../lib/validate';
import { useI18n, type MessageKey } from '../i18n';
import type { PatientInput } from '../lib/api';

interface Props {
  initial?: PatientInput;
  busy: boolean;
  submitLabel: string;
  onSubmit: (v: PatientInput) => void;
  /** extra buttons (e.g. a Back button) */
  extra?: ReactNode;
}

type Errors = Partial<Record<'patientName' | 'phone' | 'email', MessageKey>>;

export default function PatientForm({ initial, busy, submitLabel, onSubmit, extra }: Props) {
  const { t } = useI18n();
  const [v, setV] = useState<PatientInput>(initial ?? { patientName: '', phone: '', email: '', notes: '' });
  const [errors, setErrors] = useState<Errors>({});
  const set = (k: keyof PatientInput) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (v.patientName.trim().length < 2) errs.patientName = 'field.nameRequired';
    if (!isValidPhone(v.phone)) errs.phone = 'field.invalidPhone';
    if (!isValidEmail(v.email ?? '')) errs.email = 'field.invalidEmail';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit({ patientName: v.patientName.trim(), phone: v.phone.trim(), email: (v.email ?? '').trim(), notes: (v.notes ?? '').trim() });
  }

  return (
    <form onSubmit={submit} noValidate>
      <label className="field">
        <span>{t('book.name')}</span>
        <input value={v.patientName} onChange={set('patientName')} autoComplete="name" maxLength={100} aria-invalid={!!errors.patientName} />
        {errors.patientName && <small className="field-error">{t(errors.patientName)}</small>}
      </label>
      <label className="field">
        <span>{t('book.phone')}</span>
        <input value={v.phone} onChange={set('phone')} type="tel" dir="ltr" inputMode="tel" autoComplete="tel" maxLength={25} aria-invalid={!!errors.phone} />
        {errors.phone && <small className="field-error">{t(errors.phone)}</small>}
      </label>
      <label className="field">
        <span>{t('book.email')}</span>
        <input value={v.email ?? ''} onChange={set('email')} type="email" dir="ltr" autoComplete="email" maxLength={120} aria-invalid={!!errors.email} />
        {errors.email && <small className="field-error">{t(errors.email)}</small>}
      </label>
      <label className="field">
        <span>{t('book.notes')}</span>
        <textarea rows={3} value={v.notes ?? ''} onChange={set('notes')} maxLength={500} />
      </label>
      <div className="actions">
        {extra}
        <button className="btn btn-primary" disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  );
}
