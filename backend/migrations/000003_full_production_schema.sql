-- Migration 000003: Full Production Schema
-- Creates all missing tables that exist in GORM AutoMigrate models
-- but were absent from 000001_init_schema.sql and 000002_partition_and_indexes.sql.
-- Safe to re-run: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.

-- ============================================================
-- api_keys
-- Stores hashed API keys with prefix lookup support.
-- Columns: key (full hashed key, unique), key_prefix (first chars
-- for fast lookup), api_key (display-safe), deleted_at for soft-delete.
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    key_prefix  VARCHAR(16),
    api_key     VARCHAR(255),
    key         VARCHAR(255) UNIQUE NOT NULL,
    name        VARCHAR(100) DEFAULT 'Default Key',
    status      VARCHAR(20) DEFAULT 'active',   -- active, revoked, expired
    last_used_at TIMESTAMP,
    expires_at  TIMESTAMP,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id    ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_deleted_at ON api_keys (deleted_at);

-- ============================================================
-- transactions
-- Financial / credit transactions per user.
-- transaction_id is a business-level unique reference (e.g. invoice #).
-- external_id stores the gateway's reference.
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    amount         DECIMAL(10,2) NOT NULL,
    credits_added  INTEGER NOT NULL DEFAULT 0,
    payment_method VARCHAR(100) DEFAULT 'manual',
    type           VARCHAR(50) DEFAULT 'purchase',    -- purchase, usage, adjustment
    status         VARCHAR(20) DEFAULT 'completed',   -- completed, failed, pending, refunded
    provider       VARCHAR(50) DEFAULT 'system',
    package        VARCHAR(100),
    description    TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_status     ON transactions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created_at ON transactions (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id         ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type            ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at      ON transactions (created_at);
-- UNIQUE idx_transactions_transaction_id is already covered by the UNIQUE constraint above.

-- ============================================================
-- packages
-- Credit packages available for purchase.
-- ============================================================
CREATE TABLE IF NOT EXISTS packages (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(100),
    tagline        VARCHAR(255),
    credits_amount INTEGER NOT NULL,
    price          DECIMAL(10,2) NOT NULL,
    description    TEXT,
    features       TEXT,       -- JSON string of feature list
    status         VARCHAR(20) DEFAULT 'active',   -- active, inactive
    popular        BOOLEAN DEFAULT FALSE,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_packages_deleted_at ON packages (deleted_at);

-- ============================================================
-- settings
-- Key/value configuration store.  setting_key is unique.
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    id            SERIAL PRIMARY KEY,
    setting_key   VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settings_deleted_at ON settings (deleted_at);

-- ============================================================
-- domains
-- Domain block/allow list used during email verification.
-- Type values: disposable, free, blacklist, spam-trap, whitelist, role.
-- added_by is a nullable FK (NULL = system-inserted).
-- ============================================================
CREATE TABLE IF NOT EXISTS domains (
    id         SERIAL PRIMARY KEY,
    domain     VARCHAR(255) UNIQUE NOT NULL,
    type       VARCHAR(50) NOT NULL DEFAULT 'disposable',  -- disposable, free, blacklist, spam-trap, whitelist, role
    excluded   BOOLEAN NOT NULL DEFAULT FALSE,
    added_by   INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domains_domain_type  ON domains (domain, type);
CREATE INDEX IF NOT EXISTS idx_domains_added_by     ON domains (added_by);
CREATE INDEX IF NOT EXISTS idx_domains_deleted_at   ON domains (deleted_at);

-- ============================================================
-- worker_servers
-- Remote worker nodes that process email verification tasks.
-- ============================================================
CREATE TABLE IF NOT EXISTS worker_servers (
    id              SERIAL PRIMARY KEY,
    server_name     VARCHAR(100) UNIQUE NOT NULL,
    ip_address      VARCHAR(45) NOT NULL,
    port            INTEGER NOT NULL DEFAULT 80,
    auth_token      VARCHAR(255),
    ip_reputation   VARCHAR(20) DEFAULT 'Good',
    rate_limit      INTEGER DEFAULT 100,
    daily_limit     INTEGER DEFAULT 50000,
    worker_count    INTEGER DEFAULT 0,
    emails_verified INTEGER DEFAULT 0,
    last_ping       TIMESTAMP,
    status          VARCHAR(20) DEFAULT 'offline',  -- online, offline, maintenance
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_worker_servers_server_name    ON worker_servers (server_name);
CREATE INDEX IF NOT EXISTS idx_worker_servers_enabled_status ON worker_servers (enabled, status);

-- ============================================================
-- smtp_configs
-- SMTP relay configuration for outbound system emails.
-- ============================================================
CREATE TABLE IF NOT EXISTS smtp_configs (
    id          SERIAL PRIMARY KEY,
    host        VARCHAR(255),
    port        INTEGER DEFAULT 587,
    username    VARCHAR(255),
    password    TEXT,
    encryption  VARCHAR(10) DEFAULT 'tls',   -- none, ssl, tls
    daily_limit INTEGER DEFAULT 5000,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- email_templates
-- Stored HTML/text templates for system-sent emails.
-- template_name is unique and used as the lookup key.
-- ============================================================
CREATE TABLE IF NOT EXISTS email_templates (
    id            SERIAL PRIMARY KEY,
    template_name VARCHAR(100) UNIQUE NOT NULL,
    subject       VARCHAR(255),
    body          TEXT,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_templates_deleted_at ON email_templates (deleted_at);

-- ============================================================
-- activity_logs
-- Audit / event log.  user_id is nullable for system events.
-- event column holds the event type/name.
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_logs (
    id         BIGSERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id),   -- nullable: NULL = system event
    level      VARCHAR(20) DEFAULT 'INFO',     -- INFO, WARN, ERROR
    source     VARCHAR(50) DEFAULT 'System',   -- Admin, Worker, Auth, etc.
    event      VARCHAR(255),
    message    TEXT,
    ip         VARCHAR(45),
    identifier VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created_at      ON activity_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_level_source_created  ON activity_logs (level, source, created_at);

-- ============================================================
-- deleted_job_stats
-- Aggregate stats kept when a job is permanently deleted.
-- Primary key is user_id (one row per user, upsert-friendly).
-- ============================================================
CREATE TABLE IF NOT EXISTS deleted_job_stats (
    user_id              INTEGER PRIMARY KEY REFERENCES users(id),
    total_verifications  BIGINT DEFAULT 0,
    total_jobs           BIGINT DEFAULT 0,
    deliverable          BIGINT DEFAULT 0,
    risky                BIGINT DEFAULT 0,
    undeliverable        BIGINT DEFAULT 0,
    catch_all            BIGINT DEFAULT 0,
    disposable           BIGINT DEFAULT 0,
    invalid_syntax       BIGINT DEFAULT 0,
    role_accounts        BIGINT DEFAULT 0,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- deleted_job_daily_stats
-- Per-user daily activity rolled up from deleted jobs.
-- Composite PK (user_id, activity_date).
-- ============================================================
CREATE TABLE IF NOT EXISTS deleted_job_daily_stats (
    user_id       INTEGER REFERENCES users(id),
    activity_date DATE NOT NULL,
    emails        BIGINT DEFAULT 0,
    jobs          BIGINT DEFAULT 0,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, activity_date)
);

-- ============================================================
-- job_tasks
-- Sub-task chunks spawned for each bulk job.
-- job_id references jobs.job_id (VARCHAR) not jobs.id.
-- ============================================================
CREATE TABLE IF NOT EXISTS job_tasks (
    id            SERIAL PRIMARY KEY,
    job_id        VARCHAR(50) NOT NULL,
    start_index   INTEGER NOT NULL,
    end_index     INTEGER NOT NULL,
    pushed_count  INTEGER NOT NULL DEFAULT 0,
    status        VARCHAR(20) DEFAULT 'queued',       -- queued, processing, completed, failed
    worker_server VARCHAR(100),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_tasks_status_updated_at ON job_tasks (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_job_tasks_job_id_status     ON job_tasks (job_id, status);

-- ============================================================
-- security_logs
-- Security-relevant events (login failures, lockouts, etc.).
-- user_id is NOT NULL per model definition.
-- severity maps to the model's Severity field.
-- module maps to the model's Module field.
-- ============================================================
CREATE TABLE IF NOT EXISTS security_logs (
    id         BIGSERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    severity   VARCHAR(20) NOT NULL,
    module     VARCHAR(50) NOT NULL,
    message    TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_logs_user_id   ON security_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON security_logs (created_at);

-- ============================================================
-- processed_requests
-- Idempotency table: prevents duplicate processing of the same
-- request even under retries or network issues.
-- idempotency_key is a client-supplied unique token.
-- ============================================================
CREATE TABLE IF NOT EXISTS processed_requests (
    id               SERIAL PRIMARY KEY,
    idempotency_key  VARCHAR(255) UNIQUE NOT NULL,
    user_id          INTEGER NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_requests_key
    ON processed_requests (idempotency_key);

-- ============================================================
-- rate_limits
-- DB-fallback rate-limit records.  Used when Redis is unavailable.
-- (user_id, endpoint, created_at) allows sliding-window counting.
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_limits (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    endpoint   VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_id_created_at ON rate_limits (user_id, created_at);

-- ============================================================
-- Additional indexes on the jobs table
-- (job_type column = "type" in DB per GORM tag `gorm:"column:type"`)
-- These supplement the indexes already created in 000002.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_jobs_user_job_type_status
    ON jobs (user_id, type, status);
