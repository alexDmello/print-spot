import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { config } from '../config/env';

export interface DbResult<T = any> {
  rows: T[];
  rowCount: number;
}

let pgPool: Pool | null = null;
let pgliteInstance: PGlite | null = null;

export async function initDb(): Promise<void> {
  if (config.databaseUrl) {
    console.log('[DB] Connecting to PostgreSQL via DATABASE_URL...');
    pgPool = new Pool({ connectionString: config.databaseUrl });
    await pgPool.query('SELECT 1');
    console.log('[DB] Connected to PostgreSQL successfully.');
  } else {
    console.log('[DB] No DATABASE_URL specified. Initializing embedded PGlite database...');
    const dbDir = path.resolve(config.uploadDir, 'pglite_data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    pgliteInstance = new PGlite(dbDir);
    await pgliteInstance.waitReady;
    console.log(`[DB] Embedded PGlite database ready at ${dbDir}`);
  }

  await runMigrations();
  await seedDefaults();
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<DbResult<T>> {
  if (pgPool) {
    const res = await pgPool.query(sql, params);
    return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
  } else if (pgliteInstance) {
    const res = await pgliteInstance.query<T>(sql, params);
    return { rows: res.rows, rowCount: res.rows.length };
  } else {
    throw new Error('Database not initialized. Call initDb() first.');
  }
}

export async function exec(sql: string): Promise<void> {
  if (pgPool) {
    await pgPool.query(sql);
  } else if (pgliteInstance) {
    await pgliteInstance.exec(sql);
  } else {
    throw new Error('Database not initialized. Call initDb() first.');
  }
}

async function runMigrations(): Promise<void> {
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shops (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      address TEXT,
      latitude NUMERIC,
      longitude NUMERIC,
      owner_name TEXT,
      owner_phone TEXT,
      owner_email TEXT,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE shops ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS latitude NUMERIC;
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS longitude NUMERIC;
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_name TEXT;
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_phone TEXT;
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_email TEXT;
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS opening_time TEXT DEFAULT '08:00 AM';
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS closing_time TEXT DEFAULT '10:00 PM';
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS working_days TEXT DEFAULT 'Mon - Sat';
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS upi_id TEXT;
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS spiral_price NUMERIC NOT NULL DEFAULT 45.00;
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS staple_price NUMERIC NOT NULL DEFAULT 5.00;
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS double_sided_discount NUMERIC NOT NULL DEFAULT 0.00;
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS custom_rates JSONB DEFAULT '{}';

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

    CREATE TABLE IF NOT EXISTS printers (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      system_name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

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
      status TEXT NOT NULL,
      token_number INT,
      token_code TEXT,
      price NUMERIC NOT NULL,
      razorpay_order_id TEXT,
      razorpay_payment_id TEXT,
      pickup_code TEXT,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      picked_up_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS queue_entries (
      job_id TEXT PRIMARY KEY REFERENCES print_jobs(id) ON DELETE CASCADE,
      shop_id TEXT NOT NULL REFERENCES shops(id),
      position INT NOT NULL,
      status TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_shop_status ON print_jobs(shop_id, status);
    CREATE INDEX IF NOT EXISTS idx_jobs_user ON print_jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_queue_shop_pos ON queue_entries(shop_id, position);
    CREATE INDEX IF NOT EXISTS idx_services_shop ON shop_services(shop_id);
  `;

  await exec(schemaSql);
  console.log('[DB] Schema and tables verified.');
}

async function seedDefaults(): Promise<void> {
  const shopCheck = await query('SELECT id FROM shops WHERE id = $1', ['shop_main']);
  if (shopCheck.rowCount === 0) {
    console.log('[DB] Seeding default shop and printers...');
    await query(
      `INSERT INTO shops (id, name, location, address, latitude, longitude, owner_name, owner_phone, owner_email, opening_time, closing_time, working_days, upi_id, price_per_bw, price_per_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        'shop_main',
        'PrintSpot Campus Hub',
        'Student Center, Ground Floor (Near Cafeteria)',
        'Shop G-04, Student Activity Center, North Campus, University Enclave, New Delhi, Delhi 110007',
        28.6912,
        77.2089,
        'Vikram Malhotra',
        '9876543210',
        'hub@printspot.in',
        '08:00 AM',
        '10:00 PM',
        'Mon - Sat',
        'printspot@upi',
        2.00,
        10.00,
      ]
    );

    await query(
      `INSERT INTO printers (id, shop_id, name, type, status, system_name)
       VALUES 
       ($1, $2, $3, $4, $5, $6),
       ($7, $8, $9, $10, $11, $12)`,
      [
        'printer_mono_1', 'shop_main', 'HP LaserJet Pro M404n (High Speed Mono)', 'mono', 'online', 'Microsoft Print to PDF',
        'printer_color_1', 'shop_main', 'Canon imageRUNNER ADVANCE C3530i (Color HD)', 'color', 'online', 'Microsoft Print to PDF'
      ]
    );
  } else {
    // Ensure shop_main has default address & coordinates if null
    await query(
      `UPDATE shops 
       SET address = COALESCE(address, 'Shop G-04, Student Activity Center, North Campus, University Enclave, New Delhi, Delhi 110007'),
           latitude = COALESCE(latitude, 28.6912),
           longitude = COALESCE(longitude, 77.2089),
           owner_name = COALESCE(owner_name, 'Vikram Malhotra'),
           owner_phone = COALESCE(owner_phone, '9876543210'),
           owner_email = COALESCE(owner_email, 'hub@printspot.in'),
           opening_time = COALESCE(opening_time, '08:00 AM'),
           closing_time = COALESCE(closing_time, '10:00 PM'),
           working_days = COALESCE(working_days, 'Mon - Sat'),
           upi_id = COALESCE(upi_id, 'printspot@upi')
       WHERE id = 'shop_main'`
    );
  }

  // Seed default services for shop_main if not exists
  const servicesCheck = await query('SELECT id FROM shop_services WHERE shop_id = $1', ['shop_main']);
  if (servicesCheck.rowCount === 0) {
    console.log('[DB] Seeding default services catalog for shop_main...');
    const defaultServices = [
      { id: 'srv_bw_shop_main', name: 'Black & White Printing', desc: 'Crisp 1200 DPI monochrome laser print', cat: 'print', price: 2.00, unit: 'page', enabled: true, is_default: true },
      { id: 'srv_color_shop_main', name: 'Color Printing', desc: 'Vibrant full-color laser document printing', cat: 'print', price: 10.00, unit: 'page', enabled: true, is_default: true },
      { id: 'srv_spiral_shop_main', name: 'Spiral Binding', desc: 'Includes transparent protective front & back covers', cat: 'binding', price: 45.00, unit: 'doc', enabled: true, is_default: false },
      { id: 'srv_staple_shop_main', name: 'Stapled Binding', desc: 'Corner or left-edge heavy duty staple', cat: 'binding', price: 5.00, unit: 'doc', enabled: true, is_default: false },
      { id: 'srv_glossy_shop_main', name: 'Glossy / Photo Paper', desc: 'Premium 180gsm glossy photo sheet finish', cat: 'paper', price: 15.00, unit: 'page', enabled: false, is_default: false },
      { id: 'srv_lamination_shop_main', name: 'Thermal Lamination', desc: 'Waterproof 125-micron heat sealed lamination', cat: 'finishing', price: 25.00, unit: 'page', enabled: false, is_default: false }
    ];

    for (const s of defaultServices) {
      await query(
        `INSERT INTO shop_services (id, shop_id, name, description, category, price, unit, enabled, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [s.id, 'shop_main', s.name, s.desc, s.cat, s.price, s.unit, s.enabled, s.is_default]
      );
    }
  }
  console.log('[DB] Seed data populated successfully.');
}
