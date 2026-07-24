-- Migration 000007: Add missing production tables
-- Creates public_verify_logs, blocked_clients, and email_caches tables
-- which were missing in production explicit SQL migrations.

CREATE TABLE IF NOT EXISTS public_verify_logs (
    id          BIGSERIAL PRIMARY KEY,
    email       VARCHAR(255) NOT NULL,
    ip          VARCHAR(45) NOT NULL,
    cookie_id   VARCHAR(100) NOT NULL,
    browser     VARCHAR(255),
    status      VARCHAR(50) NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_public_verify_logs_ip         ON public_verify_logs (ip);
CREATE INDEX IF NOT EXISTS idx_public_verify_logs_cookie_id  ON public_verify_logs (cookie_id);
CREATE INDEX IF NOT EXISTS idx_public_verify_logs_deleted_at ON public_verify_logs (deleted_at);
CREATE INDEX IF NOT EXISTS idx_public_verify_logs_created_at ON public_verify_logs (created_at);

CREATE TABLE IF NOT EXISTS blocked_clients (
    id          BIGSERIAL PRIMARY KEY,
    value       VARCHAR(100) NOT NULL,
    type        VARCHAR(20) NOT NULL,
    block_type  VARCHAR(20) NOT NULL,
    reason      VARCHAR(255),
    blocked_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blocked_clients_value      ON blocked_clients (value);
CREATE INDEX IF NOT EXISTS idx_blocked_clients_deleted_at ON blocked_clients (deleted_at);

CREATE TABLE IF NOT EXISTS email_caches (
    email            VARCHAR(255) PRIMARY KEY,
    status           VARCHAR(50) NOT NULL,
    score            INTEGER DEFAULT 0,
    reason           VARCHAR(100),
    is_disposable    BOOLEAN DEFAULT FALSE,
    is_free          BOOLEAN DEFAULT FALSE,
    is_role          BOOLEAN DEFAULT FALSE,
    has_mx           BOOLEAN DEFAULT FALSE,
    mx_records       TEXT,
    smtp_connect     BOOLEAN DEFAULT FALSE,
    user_exists      BOOLEAN DEFAULT FALSE,
    is_catch_all      BOOLEAN DEFAULT FALSE,
    is_deliverable   BOOLEAN DEFAULT FALSE,
    is_syntax_valid   BOOLEAN DEFAULT FALSE,
    is_spam_trap      BOOLEAN DEFAULT FALSE,
    is_blacklisted   BOOLEAN DEFAULT FALSE,
    mailbox_full     BOOLEAN DEFAULT FALSE,
    processing_time  DECIMAL(10,3),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_caches_status     ON email_caches (status);
CREATE INDEX IF NOT EXISTS idx_email_caches_created_at ON email_caches (created_at);
