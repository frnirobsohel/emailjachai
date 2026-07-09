-- Migration 000006: Add webhook_url, webhook_secret and external_id to DB schemas
-- This handles parity between GORM models and production SQL migrations.

-- Add external_id to transactions table if it doesn't exist
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);

-- Create a conditional unique index on transactions.external_id (ignoring empty strings and NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions (external_id) 
WHERE external_id IS NOT NULL AND external_id <> '';

-- Add webhook columns to users table if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_url VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(255);
