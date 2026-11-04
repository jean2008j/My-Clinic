import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type MessageKey } from './en';
import { ar } from './ar';

export type Lang = 'ar' | 'en';
export type { MessageKey };

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, ar };
const STORAGE_KEY = 'clinic.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch { /* storage blocked: ignore */ }
  // Arabic by default; English only if the browser is clearly English.
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'ar';
}

interface I18n {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  locale: string;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  /** Pick the Arabic or English column of an API row: pick(row, 'name') reads name_ar / name_en. */
  pick: (row: Record<string, any>, base: string) => string;
  formatDate: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
  formatTime: (iso: string) => string;
  /** Format a plain calendar date 'YYYY-MM-DD' (no time zone shifting). */
  formatYmd: (ymd: string, opts?: Intl.DateTimeFormatOptions) => string;
}

const Ctx = createContext<I18n | null>(null);

// Clinic's own time zone, so a visitor abroad still sees the clinic's local times.
export const CLINIC_TZ = 'Europe/Amsterdam';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  // Keep <html lang dir> in sync: this is what flips the whole layout (RTL/LTR).
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = dictionaries[lang]['app.name'];
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const value = useMemo<I18n>(() => {
    // "-u-nu-latn" = Latin digits (0-9) even in Arabic, matching phone numbers and the server.
    const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
    return {
      lang,
      dir,
      locale,
      setLang,
      toggleLang: () => setLang(lang === 'ar' ? 'en' : 'ar'),
      t: (key, params) => {
        let s = dictionaries[lang][key] ?? en[key] ?? key;
        if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
        return s;
      },
      pick: (row, base) => String(row[`${base}_${lang}`] ?? row[`${base}_en`] ?? ''),
      formatDate: (iso, opts) =>
        new Intl.DateTimeFormat(locale, { timeZone: CLINIC_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...opts }).format(new Date(iso)),
      formatTime: (iso) =>
        new Intl.DateTimeFormat(locale, { timeZone: CLINIC_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)),
      formatYmd: (ymd, opts) =>
        new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...opts }).format(new Date(`${ymd}T00:00:00Z`)),
    };
  }, [lang, dir, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>');
  return v;
}
