-- Enforce at most one non-deleted free plan (price = 0).
CREATE UNIQUE INDEX IF NOT EXISTS idx_packages_one_free_plan
ON packages ((1))
WHERE price = 0 AND deleted_at IS NULL;
