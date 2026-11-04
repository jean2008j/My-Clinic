import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="container center-msg">
      <h1>404</h1>
      <p>{t('common.notFound')}</p>
      <Link to="/" className="btn btn-primary">{t('common.goHome')}</Link>
    </div>
  );
}
