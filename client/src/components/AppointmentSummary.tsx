import type { Appointment } from '../lib/api';
import { useI18n } from '../i18n';

export default function AppointmentSummary({ appt }: { appt: Appointment }) {
  const { t, lang, formatDate, formatTime } = useI18n();
  const nm = (o: { nameAr: string; nameEn: string }) => (lang === 'ar' ? o.nameAr : o.nameEn);

  const rows: [string, string][] = [
    [t('summary.service'), nm(appt.service)],
    [t('summary.doctor'), nm(appt.provider)],
    [t('summary.date'), formatDate(appt.startAt)],
    [t('summary.time'), `${formatTime(appt.startAt)} – ${formatTime(appt.endAt)}`],
    [t('summary.duration'), t('home.minutes', { n: appt.service.durationMin })],
    [t('summary.patient'), appt.patient.name],
    [t('summary.phone'), appt.patient.phone],
  ];
  if (appt.patient.email) rows.push([t('summary.email'), appt.patient.email]);
  if (appt.patient.notes) rows.push([t('summary.notes'), appt.patient.notes]);

  return (
    <dl className="summary">
      {rows.map(([k, v]) => (
        <div key={k} className="summary-row">
          <dt>{k}</dt>
          <dd><bdi>{v}</bdi></dd>
        </div>
      ))}
    </dl>
  );
}
