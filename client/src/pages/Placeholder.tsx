import { useI18n, type MessageKey } from '../i18n';

/** Stand-in for pages that arrive in batches 4-6. */
export default function Placeholder({ titleKey }: { titleKey: MessageKey }) {
  const { t } = useI18n();
  return (
    <div className="container center-msg">
      <h1>{t(titleKey)}</h1>
      <p className="muted">{t('common.soon')}</p>
    </div>
  );
}
