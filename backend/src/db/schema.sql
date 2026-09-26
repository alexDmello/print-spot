-- ==============================================================
-- PrintSpot Production Database Schema
-- Compatible with: PostgreSQL 14+, Neon, Supabase, AWS RDS, PGlite
-- ==============================================================

-- 1. Users Table (Customers)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Shops Table (Print Counters)
CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE, -- Custom subdomain slug e.g. 'engg' -> engg.mellod.in
  location TEXT NOT NULL,
  address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  owner_name TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  password_hash TEXT,
  pin TEXT DEFAULT '1234',
  opening_time TEXT DEFAULT '08:00 AM',
  closing_time TEXT DEFAULT '10:00 PM',
  working_days TEXT DEFAULT 'Mon - Sat',
  upi_id TEXT,
  price_per_bw NUMERIC NOT NULL DEFAULT 2.00,
  price_per_color NUMERIC NOT NULL DEFAULT 10.00,
  spiral_price NUMERIC NOT NULL DEFAULT 45.00,
  staple_price NUMERIC NOT NULL DEFAULT 5.00,
  double_sided_discount NUMERIC NOT NULL DEFAULT 0.00,
  custom_rates JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_open BOOLEAN DEFAULT true,
  platform_fee_percent NUMERIC DEFAULT 5.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure slug column exists if table was created previously without it
ALTER TABLE shops ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_slug ON shops(slug);

-- Platform fee ledger tracking
ALTER TABLE shops ADD COLUMN IF NOT EXISTS unsettled_cash_fee NUMERIC DEFAULT 0.00;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS total_platform_fees_settled NUMERIC DEFAULT 0.00;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS max_pending_cash_fee NUMERIC DEFAULT 200.00;

-- 3. Super Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Shop Services & Pricing Catalog
CREATE TABLE IF NOT EXISTS shop_services (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'print',
  price NUMERIC NOT NULL DEFAULT 0.00,
  unit TEXT NOT NULL DEFAULT 'page',
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Hardware Printers / Spoolers
CREATE TABLE IF NOT EXISTS printers (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'mono' | 'color'
  status TEXT NOT NULL DEFAULT 'online', -- 'online' | 'offline'
  system_name TEXT, -- OS Spooler Name e.g. 'Microsoft Print to PDF'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Print Jobs
CREATE TABLE IF NOT EXISTS print_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  shop_id TEXT NOT NULL REFERENCES shops(id),
  printer_id TEXT REFERENCES printers(id),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  page_count INT NOT NULL DEFAULT 1,
  settings JSONB NOT NULL,
  status TEXT NOT NULL, -- 'created' | 'payment_pending' | 'waiting' | 'printing' | 'ready' | 'picked_up' | 'failed' | 'cancelled'
  token_number INT,
  token_code TEXT, -- e.g. '#42'
  price NUMERIC NOT NULL,
  payment_provider TEXT DEFAULT 'manual', -- 'razorpay' | 'phonepe' | 'cashfree' | 'stripe' | 'payu' | 'counter' | 'manual'
  payment_method TEXT DEFAULT 'upi', -- 'upi' | 'card' | 'counter_cash' | 'counter_upi' | 'netbanking'
  payment_status TEXT DEFAULT 'pending', -- 'pending' | 'paid' | 'pay_at_counter'
  payment_order_id TEXT, -- Gateway Order ID (Razorpay, Cashfree, PhonePe, Stripe, etc.)
  payment_transaction_id TEXT, -- Gateway Transaction/Reference ID
  pickup_code TEXT, -- 4-digit verification code
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  picked_up_at TIMESTAMP,
  printed_at TIMESTAMP,
  platform_fee NUMERIC DEFAULT 0.00,
  shop_payout NUMERIC DEFAULT 0.00
);

ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS platform_fee NUMERIC DEFAULT 0.00;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS shop_payout NUMERIC DEFAULT 0.00;

-- 7. Live Queue Entries (FIFO Engine)
CREATE TABLE IF NOT EXISTS queue_entries (
  job_id TEXT PRIMARY KEY REFERENCES print_jobs(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  position INT NOT NULL,
  status TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_shop_status ON print_jobs(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON print_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_queue_shop_pos ON queue_entries(shop_id, position);
CREATE INDEX IF NOT EXISTS idx_services_shop ON shop_services(shop_id);
