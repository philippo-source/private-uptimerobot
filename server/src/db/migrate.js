import { config } from "../config.js";
import { initStore } from "./store.js";
import { pool } from "./pool.js";

if (config.dbProvider === "mongodb") {
  await initStore();
  console.log("MongoDB indexes migrated.");
  process.exit(0);
}

const statements = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  `CREATE TABLE IF NOT EXISTS monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    method TEXT NOT NULL DEFAULT 'GET',
    auth_username TEXT,
    auth_password TEXT,
    expected_status INTEGER NOT NULL DEFAULT 200,
    expected_body TEXT,
    interval_seconds INTEGER NOT NULL DEFAULT 60 CHECK (interval_seconds >= 30),
    timeout_seconds INTEGER NOT NULL DEFAULT 10 CHECK (timeout_seconds >= 1),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'up', 'down', 'paused')),
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    last_checked_at TIMESTAMPTZ,
    last_status_code INTEGER,
    last_response_time_ms INTEGER,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE monitors ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE monitors ADD COLUMN IF NOT EXISTS auth_username TEXT`,
  `ALTER TABLE monitors ADD COLUMN IF NOT EXISTS auth_password TEXT`,
  `ALTER TABLE monitors ADD COLUMN IF NOT EXISTS expected_body TEXT`,
  `CREATE TABLE IF NOT EXISTS checks (
    id BIGSERIAL PRIMARY KEY,
    monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('up', 'down')),
    status_code INTEGER,
    response_time_ms INTEGER,
    error TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS checks_monitor_checked_idx ON checks (monitor_id, checked_at DESC)`,
  `CREATE TABLE IF NOT EXISTS incidents (
    id BIGSERIAL PRIMARY KEY,
    monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    root_cause TEXT NOT NULL,
    status_code INTEGER,
    error TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    notification_sent_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS incidents_monitor_started_idx ON incidents (monitor_id, started_at DESC)`,
  `CREATE OR REPLACE FUNCTION touch_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS monitors_touch_updated_at ON monitors`,
  `CREATE TRIGGER monitors_touch_updated_at
    BEFORE UPDATE ON monitors
    FOR EACH ROW
    EXECUTE FUNCTION touch_updated_at()`
];

for (const statement of statements) {
  await pool.query(statement);
}

await pool.end();
console.log("Database migrated.");
