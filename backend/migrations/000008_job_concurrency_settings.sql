-- Migration 000008: Job control concurrency settings
SET client_min_messages TO WARNING;

INSERT INTO settings (setting_key, setting_value, created_at, updated_at)
VALUES
    ('prepare_concurrency', '1',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('worker_concurrency',  '10', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (setting_key) DO NOTHING;
