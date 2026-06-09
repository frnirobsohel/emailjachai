-- Migration: Additional Production Indexes for Jobs and Transactions
-- These indexes optimize common query patterns for dashboard stats and audit trails.

-- Additional indexes for jobs table
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON jobs (user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs (type);

-- Transaction table indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at);
