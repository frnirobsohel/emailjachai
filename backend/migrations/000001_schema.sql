-- Migration 000001: Consolidated Database Schema
-- Defines all core tables, columns, constraints, and indexes for EmailJachai-Pro.
-- Safe for fresh installs and existing production databases (uses IF NOT EXISTS).

-- 1. users
CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    email          VARCHAR(255) UNIQUE NOT NULL,
    password       VARCHAR(255) NOT NULL,
    role           VARCHAR(20) DEFAULT 'user',      -- admin, manager, reseller, user, demo
    credits        BIGINT DEFAULT 0,
    status         VARCHAR(20) DEFAULT 'Active',    -- Active, Suspended
    webhook_url    VARCHAR(255),
    webhook_secret VARCHAR(255),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at);

-- 2. api_keys
CREATE TABLE IF NOT EXISTS api_keys (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    key_prefix   VARCHAR(16),
    api_key      VARCHAR(255),
    key          VARCHAR(255) UNIQUE NOT NULL,
    name         VARCHAR(100) DEFAULT 'Default Key',
    status       VARCHAR(20) DEFAULT 'active',      -- active, revoked, expired
    last_used_at TIMESTAMP,
    expires_at   TIMESTAMP,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id    ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_deleted_at ON api_keys (deleted_at);

-- 3. jobs
CREATE TABLE IF NOT EXISTS jobs (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER REFERENCES users(id),
    job_id           VARCHAR(50) UNIQUE NOT NULL,
    email            VARCHAR(255),
    filename         VARCHAR(255),
    file_url         VARCHAR(255),
    result_file_path VARCHAR(512),
    type             VARCHAR(20) DEFAULT 'bulk',    -- bulk, single
    status           VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    total_emails     INTEGER DEFAULT 0,
    processed_count  INTEGER DEFAULT 0,
    api_key_id       INTEGER,
    deliverable      INTEGER DEFAULT 0,
    risky            INTEGER DEFAULT 0,
    undeliverable    INTEGER DEFAULT 0,
    catch_all        INTEGER DEFAULT 0,
    invalid_syntax   INTEGER DEFAULT 0,
    role_accounts    INTEGER DEFAULT 0,
    disposable       INTEGER DEFAULT 0,
    verified_count   INTEGER DEFAULT 0,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id             ON jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at          ON jobs (created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status              ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_user_status         ON jobs (user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_type                ON jobs (type);
CREATE INDEX IF NOT EXISTS idx_jobs_api_key_id          ON jobs (api_key_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_job_type_status ON jobs (user_id, type, status);

-- 4. job_results (Partitioned Root Table)
CREATE TABLE IF NOT EXISTS job_results (
    id              BIGSERIAL,
    job_internal_id INTEGER NOT NULL REFERENCES jobs(id),
    email           VARCHAR(255) NOT NULL,
    status          VARCHAR(50) NOT NULL,
    score           INTEGER DEFAULT 0,
    reason          VARCHAR(255),
    processing_time FLOAT DEFAULT 0,
    is_deliverable  BOOLEAN DEFAULT false,
    is_catch_all     BOOLEAN DEFAULT false,
    is_disposable   BOOLEAN DEFAULT false,
    is_free         BOOLEAN DEFAULT false,
    is_role         BOOLEAN DEFAULT false,
    has_mx          BOOLEAN DEFAULT false,
    mx_records      TEXT,
    smtp_connect    BOOLEAN DEFAULT false,
    user_exists     BOOLEAN DEFAULT false,
    is_syntax_valid  BOOLEAN DEFAULT true,
    is_spam_trap     BOOLEAN DEFAULT false,
    is_blacklisted  BOOLEAN DEFAULT false,
    mailbox_full    BOOLEAN DEFAULT false,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_job_results_job_internal_id ON job_results (job_internal_id);
CREATE INDEX IF NOT EXISTS idx_job_results_email           ON job_results (email);
CREATE INDEX IF NOT EXISTS idx_job_results_status          ON job_results (status);
CREATE INDEX IF NOT EXISTS idx_job_results_created_at      ON job_results (created_at);
CREATE INDEX IF NOT EXISTS idx_job_results_job_status      ON job_results (job_internal_id, status);

-- 5. transactions
CREATE TABLE IF NOT EXISTS transactions (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    external_id    VARCHAR(255),
    amount         DECIMAL(10,2) NOT NULL,
    credits_added  INTEGER NOT NULL DEFAULT 0,
    payment_method VARCHAR(100) DEFAULT 'manual',
    type           VARCHAR(50) DEFAULT 'purchase',   -- purchase, usage, adjustment
    status         VARCHAR(20) DEFAULT 'completed',  -- completed, failed, pending, refunded
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions (external_id) WHERE external_id IS NOT NULL AND external_id <> '';

-- 6. packages
CREATE TABLE IF NOT EXISTS packages (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(100),
    tagline        VARCHAR(255),
    credits_amount INTEGER NOT NULL,
    price          DECIMAL(10,2) NOT NULL,
    description    TEXT,
    features       TEXT,
    status         VARCHAR(20) DEFAULT 'active',     -- active, inactive
    popular        BOOLEAN DEFAULT FALSE,
    is_public      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_packages_deleted_at ON packages (deleted_at);
CREATE INDEX IF NOT EXISTS idx_packages_is_public ON packages (is_public);

-- 7. settings
CREATE TABLE IF NOT EXISTS settings (
    id          SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settings_deleted_at ON settings (deleted_at);

-- 8. domains
CREATE TABLE IF NOT EXISTS domains (
    id         SERIAL PRIMARY KEY,
    domain     VARCHAR(255) UNIQUE NOT NULL,
    type       VARCHAR(50) NOT NULL DEFAULT 'disposable', -- disposable, free, blacklist, spam-trap, whitelist, role
    excluded   BOOLEAN NOT NULL DEFAULT FALSE,
    added_by   INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domains_domain_type  ON domains (domain, type);
CREATE INDEX IF NOT EXISTS idx_domains_added_by     ON domains (added_by);
CREATE INDEX IF NOT EXISTS idx_domains_deleted_at   ON domains (deleted_at);

-- 9. worker_servers
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
    status          VARCHAR(20) DEFAULT 'offline',    -- online, offline, maintenance
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_worker_servers_server_name    ON worker_servers (server_name);
CREATE INDEX IF NOT EXISTS idx_worker_servers_enabled_status ON worker_servers (enabled, status);

-- 10. smtp_configs
CREATE TABLE IF NOT EXISTS smtp_configs (
    id          SERIAL PRIMARY KEY,
    host        VARCHAR(255),
    port        INTEGER DEFAULT 587,
    username    VARCHAR(255),
    password    TEXT,
    encryption  VARCHAR(10) DEFAULT 'tls',            -- none, ssl, tls
    daily_limit INTEGER DEFAULT 5000,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. email_templates
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

-- 12. activity_logs
CREATE TABLE IF NOT EXISTS activity_logs (
    id         BIGSERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id),
    level      VARCHAR(20) DEFAULT 'INFO',           -- INFO, WARN, ERROR
    source     VARCHAR(50) DEFAULT 'System',         -- Admin, Worker, Auth, etc.
    event      VARCHAR(255),
    message    TEXT,
    ip         VARCHAR(45),
    identifier VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created_at     ON activity_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_level_source_created ON activity_logs (level, source, created_at);

-- 13. deleted_job_stats
CREATE TABLE IF NOT EXISTS deleted_job_stats (
    user_id             INTEGER PRIMARY KEY REFERENCES users(id),
    total_verifications BIGINT DEFAULT 0,
    total_jobs          BIGINT DEFAULT 0,
    deliverable         BIGINT DEFAULT 0,
    risky               BIGINT DEFAULT 0,
    undeliverable       BIGINT DEFAULT 0,
    catch_all           BIGINT DEFAULT 0,
    disposable          BIGINT DEFAULT 0,
    invalid_syntax      BIGINT DEFAULT 0,
    role_accounts       BIGINT DEFAULT 0,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. deleted_job_daily_stats
CREATE TABLE IF NOT EXISTS deleted_job_daily_stats (
    user_id       INTEGER REFERENCES users(id),
    activity_date DATE NOT NULL,
    emails        BIGINT DEFAULT 0,
    jobs          BIGINT DEFAULT 0,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, activity_date)
);

-- 15. job_tasks
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

-- 16. security_logs
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

-- 17. processed_requests
CREATE TABLE IF NOT EXISTS processed_requests (
    id              SERIAL PRIMARY KEY,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    user_id         INTEGER NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_requests_key ON processed_requests (idempotency_key);

-- 18. rate_limits
CREATE TABLE IF NOT EXISTS rate_limits (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    endpoint   VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_id_created_at ON rate_limits (user_id, created_at);

-- 19. public_verify_logs
CREATE TABLE IF NOT EXISTS public_verify_logs (
    id         BIGSERIAL PRIMARY KEY,
    email      VARCHAR(255) NOT NULL,
    ip         VARCHAR(45) NOT NULL,
    cookie_id  VARCHAR(100) NOT NULL,
    browser    VARCHAR(255),
    status     VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_public_verify_logs_ip         ON public_verify_logs (ip);
CREATE INDEX IF NOT EXISTS idx_public_verify_logs_cookie_id  ON public_verify_logs (cookie_id);
CREATE INDEX IF NOT EXISTS idx_public_verify_logs_deleted_at ON public_verify_logs (deleted_at);
CREATE INDEX IF NOT EXISTS idx_public_verify_logs_created_at ON public_verify_logs (created_at);

-- 20. blocked_clients
CREATE TABLE IF NOT EXISTS blocked_clients (
    id         BIGSERIAL PRIMARY KEY,
    value      VARCHAR(100) NOT NULL,
    type       VARCHAR(20) NOT NULL,
    block_type VARCHAR(20) NOT NULL,
    reason     VARCHAR(255),
    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blocked_clients_value      ON blocked_clients (value);
CREATE INDEX IF NOT EXISTS idx_blocked_clients_deleted_at ON blocked_clients (deleted_at);

-- 21. email_caches
CREATE TABLE IF NOT EXISTS email_caches (
    email           VARCHAR(255) PRIMARY KEY,
    status          VARCHAR(50) NOT NULL,
    score           INTEGER DEFAULT 0,
    reason          VARCHAR(100),
    is_disposable   BOOLEAN DEFAULT FALSE,
    is_free         BOOLEAN DEFAULT FALSE,
    is_role         BOOLEAN DEFAULT FALSE,
    has_mx          BOOLEAN DEFAULT FALSE,
    mx_records      TEXT,
    smtp_connect    BOOLEAN DEFAULT FALSE,
    user_exists     BOOLEAN DEFAULT FALSE,
    is_catch_all     BOOLEAN DEFAULT FALSE,
    is_deliverable  BOOLEAN DEFAULT FALSE,
    is_syntax_valid  BOOLEAN DEFAULT true,
    is_spam_trap     BOOLEAN DEFAULT FALSE,
    is_blacklisted  BOOLEAN DEFAULT FALSE,
    mailbox_full    BOOLEAN DEFAULT FALSE,
    processing_time DECIMAL(10,3),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_caches_status     ON email_caches (status);
CREATE INDEX IF NOT EXISTS idx_email_caches_created_at ON email_caches (created_at);

-- Idempotent column upgrades for existing databases
ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_url VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(255);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS api_key_id INTEGER;
ALTER TABLE job_results ADD COLUMN IF NOT EXISTS mx_records TEXT;
ALTER TABLE job_results ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE job_results ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
