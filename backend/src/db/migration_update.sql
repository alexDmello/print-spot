-- ==============================================================
-- PrintSpot Database Migration & Update Script
-- Safe to execute on existing databases (idempotent)
-- ==============================================================

-- 1. Ensure slug support on shops for subdomain routing
ALTER TABLE shops ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_slug ON shops(slug);

-- 2. Platform Fee Ledger tracking on shops (Phase 5)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC DEFAULT 5.0;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS unsettled_cash_fee NUMERIC DEFAULT 0.00;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS total_platform_fees_settled NUMERIC DEFAULT 0.00;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS max_pending_cash_fee NUMERIC DEFAULT 200.00;

-- 3. Platform Fee & Shop Payout tracking on print_jobs (Phase 5)
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS platform_fee NUMERIC DEFAULT 0.00;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS shop_payout NUMERIC DEFAULT 0.00;

-- 4. Clean up any static/fake printers previously seeded into database
-- Physical printers are now recognized locally via host hardware and saved in shop admin localStorage
DELETE FROM printers WHERE id IN ('ptr_mono_1', 'ptr_color_1');

-- 5. Update existing shop_main record with default values
UPDATE shops 
SET 
  slug = COALESCE(slug, 'campus'),
  owner_name = CASE WHEN owner_name = 'Vikram Malhotra' THEN 'Shop Owner' ELSE owner_name END,
  platform_fee_percent = COALESCE(platform_fee_percent, 5.0),
  unsettled_cash_fee = COALESCE(unsettled_cash_fee, 0.00),
  total_platform_fees_settled = COALESCE(total_platform_fees_settled, 0.00),
  max_pending_cash_fee = COALESCE(max_pending_cash_fee, 200.00)
WHERE id = 'shop_main';

-- 6. Update any existing completed print jobs to ensure platform_fee and shop_payout are non-null
UPDATE print_jobs
SET 
  platform_fee = COALESCE(platform_fee, ROUND(price * 0.05, 2)),
  shop_payout = COALESCE(shop_payout, price - ROUND(price * 0.05, 2))
WHERE platform_fee IS NULL OR shop_payout IS NULL;
