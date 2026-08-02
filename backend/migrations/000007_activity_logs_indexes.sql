-- Migration 000007: activity_logs list + login-throttle indexes
-- Safe to re-run (IF NOT EXISTS).

SET client_min_messages TO WARNING;

-- Primary admin Log View sort: ORDER BY created_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at_id
    ON activity_logs (created_at DESC, id DESC);

-- Auth failed-login throttle: source/event + time window, filtered by ip/identifier
CREATE INDEX IF NOT EXISTS idx_activity_logs_auth_failed
    ON activity_logs (created_at DESC)
    WHERE source = 'Auth' AND event = 'Login Failed';

CREATE INDEX IF NOT EXISTS idx_activity_logs_auth_failed_ip
    ON activity_logs (ip, created_at DESC)
    WHERE source = 'Auth' AND event = 'Login Failed';

CREATE INDEX IF NOT EXISTS idx_activity_logs_auth_failed_identifier
    ON activity_logs (identifier, created_at DESC)
    WHERE source = 'Auth' AND event = 'Login Failed';
