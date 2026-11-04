import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicApi, type Appointment, type PatientInput, type Provider, type Service } from '../lib/api';
import { errorKey } from '../lib/errors';
import { saveToken } from '../lib/myBookings';
import { useI18n, type MessageKey } from '../i18n';
import SlotPicker from '../components/SlotPicker';
import PatientForm from '../components/PatientForm';
import AppointmentSummary from '../components/AppointmentSummary';

type Step = 1 | 2 | 3 | 4;
const STEP_KEYS: MessageKey[] = ['book.step.service', 'book.step.doctor', 'book.step.time', 'book.step.details'];

export default function Book() {
  const { t, lang, pick, formatDate, formatTime } = useI18n();
  const [step, setStep] = useState<Step>(1);
  const [services, setServices] = useState<Service[] | null>(null);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Appointment | null>(null);

  useEffect(() => {
    publicApi.services().then(setServices).catch((e) => setError(errorKey(e)));
  }, []);

  function chooseService(s: Service) {
    setService(s); setProvider(null); setStart(null); setProviders(null); setError(null);
    setStep(2);
    publicApi.providers(s.id).then(setProviders).catch((e) => setError(errorKey(e)));
  }

  function chooseProvider(p: Provider) {
    setProvider(p); setStart(null); setError(null);
    setStep(3);
  }

  async function submit(patient: PatientInput) {
    if (!service || !provider || !start) return;
    setBusy(true); setError(null);
    try {
      const appt = await publicApi.book({
        providerId: provider.id, serviceId: service.id, start, lang,
        ...patient, email: patient.email || undefined, notes: patient.notes || undefined,
      });
      saveToken(appt.manageToken);
      setDone(appt);
    } catch (e) {
      const key = errorKey(e);
      setError(key === 'error.slot_unavailable' ? 'book.slotTaken' : key);
      if (key === 'error.slot_unavailable') { setStart(null); setReloadKey((k) => k + 1); setStep(3); }
    } finally {
      setBusy(false);
    }
  }

  if (done) return <Confirmation appt={done} onAnother={() => { setDone(null); setStep(1); setService(null); setProvider(null); setStart(null); }} />;

  return (
    <div className="container page">
      <h1>{t('page.book')}</h1>

      <ol className="stepper" aria-label={t('page.book')}>
        {STEP_KEYS.map((k, i) => (
          <li key={k} className={step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''} aria-current={step === i + 1 ? 'step' : undefined}>
            <span className="step-no">{i + 1}</span><span className="step-label">{t(k)}</span>
          </li>
        ))}
      </ol>

      {error && <div className="alert alert-error" role="alert">{t(error)}</div>}

      {step === 1 && (
        <section>
          <h2>{t('book.chooseService')}</h2>
          {!services && !error && <p className="muted">{t('common.loading')}</p>}
          <div className="grid">
            {services?.map((s) => (
              <button key={s.id} type="button" className="card choice" onClick={() => chooseService(s)}>
                <h3>{pick(s, 'name')}</h3>
                <p className="muted">{pick(s, 'description')}</p>
                <span className="chip">{t('home.minutes', { n: s.duration_min })}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && service && (
        <section>
          <h2>{t('book.chooseDoctor')}</h2>
          {!providers && !error && <p className="muted">{t('common.loading')}</p>}
          {providers?.length === 0 && <p className="muted">{t('book.noDoctors')}</p>}
          <div className="grid">
            {providers?.map((p) => (
              <button key={p.id} type="button" className="card choice provider" onClick={() => chooseProvider(p)}>
                <div className="avatar" aria-hidden="true">{pick(p, 'name').trim().charAt(0)}</div>
                <div>
                  <h3>{pick(p, 'name')}</h3>
                  <p className="specialty">{pick(p, 'specialty')}</p>
                  <p className="muted">{pick(p, 'bio')}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="actions"><button className="btn btn-ghost" onClick={() => setStep(1)}>{t('common.back')}</button></div>
        </section>
      )}

      {step === 3 && service && provider && (
        <section>
          <h2>{t('book.chooseTime')}</h2>
          <p className="muted">{pick(service, 'name')} · {pick(provider, 'name')}</p>
          <SlotPicker providerId={provider.id} serviceId={service.id} value={start} onChange={setStart} reloadKey={reloadKey} />
          <div className="actions">
            <button className="btn btn-ghost" onClick={() => setStep(2)}>{t('common.back')}</button>
            <button className="btn btn-primary" disabled={!start} onClick={() => { setError(null); setStep(4); }}>{t('book.next')}</button>
          </div>
        </section>
      )}

      {step === 4 && service && provider && start && (
        <section className="two-col">
          <div className="card">
            <h2>{t('book.yourDetails')}</h2>
            <PatientForm
              busy={busy}
              submitLabel={busy ? t('book.confirming') : t('book.confirm')}
              onSubmit={submit}
              extra={<button type="button" className="btn btn-ghost" onClick={() => setStep(3)}>{t('common.back')}</button>}
            />
          </div>
          <div className="card">
            <h2>{t('book.summary')}</h2>
            <dl className="summary">
              {([
                [t('summary.service'), pick(service, 'name')],
                [t('summary.doctor'), pick(provider, 'name')],
                [t('summary.date'), formatDate(start)],
                [t('summary.time'), formatTime(start)],
                [t('summary.duration'), t('home.minutes', { n: service.duration_min })],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="summary-row"><dt>{k}</dt><dd><bdi>{v}</bdi></dd></div>
              ))}
            </dl>
          </div>
        </section>
      )}
    </div>
  );
}

function Confirmation({ appt, onAnother }: { appt: Appointment; onAnother: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/manage/${appt.manageToken}`;

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* user can select the text manually */ }
  }

  return (
    <div className="container narrow-lg page">
      <div className="card success">
        <div className="check" aria-hidden="true">✓</div>
        <h1>{t('book.done.title')}</h1>
        <AppointmentSummary appt={appt} />
        <p className="muted">{t('book.done.text')}</p>
        <label className="field">
          <span>{t('book.done.link')}</span>
          <div className="copy-row">
            <input readOnly dir="ltr" value={link} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn btn-outline" onClick={copy}>{copied ? t('book.copied') : t('book.copy')}</button>
          </div>
        </label>
        <div className="actions">
          <Link className="btn btn-primary" to={`/manage/${appt.manageToken}`}>{t('book.view')}</Link>
          <button className="btn btn-ghost" onClick={onAnother}>{t('book.another')}</button>
        </div>
      </div>
    </div>
  );
}
