import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useAuth, homeFor } from '../auth/AuthContext';

export default function Layout() {
  const { t, lang, toggleLang } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link active' : 'nav-link');

  return (
    <div className="shell">
      <header className="header">
        <div className="container header-row">
          <Link to="/" className="brand" onClick={close}>
            <span className="brand-mark" aria-hidden="true">+</span>
            <span>{t('app.name')}</span>
          </Link>

          <button
            className="menu-btn"
            aria-label={t('nav.menu')}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span /><span /><span />
          </button>

          <nav className={open ? 'nav open' : 'nav'}>
            <NavLink to="/" end className={link} onClick={close}>{t('nav.home')}</NavLink>
            <NavLink to="/book" className={link} onClick={close}>{t('nav.book')}</NavLink>
            <NavLink to="/manage" className={link} onClick={close}>{t('nav.myBooking')}</NavLink>
            {user && (
              <NavLink to={homeFor(user)} className={link} onClick={close}>
                {user.role === 'admin' ? t('nav.admin') : t('nav.provider')}
              </NavLink>
            )}

            <span className="nav-spacer" />

            <button className="btn btn-ghost" onClick={toggleLang} lang={lang === 'ar' ? 'en' : 'ar'}>
              {t('nav.language')}
            </button>
            {user ? (
              <button
                className="btn btn-outline"
                onClick={() => { logout(); close(); navigate('/'); }}
              >
                {t('nav.logout')}
              </button>
            ) : (
              <Link to="/login" className="btn btn-outline" onClick={close}>{t('nav.login')}</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container">{t('common.footer', { year: new Date().getFullYear() })}</div>
      </footer>
    </div>
  );
}
