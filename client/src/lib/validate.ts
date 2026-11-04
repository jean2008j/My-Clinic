// Same rules as the server, so the visitor gets the message before sending.
const normalizeDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
   .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

export const isValidPhone = (s: string) => /^\+?[0-9]{6,15}$/.test(normalizeDigits(s).trim().replace(/[\s\-()]/g, ''));
export const isValidEmail = (s: string) => s.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
