import { ApiError } from './api';
import type { MessageKey } from '../i18n';
import { en } from '../i18n/en';

/** Turn any thrown error into a translation key (falls back to a generic message). */
export function errorKey(e: unknown): MessageKey {
  const code = e instanceof ApiError ? e.code : 'unknown';
  const key = `error.${code}` as MessageKey;
  return key in en ? key : 'error.unknown';
}
