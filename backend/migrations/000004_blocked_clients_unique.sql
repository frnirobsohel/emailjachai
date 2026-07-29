-- Ensure blocked_clients.value is unique so ON CONFLICT (value) upserts work.
-- Keep the lowest id when duplicates exist.
DELETE FROM blocked_clients a
    USING blocked_clients b
WHERE a.id > b.id
  AND a.value = b.value;

DROP INDEX IF EXISTS idx_blocked_clients_value;

CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_clients_value ON blocked_clients (value);
