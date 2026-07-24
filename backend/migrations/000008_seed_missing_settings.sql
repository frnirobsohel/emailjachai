-- Migration 000008: Seed missing application settings
-- Adds all settings that were missing from 000004_seed_settings.sql
-- Safe to re-run: uses ON CONFLICT DO NOTHING.

INSERT INTO settings (setting_key, setting_value, created_at, updated_at)
VALUES
    -- Rate limiter: max API requests per user per minute (0 = unlimited)
    ('rate_limit_per_minute',    '60',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Email cache retention policies (days)
    ('b2b_retention',            '30',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('free_valid_retention',     '365',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('free_invalid_retention',   '30',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Public verifier (free one-click checker) settings
    ('public_verifier_enabled',  'true', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('daily_free_limit',         '10',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- License key (leave empty; set from Admin Panel when needed)
    ('license_key',              '',     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

ON CONFLICT (setting_key) DO NOTHING;
