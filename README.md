# Clinic Booking — نظام حجز مواعيد العيادة

Full-stack: React + TypeScript (client) · Node/Express + TypeScript (server) · PostgreSQL on Supabase (schema `clinic`).
Arabic (RTL) + English (LTR). Free bookings, on-screen confirmation.

## Build progress
- [x] Batch 1 — project skeleton, database schema, server base, login
- [x] Batch 2 — booking API (slots, create/edit/cancel, double-booking protection, holidays)
- [x] Batch 3 — React app foundation, i18n (ar/en), RTL, staff login
- [x] Batch 4 — booking pages (4-step wizard), manage/cancel/reschedule by secret link
- [x] Batch 5 — admin dashboard (monthly calendar, statistics, days off, appointment status)
- [x] Batch 6 — doctor panel, patient reviews (admin-approved), final run guide

## Database (Supabase)
All tables live in their own Postgres schema, **`clinic`**, so they never mix with anything else in the same Supabase project. Row Level Security is ON with no policies: the public Supabase API can't read these tables, only this server can (it connects directly with `DATABASE_URL`).

1. Supabase dashboard → **Connect** → copy the **Session pooler** URI (works on IPv4 hosts such as Render). Put it in `server/.env` as `DATABASE_URL` with your database password.
   Use *Session pooler* or *Direct connection* — **not** the *Transaction pooler* (port 6543).
2. `npm run db:migrate` creates / updates the schema, `npm run db:seed` adds demo data.
3. `npm run db:reset` **drops the whole `clinic` schema** (all bookings!) and rebuilds it.

## Quick start
Requirements: Node.js 22.13 or newer and a Supabase project (see *Database (Supabase)* below).
```bash
cd server
copy .env.example .env          # Windows  (Mac/Linux: cp .env.example .env)  -> then fill in DATABASE_URL
npm install
npm run db:migrate              # creates the `clinic` schema (safe to re-run)
npm run db:seed                 # demo doctors / services / hours + the 3 seed accounts
npm run dev                     # http://localhost:4000/api/health
```

Run the website (second terminal, server must be running):
```bash
cd client
npm install
npm run dev                     # http://localhost:5173
```
You should see the home page with the clinic services and doctors, an Arabic/English switch (the whole layout flips RTL/LTR), and a working staff login (use the seed accounts below). Booking (`/book`) and manage-your-booking (`/manage`) work now; the admin dashboard (`/admin`) works; the doctor panel is a placeholder until batch 6.

Test the whole booking API (server must be running in another window):
```bash
cd server
npm run test:api
```

Test login:
```bash
curl -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@clinic.local","password":"Admin12345"}'
```

Seed accounts (change before going live):
| Role | Email | Password |
|---|---|---|
| Admin | admin@clinic.local | Admin12345 |
| Provider | dr.sara@clinic.local | Doctor12345 |
| Provider | dr.omar@clinic.local | Doctor12345 |

## API (batch 2)

Public (no login) — base `/api/public`
| Method | Path | What it does |
|---|---|---|
| GET | `/services` | active services with duration |
| GET | `/providers?serviceId=` | active doctors (+ the services each offers) |
| GET | `/holidays` | upcoming days off (clinic-wide or per doctor) |
| GET | `/availability?providerId=&serviceId=&month=2026-11` | per-day free slot count for a calendar |
| GET | `/slots?providerId=&serviceId=&date=2026-11-10` | free start times of one day (optional `&token=` keeps the patient's own time free while rescheduling; `/availability` accepts it too) |
| POST | `/appointments` | book: `providerId, serviceId, start, patientName, phone, email?, notes?, lang?` |
| GET | `/appointments/:token` | view a booking with its secret token |
| PATCH | `/appointments/:token` | change time (`start`) and/or contact details |
| POST | `/appointments/:token/cancel` | cancel |

Admin (Bearer token of the admin) — base `/api/admin`
| Method | Path | What it does |
|---|---|---|
| GET | `/holidays` | upcoming holidays |
| POST | `/holidays` | `day, providerId?` (omit = whole clinic), `reasonAr?, reasonEn?` — returns how many bookings fall on that day |
| DELETE | `/holidays/:id` | remove a holiday |
| GET | `/appointments?from=&to=&providerId=&status=` | list bookings |
| PATCH | `/appointments/:id` | `{status}` → completed / no_show / cancelled / confirmed (a cancelled booking can't be re-opened) |
| GET | `/stats?from=&to=&providerId?` | totals by status, busiest weekday/hour, by service, by doctor |

Errors: `slot_unavailable` (409), `too_many_bookings` (409), `cannot_modify` (403, less than 2h before the visit), `already_cancelled` (409), `too_many_requests` (429), `validation_error` (400).

Booking rules live in `server/.env` (all optional): `SLOT_STEP_MIN=15`, `MIN_NOTICE_MIN=60`, `MAX_ADVANCE_DAYS=60`, `CHANGE_CUTOFF_HOURS=2`, `MAX_UPCOMING_PER_PHONE=3`.

How double booking is prevented: every booking re-computes the free slots inside a transaction guarded by a Postgres advisory lock, so two people can't take the same time, and overlap is checked by real start/end times (a 90-min root canal blocks the 30-min slots inside it). A database exclusion constraint (`no_overlap`, on provider + time range) is the final safety net: even a bug can't store two overlapping active bookings for one doctor.

## Client (batch 3)
`client/src`: `i18n/` (en.ts is the source, ar.ts must have the same keys, TypeScript enforces it) · `lib/api.ts` (fetch wrapper + types) · `auth/` (login, saved session, role guard) · `components/` (layout, protected route) · `pages/` · `styles.css` (CSS logical properties, so RTL needs no extra rules).
Dev server proxies `/api` to `localhost:4000`. Times are shown in the clinic time zone (`CLINIC_TZ` in `i18n/index.tsx`).

## Booking pages (batch 4)
- `/book`: service → doctor → calendar + free times → your details → on-screen confirmation with a private link.
- `/manage/<token>`: view, change time, edit contact details, cancel (the server blocks changes less than 2h before the visit). `/manage` accepts a pasted link/code and lists bookings made on this device.
- Calendar shows free days from `/availability`; times come from `/slots`. If someone takes the time first, the page tells the visitor and reloads the free times.

## Admin dashboard (batch 5)
Log in as admin → `/admin`:
- **Calendar**: month grid with the number of active bookings per day (days off are hatched); click a day for the list with phone (tap to call), service, doctor, notes; mark *completed* / *no-show*, cancel (with confirmation) or move back to *confirmed*. Filter by doctor.
- **Statistics**: last 30 / next 30 days, this month, last 90 days; totals by status, cancellation rate, busiest weekday and hour, bookings per service and per doctor.
- **Days off**: add a day off for the whole clinic or one doctor. If bookings already exist that day you are told how many (they are not cancelled automatically).
Run `npm run test:api` (server folder, server running) to check all of this end to end.

## Doctor panel and reviews (batch 6)
- **Doctor** (`dr.sara@clinic.local` / `Doctor12345`) → `/provider`: own schedule day by day (arrows or date picker), mark visits *completed* / *no-show* (or undo), tap a phone to call; second tab shows own reviews, average and how many wait for approval. A doctor only ever sees and changes their own data. Cancelling stays with the admin.
- **Patients** can review a *completed* visit once, from their booking link (`/manage/<token>`): 1-5 stars + optional comment.
- **Admin** → `/admin` → *Reviews*: approve, hide or delete. Only approved reviews are public: the home page shows the average next to each doctor and the latest comments (first name only).

## Run everything — step by step (Windows)
Requirements: Node.js 22.13+ (check with `node -v`) and your Supabase `DATABASE_URL` in `server/.env`.

**A. Development (two windows)**
```bat
:: window 1 — server
cd server
copy .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
:: window 2 — website
cd client
npm install
npm run dev
```
Open http://localhost:5173 . Check the server with `cd server && npm run test:api` (checks the whole API; needs the server running).

**B. One server for everything (like a real deployment)**
```bat
cd client
npm install
npm run build
cd ..\server
npm install
npm run build
```
Then put these in `server/.env`:
```
NODE_ENV=production
JWT_SECRET=<a long random text, 40+ characters>
CLINIC_TZ=Europe/Amsterdam
```
and run `npm start` from the `server` folder → open http://localhost:4000 (the server also serves the built website, so there is no second port and no CORS).

**Before real patients use it**
1. Change the three seed passwords: `npm run user:password -- admin@clinic.local "your new password"` (same for each doctor).
2. Set a real `JWT_SECRET` (the server refuses to start in production without one).
3. Put it behind HTTPS (a host such as Render/Railway/a VPS with Caddy or nginx).
4. Backups: Supabase takes them for you on paid plans; on the free plan export the `clinic` schema regularly (`pg_dump --schema=clinic`).
5. Booking is free and anonymous, protected by rate limits (10 bookings/hour/IP) and a cap on upcoming bookings per phone number. There are no SMS/e-mail reminders yet: patients keep their private link.

**Known limits / easy next steps**
- Doctors, services and weekly working hours are edited in `server/src/seed.ts` (then `npm run db:reset`, which also erases bookings) or directly in the database. An admin screen for this is not built yet.
- Notifications (e-mail / WhatsApp / SMS) need an outside service and are not included.
- The clinic time zone is `CLINIC_TZ` (server) and `CLINIC_TZ` in `client/src/i18n/index.tsx`: keep both equal.

## Deploy (Render)
`render.yaml` in the repo root describes one web service: it builds the website and the server, and the server serves both (one address, no CORS).
1. Push this repo to GitHub, then on https://render.com → **New → Blueprint** → pick the repo.
2. When asked, set `DATABASE_URL` (the Supabase *Session pooler* URI). `JWT_SECRET` is generated for you; `CLINIC_TZ` defaults to `Europe/Amsterdam` — change it in `render.yaml` **and** in `client/src/i18n/index.tsx` (keep both equal).
3. After the first deploy open `https://<your-service>.onrender.com/api/health` — it should answer `{"ok":true,...}`.
4. Change the seed passwords (run locally with the production `DATABASE_URL`): `npm run user:password -- admin@clinic.local "a long new password"`.
Render's free plan puts the service to sleep after ~15 minutes without traffic (the first visit then takes ~30 s). A paid instance stays awake.
