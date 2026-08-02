-- Migration 000006: Optimize DB Indexes & Future Partitions
-- Safe to re-run on existing production databases (uses IF EXISTS / IF NOT EXISTS).

SET client_min_messages TO WARNING;

-- 1. Remove redundant / duplicate indexes to reduce memory & write overhead
DROP INDEX IF EXISTS idx_jobs_user_id;             -- Covered by idx_jobs_user_status & idx_jobs_user_job_type_status
DROP INDEX IF EXISTS idx_transactions_user_id;     -- Covered by idx_transactions_user_status & idx_transactions_user_created_at
DROP INDEX IF EXISTS idx_processed_requests_key;   -- Covered by table UNIQUE constraint on idempotency_key
DROP INDEX IF EXISTS idx_job_results_job_internal_id; -- Covered by idx_job_results_job_status

-- 2. Create Partial Indexes for Soft-Deleted & Active Data (smaller index size, faster queries)
CREATE INDEX IF NOT EXISTS idx_users_active_email ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys (user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_active_user_status ON jobs (user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_domains_active ON domains (domain, type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_packages_active ON packages (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates (template_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_public_verify_logs_active ON public_verify_logs (ip, cookie_id) WHERE deleted_at IS NULL;

-- 3. Pre-create Partitions for Year 2028 for job_results
CREATE TABLE IF NOT EXISTS job_results_y2028m01 PARTITION OF job_results FOR VALUES FROM ('2028-01-01') TO ('2028-02-01');
CREATE TABLE IF NOT EXISTS job_results_y2028m02 PARTITION OF job_results FOR VALUES FROM ('2028-02-01') TO ('2028-03-01');
CREATE TABLE IF NOT EXISTS job_results_y2028m03 PARTITION OF job_results FOR VALUES FROM ('2028-03-01') TO ('2028-04-01');
CREATE TABLE IF NOT EXISTS job_results_y2028m04 PARTITION OF job_results FOR VALUES FROM ('2028-04-01') TO ('2028-05-01');
CREATE TABLE IF NOT EXISTS job_results_y2028m05 PARTITION OF job_results FOR VALUES FROM ('2028-05-01') TO ('2028-06-01');
CREATE TABLE IF NOT EXISTS job_results_y2028m06 PARTITION OF job_results FOR VALUES FROM ('2028-06-01') TO ('2028-07-01');
CREATE TABLE IF NOT EXISTS job_results_y2028m07 PARTITION OF job_results FOR VALUES FROM ('2028-07-01') TO ('2028-08-01');
CREATE TABLE IF NOT EXISTS job_results_y2028m08 PARTITION OF job_results FOR VALUES FROM ('2028-08-01') TO ('2028-09-01');
CREATE TABLE IF NOT EXISTS job_results_y2028m09 PARTITION OF job_results FOR VALUES FROM ('2028-09-01') TO ('2028-10-01');
CREATE TABLE IF NOT EXISTS job_results_y2028m10 PARTITION OF job_results FOR VALUES FROM ('2028-10-01') TO ('2028-11-01');
CREATE TABLE IF NOT EXISTS job_results_y2028m11 PARTITION OF job_results FOR VALUES FROM ('2028-11-01') TO ('2028-12-01');
CREATE TABLE IF NOT EXISTS job_results_y2028m12 PARTITION OF job_results FOR VALUES FROM ('2028-12-01') TO ('2029-01-01');
