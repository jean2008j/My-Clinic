-- Clinic booking schema (PostgreSQL / Supabase)
-- Everything lives in its own schema "clinic" so it never mixes with other apps in the same database.
-- Dates ('day') are DATE, times ('HH:MM') are TEXT, appointment instants are timestamptz
-- (the server turns them into UTC ISO strings, e.g. '2026-11-10T09:00:00.000Z').

CREATE SCHEMA IF NOT EXISTS clinic;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
SET LOCAL search_path = clinic, extensions, public;

CREATE TABLE IF NOT EXISTS clinic.users (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin','provider')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON clinic.users (lower(email));

CREATE TABLE IF NOT EXISTS clinic.providers (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      integer UNIQUE REFERENCES clinic.users(id) ON DELETE SET NULL,
  name_ar      text NOT NULL,
  name_en      text NOT NULL,
  specialty_ar text NOT NULL DEFAULT '',
  specialty_en text NOT NULL DEFAULT '',
  bio_ar       text NOT NULL DEFAULT '',
  bio_en       text NOT NULL DEFAULT '',
  active       boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS clinic.services (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name_ar        text NOT NULL,
  name_en        text NOT NULL,
  description_ar text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  duration_min   integer NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  active         boolean NOT NULL DEFAULT true
);

-- Which provider offers which service
CREATE TABLE IF NOT EXISTS clinic.provider_services (
  provider_id integer NOT NULL REFERENCES clinic.providers(id) ON DELETE CASCADE,
  service_id  integer NOT NULL REFERENCES clinic.services(id)  ON DELETE CASCADE,
  PRIMARY KEY (provider_id, service_id)
);

-- Weekly schedule in clinic-local time. weekday: 0=Sunday ... 6=Saturday.
-- Several rows per weekday allowed (morning + afternoon blocks).
CREATE TABLE IF NOT EXISTS clinic.working_hours (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id integer NOT NULL REFERENCES clinic.providers(id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  text NOT NULL,
  end_time    text NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS working_hours_provider_idx ON clinic.working_hours(provider_id, weekday);

-- Days off. provider_id NULL = whole clinic closed.
CREATE TABLE IF NOT EXISTS clinic.holidays (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id integer REFERENCES clinic.providers(id) ON DELETE CASCADE,
  day         date NOT NULL,
  reason_ar   text NOT NULL DEFAULT '',
  reason_en   text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS holidays_unique_idx ON clinic.holidays (COALESCE(provider_id, 0), day);

CREATE TABLE IF NOT EXISTS clinic.appointments (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id   integer NOT NULL REFERENCES clinic.providers(id),
  service_id    integer NOT NULL REFERENCES clinic.services(id),
  patient_name  text NOT NULL,
  phone         text NOT NULL,
  email         text,
  notes         text,
  start_at      timestamptz NOT NULL,
  end_at        timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  -- secret token so the patient can view/edit/cancel without an account (32 hex chars)
  manage_token  text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  lang          text NOT NULL DEFAULT 'ar',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  -- Final safety net against double booking: the same provider can never have two
  -- active appointments whose time ranges overlap (any duration).
  CONSTRAINT no_overlap EXCLUDE USING gist (
    provider_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status <> 'cancelled')
);
CREATE INDEX IF NOT EXISTS appointments_start_idx ON clinic.appointments(start_at);
CREATE INDEX IF NOT EXISTS appointments_provider_start_idx ON clinic.appointments(provider_id, start_at);
CREATE INDEX IF NOT EXISTS appointments_phone_idx ON clinic.appointments(phone);

CREATE TABLE IF NOT EXISTS clinic.reviews (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  appointment_id integer NOT NULL UNIQUE REFERENCES clinic.appointments(id) ON DELETE CASCADE,
  provider_id    integer NOT NULL REFERENCES clinic.providers(id),
  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text,
  approved       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_provider_idx ON clinic.reviews(provider_id) WHERE approved;

-- The Express server connects directly with the database owner role (bypasses RLS).
-- RLS stays ON with no policies, so the public Supabase API (anon / authenticated) can never read these tables.
ALTER TABLE clinic.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.providers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.services          ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.provider_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.working_hours     ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.holidays          ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.appointments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.reviews           ENABLE ROW LEVEL SECURITY;
