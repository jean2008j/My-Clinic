import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // Supabase: Project Settings -> Database -> Connection string (session pooler or direct), URI format.
  databaseUrl: process.env.DATABASE_URL ?? '',
  databaseSsl: process.env.DATABASE_SSL !== 'false', // Supabase needs SSL; set false only for a local Postgres
  databasePoolMax: Number(process.env.DATABASE_POOL_MAX ?? 5),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  tz: process.env.CLINIC_TZ ?? 'Europe/Amsterdam',
  isProd: process.env.NODE_ENV === 'production',
  booking: {
    slotStepMin: Number(process.env.SLOT_STEP_MIN ?? 15),          // slot grid (every 15 min)
    minNoticeMin: Number(process.env.MIN_NOTICE_MIN ?? 60),        // can't book less than 1h ahead
    maxAdvanceDays: Number(process.env.MAX_ADVANCE_DAYS ?? 60),    // can't book more than 60 days ahead
    changeCutoffHours: Number(process.env.CHANGE_CUTOFF_HOURS ?? 2), // no edit/cancel within 2h of the visit
    maxUpcomingPerPhone: Number(process.env.MAX_UPCOMING_PER_PHONE ?? 3),
  },
};

if (config.isProd && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('Set a real JWT_SECRET in production');
}
