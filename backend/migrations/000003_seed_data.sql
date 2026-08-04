-- Migration 000003: Seed Application Settings
-- Inserts default system settings. Safe to re-run (uses ON CONFLICT DO NOTHING).

SET client_min_messages TO WARNING;

INSERT INTO settings (setting_key, setting_value, created_at, updated_at)
VALUES
    ('max_emails_per_job',       '100000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('max_active_jobs_per_user', '0',      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('chunk_size',                '1000',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('task_timeout_minutes',      '60',     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('task_timeout',              '60',     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default_credits',           '100',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('registration_credits',      '100',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('rate_limit_per_minute',     '60',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('b2b_retention',             '30',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('free_valid_retention',      '365',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('free_invalid_retention',    '30',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('public_verifier_enabled',   'true',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('daily_free_limit',          '10',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('license_key',               '',      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('prepare_concurrency',       '1',     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('worker_concurrency',        '10',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

ON CONFLICT (setting_key) DO NOTHING;
