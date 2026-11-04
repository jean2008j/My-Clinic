import type { Provider } from '../../lib/api';
import { useI18n } from '../../i18n';

interface Props { providers: Provider[]; value: number | undefined; onChange: (id: number | undefined) => void }

export default function ProviderFilter({ providers, value, onChange }: Props) {
  const { t, pick } = useI18n();
  return (
    <select
      className="select"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      aria-label={t('summary.doctor')}
    >
      <option value="">{t('admin.allDoctors')}</option>
      {providers.map((p) => <option key={p.id} value={p.id}>{pick(p, 'name')}</option>)}
    </select>
  );
}
