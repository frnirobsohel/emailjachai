-- Migration 000012: Package offer price (compare-at vs charge amount)
-- offer_price = 0 means no active offer; charge uses price.

ALTER TABLE packages
    ADD COLUMN IF NOT EXISTS offer_price DECIMAL(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN packages.offer_price IS 'Sale/charge price when > 0; 0 disables offer and charges packages.price';
