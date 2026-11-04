import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import type { Role } from '../lib/api';

/** Only lets in a logged-in user with one of the given roles; everyone else goes to /login. */
export default function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (loading) return <div className="container center-msg">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) {
    return (
      <div className="container center-msg">
        <p>{t('error.forbidden')}</p>
      </div>
    );
  }
  return <>{children}</>;
}
