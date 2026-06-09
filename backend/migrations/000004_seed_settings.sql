-- Migration 000004: Seed Default Settings
-- Inserts application-level default settings into the settings table.
-- Uses ON CONFLICT DO NOTHING so re-running this migration is completely
-- safe and will never overwrite values already customised by the operator.

INSERT INTO settings (setting_key, setting_value, created_at, updated_at)
VALUES
    -- Maximum number of email addresses allowed per verification job.
    ('max_emails_per_job',      '100000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Maximum number of jobs a single user may have in an active
    -- (pending / processing) state at the same time.
    -- 0 = unlimited.
    ('max_active_jobs_per_user', '0',     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Number of email addresses bundled into a single Asynq task chunk.
    ('chunk_size',               '1000',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- How many minutes a task may run before it is considered timed-out.
    ('task_timeout_minutes',     '60',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Legacy alias kept for backwards-compatibility with older worker code.
    ('task_timeout',             '60',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Credits awarded to every new user on sign-up.
    ('default_credits',          '100',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Alias used in registration flows (same value, separate key so
    -- either name can be looked up without ambiguity).
    ('registration_credits',     '100',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

ON CONFLICT (setting_key) DO NOTHING;
