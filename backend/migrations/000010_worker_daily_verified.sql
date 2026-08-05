-- Migration 000010: Per-server daily verification counter (UTC day)
SET client_min_messages TO WARNING;

ALTER TABLE worker_servers
    ADD COLUMN IF NOT EXISTS emails_verified_today INTEGER NOT NULL DEFAULT 0;

ALTER TABLE worker_servers
    ADD COLUMN IF NOT EXISTS verified_on_date DATE;
