import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../auth/AuthContext';
import { errorKey } from '../lib/errors';
import { useI18n, type MessageKey } from '../i18n';

export default function Login() {
  const { t } = useI18n();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  if (user) return <Navigate to={from ?? homeFor(user)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(email.trim(), password);
      navigate(from ?? homeFor(u), { replace: true });
    } catch (err) {
      setError(errorKey(err));
      setBusy(false);
    }
  }

  return (
    <div className="container narrow">
      <form className="card form" onSubmit={submit} noValidate>
        <h1>{t('login.title')}</h1>
        <p className="muted">{t('login.subtitle')}</p>

        {error && <div className="alert alert-error" role="alert">{t(error)}</div>}

        <label className="field">
          <span>{t('login.email')}</span>
          {/* dir="ltr": emails/passwords are always typed left-to-right, even on the Arabic page */}
          <input type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('login.password')}</span>
          <input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        <button className="btn btn-primary btn-block" disabled={busy || !email || !password}>
          {busy ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
    </div>
  );
}
