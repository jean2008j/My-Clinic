// Thin fetch wrapper. All server errors arrive as { error: 'code' } and become ApiError(code).

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

const TOKEN_KEY = 'clinic.token';

export const tokenStore = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* ignore */ }
  },
};

// Called when the server says the session is no longer valid (expired token).
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (init.auth && token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : 'unknown';
    if (init.auth && res.status === 401 && code !== 'invalid_credentials') onUnauthorized?.();
    throw new ApiError(res.status, code);
  }
  return data as T;
}

// ---------- types shared with the server (batch 2 responses) ----------

export interface Service {
  id: number;
  name_ar: string; name_en: string;
  description_ar: string; description_en: string;
  duration_min: number;
}

export interface Provider {
  id: number;
  name_ar: string; name_en: string;
  specialty_ar: string; specialty_en: string;
  bio_ar: string; bio_en: string;
  serviceIds: number[];
  ratingAvg: number | null;
  ratingCount: number;
}

export type Role = 'admin' | 'provider';
export interface AuthUser { id: number; role: Role; providerId: number | null }

export interface Slot { start: string; end: string; time: string }
export interface DayAvail { date: string; slots: number; holiday: boolean }
export type AppointmentStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';

export interface Appointment {
  id: number;
  manageToken: string;
  status: AppointmentStatus;
  startAt: string;
  endAt: string;
  provider: { id: number; nameAr: string; nameEn: string };
  service: { id: number; nameAr: string; nameEn: string; durationMin: number };
  patient: { name: string; phone: string; email: string | null; notes: string | null };
  lang: 'ar' | 'en';
  canModify: boolean;
  review: { rating: number; comment: string | null } | null;
  canReview: boolean;
}

export interface PatientInput { patientName: string; phone: string; email?: string; notes?: string }
export interface BookingInput extends PatientInput { providerId: number; serviceId: number; start: string; lang: 'ar' | 'en' }

export interface PublicReview {
  id: number; rating: number; comment: string | null; createdAt: string; name: string;
  provider: { id: number; nameAr: string; nameEn: string };
}

export const publicApi = {
  services: () => api<{ services: Service[] }>('/public/services').then((r) => r.services),
  providers: (serviceId?: number) =>
    api<{ providers: Provider[] }>(`/public/providers${serviceId ? `?serviceId=${serviceId}` : ''}`).then((r) => r.providers),
  /** `token` = the patient's own booking, so its current time still counts as free while rescheduling */
  availability: (providerId: number, serviceId: number, month: string, token?: string) =>
    api<{ days: DayAvail[] }>(`/public/availability?providerId=${providerId}&serviceId=${serviceId}&month=${month}${token ? `&token=${token}` : ''}`).then((r) => r.days),
  slots: (providerId: number, serviceId: number, date: string, token?: string) =>
    api<{ slots: Slot[] }>(`/public/slots?providerId=${providerId}&serviceId=${serviceId}&date=${date}${token ? `&token=${token}` : ''}`).then((r) => r.slots),
  holidays: () => api<{ holidays: Holiday[] }>('/public/holidays').then((r) => r.holidays),
  reviews: (limit = 12) => api<{ reviews: PublicReview[] }>(`/public/reviews?limit=${limit}`).then((r) => r.reviews),
  review: (token: string, body: { rating: number; comment?: string }) =>
    api<{ appointment: Appointment }>(`/public/appointments/${token}/review`, { method: 'POST', body }).then((r) => r.appointment),
  book: (body: BookingInput) =>
    api<{ appointment: Appointment }>('/public/appointments', { method: 'POST', body }).then((r) => r.appointment),
  getBooking: (token: string) =>
    api<{ appointment: Appointment }>(`/public/appointments/${token}`).then((r) => r.appointment),
  updateBooking: (token: string, body: Partial<PatientInput> & { start?: string }) =>
    api<{ appointment: Appointment }>(`/public/appointments/${token}`, { method: 'PATCH', body }).then((r) => r.appointment),
  cancelBooking: (token: string) =>
    api<{ appointment: Appointment }>(`/public/appointments/${token}/cancel`, { method: 'POST', body: {} }).then((r) => r.appointment),
};

export const authApi = {
  login: (email: string, password: string) =>
    api<{ token: string; user: AuthUser }>('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => api<{ user: AuthUser }>('/auth/me', { auth: true }).then((r) => r.user),
};

// ---------- admin (needs the admin login) ----------

export interface Holiday { id: number; provider_id: number | null; day: string; reason_ar: string; reason_en: string }

export interface AdminAppointment {
  id: number;
  status: AppointmentStatus;
  start_at: string;
  end_at: string;
  patient_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  lang: 'ar' | 'en';
  provider_id: number;
  provider_name_en: string; provider_name_ar: string;
  service_id: number;
  service_name_en: string; service_name_ar: string;
  duration_min: number;
}

interface CountRow { id: number; nameAr: string; nameEn: string; count: number }
export interface Stats {
  range: { from: string; to: string };
  totals: { total: number; confirmed: number; completed: number; cancelled: number; noShow: number };
  byWeekday: number[]; // 0 = Sunday
  byHour: number[];    // 0..23
  byService: CountRow[];
  byProvider: CountRow[];
  byDay: { date: string; count: number }[];
}

const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

export const adminApi = {
  appointments: (p: { from: string; to: string; providerId?: number }) =>
    api<{ appointments: AdminAppointment[] }>(`/admin/appointments?${qs(p)}`, { auth: true }).then((r) => r.appointments),
  setStatus: (id: number, status: AppointmentStatus) =>
    api<{ appointment: { id: number; status: AppointmentStatus } }>(`/admin/appointments/${id}`, { method: 'PATCH', body: { status }, auth: true }),
  stats: (p: { from: string; to: string; providerId?: number }) =>
    api<Stats>(`/admin/stats?${qs(p)}`, { auth: true }),
  holidays: () => api<{ holidays: Holiday[] }>('/admin/holidays', { auth: true }).then((r) => r.holidays),
  addHoliday: (b: { day: string; providerId: number | null; reasonAr: string; reasonEn: string }) =>
    api<{ affectedAppointments: number }>('/admin/holidays', { method: 'POST', body: b, auth: true }),
  deleteHoliday: (id: number) => api<{ ok: true }>(`/admin/holidays/${id}`, { method: 'DELETE', auth: true }),
};

export interface AdminReview {
  id: number; rating: number; comment: string | null; approved: boolean; createdAt: string; startAt: string;
  patientName: string;
  provider: { nameAr: string; nameEn: string };
  service: { nameAr: string; nameEn: string };
}

export const adminReviewsApi = {
  list: (status: 'pending' | 'approved' | 'all') =>
    api<{ reviews: AdminReview[] }>(`/admin/reviews?status=${status}`, { auth: true }).then((r) => r.reviews),
  setApproved: (id: number, approved: boolean) =>
    api<{ review: { id: number; approved: boolean } }>(`/admin/reviews/${id}`, { method: 'PATCH', body: { approved }, auth: true }),
  remove: (id: number) => api<{ ok: true }>(`/admin/reviews/${id}`, { method: 'DELETE', auth: true }),
};

// ---------- doctor panel (needs the doctor login) ----------

export interface DoctorReview {
  id: number; rating: number; comment: string | null; approved: boolean; createdAt: string; startAt: string;
  name: string; service: { nameAr: string; nameEn: string };
}
export interface Rating { avg: number | null; count: number }

export const providerApi = {
  me: () => api<{ provider: { id: number; name_ar: string; name_en: string; specialty_ar: string; specialty_en: string }; rating: Rating }>('/provider/me', { auth: true }),
  appointments: (day: string) =>
    api<{ appointments: AdminAppointment[] }>(`/provider/appointments?from=${day}&to=${day}`, { auth: true }).then((r) => r.appointments),
  setStatus: (id: number, status: 'confirmed' | 'completed' | 'no_show') =>
    api<{ appointment: { id: number; status: AppointmentStatus } }>(`/provider/appointments/${id}`, { method: 'PATCH', body: { status }, auth: true }),
  reviews: () => api<{ rating: Rating; pending: number; reviews: DoctorReview[] }>('/provider/reviews', { auth: true }),
};
