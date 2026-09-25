-- ==============================================================
-- PrintSpot Initial Seed Data
-- ==============================================================

-- 1. Default Super Admin (Username: admin / Password: admin123)
-- PBKDF2 salt:hash
INSERT INTO admin_users (id, username, password_hash, email)
VALUES (
  'admin_root_1',
  'admin',
  'a1b2c3d4e5f60718:03b0d4bbd9169f49c0bfd9929e7178b5ce89f38f1f7278278dcfa4e99f6ec711d9f8ce3ee2dc222f74fe90408546b54133499e71ce9dfefc01fa940e7046ae9b',
  'admin@printspot.in'
)
ON CONFLICT (username) DO NOTHING;

-- 2. Default Shop Counter (Campus Hub)
-- Ensure slug column and index exist if run on existing database
ALTER TABLE shops ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_slug ON shops(slug);

INSERT INTO shops (
  id, name, slug, location, address, latitude, longitude,
  owner_name, owner_phone, owner_email, pin,
  opening_time, closing_time, working_days, upi_id,
  price_per_bw, price_per_color, is_active, is_open
)
VALUES (
  'shop_main',
  'PrintSpot Campus Hub',
  'campus',
  'Student Center, Ground Floor (Near Cafeteria)',
  'Shop G-04, Student Activity Center, North Campus, University Enclave, New Delhi, Delhi 110007',
  28.6912,
  77.2089,
  'Vikram Malhotra',
  '9876543210',
  'hub@printspot.in',
  '1234',
  '08:00 AM',
  '10:00 PM',
  'Mon - Sat',
  'printspot@upi',
  2.00,
  10.00,
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug WHERE shops.slug IS NULL;

-- 3. Default Hardware Printers for shop_main
INSERT INTO printers (id, shop_id, name, type, status, system_name)
VALUES 
  ('printer_mono_1', 'shop_main', 'HP LaserJet Pro M404n (High Speed Mono)', 'mono', 'online', 'Microsoft Print to PDF'),
  ('printer_color_1', 'shop_main', 'Canon imageRUNNER ADVANCE C3530i (Color HD)', 'color', 'online', 'Microsoft Print to PDF')
ON CONFLICT (id) DO NOTHING;

-- 4. Default Catalog Services for shop_main
INSERT INTO shop_services (id, shop_id, name, description, category, price, unit, enabled, is_default)
VALUES
  ('srv_bw_shop_main', 'shop_main', 'Black & White Printing', 'Crisp 1200 DPI monochrome laser print', 'print', 2.00, 'page', true, true),
  ('srv_color_shop_main', 'shop_main', 'Color Printing', 'Vibrant full-color laser document printing', 'print', 10.00, 'page', true, true),
  ('srv_spiral_shop_main', 'shop_main', 'Spiral Binding', 'Includes transparent protective front & back covers', 'binding', 45.00, 'doc', true, false),
  ('srv_staple_shop_main', 'shop_main', 'Stapled Binding', 'Corner or left-edge heavy duty staple', 'binding', 5.00, 'doc', true, false),
  ('srv_glossy_shop_main', 'shop_main', 'Glossy / Photo Paper', 'Premium 180gsm glossy photo sheet finish', 'paper', 15.00, 'page', false, false),
  ('srv_lamination_shop_main', 'shop_main', 'Thermal Lamination', 'Waterproof 125-micron heat sealed lamination', 'finishing', 25.00, 'page', false, false)
ON CONFLICT (id) DO NOTHING;
