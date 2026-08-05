-- Migration 000009: Worker IP warmup columns + chunk tier settings
-- Safe for existing DBs (IF NOT EXISTS / ON CONFLICT DO NOTHING).
SET client_min_messages TO WARNING;

ALTER TABLE worker_servers
    ADD COLUMN IF NOT EXISTS warmup_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE worker_servers
    ADD COLUMN IF NOT EXISTS warmup_mode VARCHAR(20) NOT NULL DEFAULT 'medium';

INSERT INTO settings (setting_key, setting_value, created_at, updated_at)
VALUES
    ('chunk_tier1_max_list', '50000',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('chunk_tier1_size',     '100',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('chunk_tier1_timeout',  '15',     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('chunk_tier2_max_list', '100000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('chunk_tier2_size',     '500',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('chunk_tier2_timeout',  '60',     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('chunk_tier3_max_list', '500000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('chunk_tier3_size',     '1000',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('chunk_tier3_timeout',  '120',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (setting_key) DO NOTHING;
