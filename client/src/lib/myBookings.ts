// Remembers booking tokens on this device only, so the visitor can find the booking again.
const KEY = 'clinic.bookings';
const MAX = 10;

export function savedTokens(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export function saveToken(token: string) {
  try {
    const list = [token, ...savedTokens().filter((t) => t !== token)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* storage blocked: ignore */ }
}
