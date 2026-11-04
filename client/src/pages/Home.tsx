import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicApi, type Provider, type PublicReview, type Service } from '../lib/api';
import { Stars } from '../components/Stars';
import { errorKey } from '../lib/errors';
import { useI18n, type MessageKey } from '../i18n';

export default function Home() {
  const { t, lang, pick } = useI18n();
  const [services, setServices] = useState<Service[] | null>(null);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [error, setError] = useState<MessageKey | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([publicApi.services(), publicApi.providers()])
      .then(([s, p]) => { setServices(s); setProviders(p); })
      .catch((e) => setError(errorKey(e)));
    // Reviews are a nice extra: if they fail to load, the page still works.
    publicApi.reviews(12).then((r) => setReviews(r.filter((x) => x.comment))).catch(() => setReviews([]));
  }, []);

  useEffect(load, [load]);

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <h1>{t('home.hero.title')}</h1>
          <p>{t('home.hero.text')}</p>
          <Link to="/book" className="btn btn-primary btn-lg">{t('home.cta')}</Link>
        </div>
      </section>

      <div className="container">
        {error && (
          <div className="alert alert-error" role="alert">
            <span>{t('home.loadError')} ({t(error)})</span>
            <button className="btn btn-outline btn-sm" onClick={load}>{t('home.retry')}</button>
          </div>
        )}

        {!error && !services && <p className="muted">{t('common.loading')}</p>}

        {services && (
          <section className="section">
            <h2>{t('home.services')}</h2>
            {services.length === 0 ? <p className="muted">{t('home.empty')}</p> : (
              <div className="grid">
                {services.map((s) => (
                  <article key={s.id} className="card">
                    <h3>{pick(s, 'name')}</h3>
                    <p className="muted">{pick(s, 'description')}</p>
                    <span className="chip">{t('home.minutes', { n: s.duration_min })}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {providers && (
          <section className="section">
            <h2>{t('home.providers')}</h2>
            {providers.length === 0 ? <p className="muted">{t('home.empty')}</p> : (
              <div className="grid">
                {providers.map((p) => (
                  <article key={p.id} className="card provider">
                    <div className="avatar" aria-hidden="true">{pick(p, 'name').trim().charAt(0)}</div>
                    <div>
                      <h3>{pick(p, 'name')}</h3>
                      <p className="specialty">{pick(p, 'specialty')}</p>
                      {p.ratingAvg !== null && (
                        <p className="rating-line"><Stars value={p.ratingAvg} /> <span className="muted">{t('home.ratingLine', { avg: p.ratingAvg, n: p.ratingCount })}</span></p>
                      )}
                      <p className="muted">{pick(p, 'bio')}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {reviews.length > 0 && (
          <section className="section">
            <h2>{t('home.reviews')}</h2>
            <div className="grid">
              {reviews.slice(0, 6).map((r) => (
                <figure key={r.id} className="card review-card">
                  <Stars value={r.rating} />
                  <blockquote>“{r.comment}”</blockquote>
                  <figcaption className="muted">{r.name} · {lang === 'ar' ? r.provider.nameAr : r.provider.nameEn}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
