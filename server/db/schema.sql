-- Clinic booking schema (SQLite)
-- Dates are stored as 'YYYY-MM-DD', times as 'HH:MM',
-- and appointment instants as UTC ISO strings ('2026-11-10T09:00:00.000Z').

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','provider')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS providers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name_ar      TEXT NOT NULL,
  name_en      TEXT NOT NULL,
  specialty_ar TEXT NOT NULL DEFAULT '',
  specialty_en TEXT NOT NULL DEFAULT '',
  bio_ar       TEXT NOT NULL DEFAULT '',
  bio_en       TEXT NOT NULL DEFAULT '',
  active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS services (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  description_ar TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  duration_min   INTEGER NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  active         INTEGER NOT NULL DEFAULT 1
);

-- Which provider offers which service
CREATE TABLE IF NOT EXISTS provider_services (
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  service_id  INTEGER NOT NULL REFERENCES services(id)  ON DELETE CASCADE,
  PRIMARY KEY (provider_id, service_id)
);

-- Weekly schedule in clinic-local time. weekday: 0=Sunday ... 6=Saturday.
-- Several rows per weekday allowed (morning + afternoon blocks).
CREATE TABLE IF NOT EXISTS working_hours (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS working_hours_provider_idx ON working_hours(provider_id, weekday);

-- Days off. provider_id NULL = whole clinic closed.
CREATE TABLE IF NOT EXISTS holidays (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER REFERENCES providers(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  reason_ar   TEXT NOT NULL DEFAULT '',
  reason_en   TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS holidays_unique_idx ON holidays(COALESCE(provider_id, 0), day);

CREATE TABLE IF NOT EXISTS appointments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id   INTEGER NOT NULL REFERENCES providers(id),
  service_id    INTEGER NOT NULL REFERENCES services(id),
  patient_name  TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT,
  notes         TEXT,
  start_at      TEXT NOT NULL,
  end_at        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  -- secret token so the patient can view/edit/cancel without an account
  manage_token  TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  lang          TEXT NOT NULL DEFAULT 'ar',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS appointments_start_idx ON appointments(start_at);
CREATE INDEX IF NOT EXISTS appointments_provider_start_idx ON appointments(provider_id, start_at);
-- Safety net against double booking: same provider can't have two active
-- appointments starting at the exact same instant. Overlap checks for
-- different durations are done inside a transaction in the booking API.
CREATE UNIQUE INDEX IF NOT EXISTS no_same_start_idx
  ON appointments(provider_id, start_at) WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS reviews (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  provider_id    INTEGER NOT NULL REFERENCES providers(id),
  rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT,
  approved       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS reviews_provider_idx ON reviews(provider_id) WHERE approved = 1;
