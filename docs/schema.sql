-- Database Schema for Email Verification SaaS

CREATE DATABASE IF NOT EXISTS ejp;
USE ejp;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'manager', 'reseller', 'user', 'demo') DEFAULT 'user',
    credits INT DEFAULT 0,
    status ENUM('Active', 'Suspended') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Keys Table
CREATE TABLE IF NOT EXISTS api_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    key_prefix VARCHAR(16) NOT NULL,
    api_key VARCHAR(255) NOT NULL,
    name VARCHAR(100) DEFAULT 'Default Key',
    status ENUM('active', 'revoked', 'expired') DEFAULT 'active',
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Jobs Metadata Table
CREATE TABLE IF NOT EXISTS jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    job_id VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255),
    filename VARCHAR(255),
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    job_type ENUM('bulk', 'single') DEFAULT 'bulk',
    total_emails INT DEFAULT 0,
    processed_count INT DEFAULT 0,
    deliverable INT DEFAULT 0,
    risky INT DEFAULT 0,
    undeliverable INT DEFAULT 0,
    catch_all INT DEFAULT 0,
    invalid_syntax INT DEFAULT 0,
    role_accounts INT DEFAULT 0,
    disposable INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Job Task Queue Table (chunked worker claims)
CREATE TABLE IF NOT EXISTS job_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id VARCHAR(50) NOT NULL,
    start_index INT NOT NULL,
    end_index INT NOT NULL,
    pushed_count INT NOT NULL DEFAULT 0,
    status ENUM('queued', 'processing', 'completed', 'failed') DEFAULT 'queued',
    worker_server VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
);

-- SMTP Configurations Table
CREATE TABLE IF NOT EXISTS smtp_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    host VARCHAR(255) NOT NULL,
    port INT DEFAULT 587,
    username VARCHAR(255),
    password VARCHAR(255),
    encryption ENUM('tls', 'ssl', 'none') DEFAULT 'tls',
    daily_limit INT DEFAULT 5000,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Worker Servers Table
CREATE TABLE IF NOT EXISTS worker_servers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    server_name VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    port SMALLINT UNSIGNED NOT NULL DEFAULT 80,
    auth_token VARCHAR(255),
    ip_reputation VARCHAR(20) DEFAULT 'Good',
    rate_limit INT DEFAULT 100,
    daily_limit INT DEFAULT 50000,
    worker_count INT DEFAULT 0,
    emails_verified INT DEFAULT 0,
    last_ping TIMESTAMP NULL,
    status ENUM('online', 'offline', 'maintenance') DEFAULT 'offline',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_worker_servers_name (server_name)
);

-- Credit Packages Table
CREATE TABLE IF NOT EXISTS packages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    tagline VARCHAR(255),
    credits_amount INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    description TEXT,
    features TEXT,
    status ENUM('active', 'inactive') DEFAULT 'active',
    popular TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    credits_added INT NOT NULL,
    payment_method VARCHAR(100) DEFAULT 'manual',
    type VARCHAR(50) DEFAULT 'purchase',
    status ENUM('completed', 'failed', 'pending') DEFAULT 'completed',
    package VARCHAR(100) NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Email Templates Table
CREATE TABLE IF NOT EXISTS email_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_name VARCHAR(100) UNIQUE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Domain Management Table (used by Admin\DomainController)
CREATE TABLE IF NOT EXISTS domains (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain VARCHAR(255) UNIQUE NOT NULL,
    type ENUM('disposable', 'free', 'blacklist', 'spam-trap') NOT NULL DEFAULT 'disposable',
    excluded TINYINT(1) NOT NULL DEFAULT 0,
    added_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_domains_type_excluded (type, excluded),
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    level ENUM('INFO', 'WARN', 'ERROR') DEFAULT 'INFO',
    source VARCHAR(50) DEFAULT 'System',
    event VARCHAR(255),
    message TEXT,
    ip VARCHAR(45),
    identifier VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Rate Limits Table (managed via schema, NOT created at runtime)
CREATE TABLE IF NOT EXISTS rate_limits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rate_user_time (user_id, created_at)
);

-- Idempotency Table
CREATE TABLE IF NOT EXISTS processed_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_idem_key (idempotency_key)
);

-- Deleted Job Stats (preserves dashboard totals after user job deletions)
CREATE TABLE IF NOT EXISTS deleted_job_stats (
    user_id INT NOT NULL PRIMARY KEY,
    total_verifications BIGINT UNSIGNED NOT NULL DEFAULT 0,
    total_jobs BIGINT UNSIGNED NOT NULL DEFAULT 0,
    deliverable BIGINT UNSIGNED NOT NULL DEFAULT 0,
    risky BIGINT UNSIGNED NOT NULL DEFAULT 0,
    undeliverable BIGINT UNSIGNED NOT NULL DEFAULT 0,
    catch_all BIGINT UNSIGNED NOT NULL DEFAULT 0,
    disposable BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deleted_job_daily_stats (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    activity_date DATE NOT NULL,
    emails BIGINT UNSIGNED NOT NULL DEFAULT 0,
    jobs BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_deleted_job_daily_user_date (user_id, activity_date),
    INDEX idx_deleted_job_daily_date_user (activity_date, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- Schema Backfills (safe on existing installations)
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'worker_servers' AND column_name = 'enabled'
);
SET @sql_stmt := IF(@col_exists = 0,
  'ALTER TABLE worker_servers ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'worker_servers' AND column_name = 'port'
);
SET @sql_stmt := IF(@col_exists = 0,
  'ALTER TABLE worker_servers ADD COLUMN port SMALLINT UNSIGNED NOT NULL DEFAULT 80 AFTER ip_address',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- api_keys.status enum update (adds 'expired' for auto-revoked keys)
SET @status_col := (
  SELECT COLUMN_TYPE FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'api_keys' AND column_name = 'status'
);
SET @needs_enum_update := IF(@status_col IS NULL OR @status_col NOT LIKE '%expired%', 1, 0);
SET @sql_stmt := IF(@needs_enum_update = 1,
  'ALTER TABLE api_keys MODIFY COLUMN status ENUM(''active'', ''revoked'', ''expired'') DEFAULT ''active''',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- Performance Indexes (Portable MySQL/MariaDB-safe creation)
-- ============================================================
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'jobs' AND index_name = 'idx_jobs_user'
);
SET @sql_stmt := IF(@idx_exists = 0,
  'CREATE INDEX idx_jobs_user ON jobs(user_id, created_at, status, job_type)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'transactions' AND index_name = 'idx_tx_user'
);
SET @sql_stmt := IF(@idx_exists = 0,
  'CREATE INDEX idx_tx_user ON transactions(user_id, created_at, type, status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'activity_logs' AND index_name = 'idx_logs_date'
);
SET @sql_stmt := IF(@idx_exists = 0,
  'CREATE INDEX idx_logs_date ON activity_logs(created_at, user_id, level)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'api_keys' AND index_name = 'idx_apikeys_user'
);
SET @sql_stmt := IF(@idx_exists = 0,
  'CREATE INDEX idx_apikeys_user ON api_keys(user_id, status, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'jobs' AND index_name = 'idx_jobs_user_type_created'
);
SET @sql_stmt := IF(@idx_exists = 0,
  'CREATE INDEX idx_jobs_user_type_created ON jobs(user_id, job_type, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'worker_servers' AND index_name = 'uq_worker_servers_name'
);
SET @dup_server_names := (
  SELECT COUNT(*) FROM (
    SELECT server_name
    FROM worker_servers
    GROUP BY server_name
    HAVING COUNT(*) > 1
  ) dup_names
);
SET @sql_stmt := IF(@idx_exists = 0 AND @dup_server_names = 0,
  'CREATE UNIQUE INDEX uq_worker_servers_name ON worker_servers(server_name)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'worker_servers' AND index_name = 'idx_worker_servers_ip'
);
SET @sql_stmt := IF(@idx_exists = 0,
  'CREATE INDEX idx_worker_servers_ip ON worker_servers(ip_address)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'job_tasks' AND index_name = 'idx_job_tasks_status_updated'
);
SET @sql_stmt := IF(@idx_exists = 0,
  'CREATE INDEX idx_job_tasks_status_updated ON job_tasks(status, updated_at, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'job_tasks' AND index_name = 'idx_job_tasks_job_status'
);
SET @sql_stmt := IF(@idx_exists = 0,
  'CREATE INDEX idx_job_tasks_job_status ON job_tasks(job_id, status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'activity_logs' AND index_name = 'idx_logs_source_level_time_ip'
);
SET @sql_stmt := IF(@idx_exists = 0,
  'CREATE INDEX idx_logs_source_level_time_ip ON activity_logs(source, level, created_at, ip)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'activity_logs' AND index_name = 'idx_logs_identifier_created'
);
SET @sql_stmt := IF(@idx_exists = 0,
  'CREATE INDEX idx_logs_identifier_created ON activity_logs(identifier, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'activity_logs' AND index_name = 'idx_logs_ip_created'
);
SET @sql_stmt := IF(@idx_exists = 0,
  'CREATE INDEX idx_logs_ip_created ON activity_logs(ip, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'deleted_job_daily_stats' AND index_name = 'idx_deleted_job_daily_date_user'
);
SET @sql_stmt := IF(@idx_exists = 0,
  'CREATE INDEX idx_deleted_job_daily_date_user ON deleted_job_daily_stats(activity_date, user_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

/*
-- ============================================================
-- Seed Data (PRODUCTION WARNING: DO NOT RUN THIS IN PRODUCTION)
-- ============================================================

-- To seed an Admin User manually, run the following (Password: admin123):
-- INSERT IGNORE INTO users (name, email, password, role, credits)
-- VALUES ('Admin', 'admin@example.com', '$2b$10$.buYGqrGgQixwf.6Ciz.VeUfvkIf.DFlnC9YYCBWo87i1hsiLWMq6', 'admin', 999999);

-- To seed a Default API Key for the Admin:
-- INSERT IGNORE INTO api_keys (user_id, api_key, name)
-- VALUES (1, 'ak_live_51Msz7yL2oPqXvN8z3K9J4L7M6N5P4Q3R', 'Production Key');

-- Seed Sample Packages:
-- INSERT IGNORE INTO packages (name, credits_amount, price, description) VALUES
-- ('Free Plan', 100, 0.00, 'Free starting credits for new users'),
-- ('Starter', 10000, 19.00, 'Great for small businesses'),
-- ('Professional', 50000, 49.00, 'Best for marketing teams'),
-- ('Enterprise', 500000, 199.00, 'Unlimited scaling for enterprises');

-- Seed Sample SMTP:
-- INSERT IGNORE INTO smtp_configs (host, port, username, password, encryption)
-- VALUES ('smtp.gmail.com', 587, 'verify@example.com', 'CHANGE_ME', 'tls');
*/
