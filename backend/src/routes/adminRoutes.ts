import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db';
import { loginAdmin, adminAuthMiddleware } from '../services/shopAuthService';
import { hashPassword } from '../utils/security';
import { getSocketServer } from '../socket/socketHandler';
import { allocateUniqueSlug, sanitizeSlug } from '../utils/slugAllocator';

const router = Router();

// 1. Super Admin Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const result = await loginAdmin(username || '', password || '');
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// 2. Admin Me verification
router.get('/me', adminAuthMiddleware, (req: any, res: Response) => {
  res.json({ admin: req.admin });
});

// 3. Platform-Wide Analytics Dashboard
router.get('/analytics', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    // Platform-wide totals
    const shopsTotalRes = await query(`
      SELECT 
        COUNT(*) as total_shops,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_shops,
        COUNT(CASE WHEN is_open = true AND is_active = true THEN 1 END) as open_shops
      FROM shops
    `);

    const jobsSummaryRes = await query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status IN ('ready', 'picked_up') THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting_jobs,
        COUNT(CASE WHEN status = 'printing' THEN 1 END) as printing_jobs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
        COALESCE(SUM(price), 0) as total_revenue,
        COALESCE(SUM(page_count * COALESCE((settings->>'copies')::int, 1)), 0) as total_pages_printed,
        COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as jobs_today,
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE AND status IN ('ready', 'picked_up') THEN price ELSE 0 END), 0) as revenue_today
      FROM print_jobs
    `);

    const printersRes = await query(`
      SELECT 
        COUNT(*) as total_printers,
        COUNT(CASE WHEN status = 'online' THEN 1 END) as online_printers
      FROM printers
    `);

    // Top performing shops leaderboard
    const topShopsRes = await query(`
      SELECT 
        s.id,
        s.name,
        s.location,
        s.owner_name,
        s.owner_phone,
        s.is_active,
        s.is_open,
        COUNT(j.id) as total_orders,
        COALESCE(SUM(j.price), 0) as total_revenue,
        COALESCE(SUM(j.page_count * COALESCE((j.settings->>'copies')::int, 1)), 0) as total_sheets
      FROM shops s
      LEFT JOIN print_jobs j ON s.id = j.shop_id AND j.status IN ('ready', 'picked_up')
      GROUP BY s.id, s.name, s.location, s.owner_name, s.owner_phone, s.is_active, s.is_open
      ORDER BY total_revenue DESC, total_orders DESC
      LIMIT 10
    `);

    // Live global recent orders stream (across all shops)
    const recentJobsRes = await query(`
      SELECT 
        j.id,
        j.shop_id,
        s.name as shop_name,
        s.location as shop_location,
        u.name as user_name,
        u.phone as user_phone,
        j.file_name,
        j.page_count,
        j.price,
        j.status,
        j.payment_method,
        j.payment_status,
        j.token_number,
        j.token_code,
        j.created_at
      FROM print_jobs j
      LEFT JOIN shops s ON j.shop_id = s.id
      LEFT JOIN users u ON j.user_id = u.id
      ORDER BY j.created_at DESC
      LIMIT 30
    `);

    const shopTotals = shopsTotalRes.rows[0] || {};
    const jobStats = jobsSummaryRes.rows[0] || {};
    const printerStats = printersRes.rows[0] || {};

    res.json({
      totalShops: parseInt(shopTotals.total_shops || '0', 10),
      activeShops: parseInt(shopTotals.active_shops || '0', 10),
      openShops: parseInt(shopTotals.open_shops || '0', 10),
      totalJobs: parseInt(jobStats.total_jobs || '0', 10),
      completedJobs: parseInt(jobStats.completed_jobs || '0', 10),
      waitingJobs: parseInt(jobStats.waiting_jobs || '0', 10),
      printingJobs: parseInt(jobStats.printing_jobs || '0', 10),
      failedJobs: parseInt(jobStats.failed_jobs || '0', 10),
      totalRevenue: parseFloat(jobStats.total_revenue || '0'),
      totalPagesPrinted: parseInt(jobStats.total_pages_printed || '0', 10),
      jobsToday: parseInt(jobStats.jobs_today || '0', 10),
      revenueToday: parseFloat(jobStats.revenue_today || '0'),
      totalPrinters: parseInt(printerStats.total_printers || '0', 10),
      onlinePrinters: parseInt(printerStats.online_printers || '0', 10),
      topShops: topShopsRes.rows,
      recentJobs: recentJobsRes.rows,
    });
  } catch (err: any) {
    console.error('[Admin Analytics] Error fetching analytics:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. List all shops (for Admin fleet management)
router.get('/shops', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const shopsRes = await query(`
      SELECT 
        s.*,
        (SELECT COUNT(*) FROM printers p WHERE p.shop_id = s.id) as printer_count,
        (SELECT COUNT(*) FROM print_jobs j WHERE j.shop_id = s.id AND j.status IN ('waiting', 'printing')) as active_jobs_count,
        (SELECT COALESCE(SUM(price), 0) FROM print_jobs j WHERE j.shop_id = s.id AND j.status IN ('ready', 'picked_up')) as total_revenue
      FROM shops s
      ORDER BY s.created_at DESC
    `);

    // Remove sensitive password hashes from payload
    const safeShops = shopsRes.rows.map((shop) => {
      const { password_hash, ...safe } = shop;
      return safe;
    });

    res.json(safeShops);
  } catch (err: any) {
    console.error('[Admin Shops] Error listing shops:', err);
    res.status(500).json({ error: err.message });
  }
});

// Check if a custom subdomain slug is available (Phase 6B)
router.get('/check-slug', async (req: Request, res: Response) => {
  try {
    const rawSlug = (req.query.slug as string || '').toLowerCase().trim();
    if (!rawSlug) {
      res.status(400).json({ error: 'Slug parameter is required.' });
      return;
    }

    const cleanSlug = sanitizeSlug(rawSlug);
    const allocation = await allocateUniqueSlug(cleanSlug, cleanSlug);

    if (!allocation.isOriginalAvailable) {
      res.json({
        available: false,
        slug: cleanSlug,
        reason: `'${cleanSlug}.mellod.in' is unavailable or reserved.`,
        recommendedSlug: allocation.slug,
        suggestions: allocation.suggestions,
      });
      return;
    }

    res.json({
      available: true,
      slug: cleanSlug,
      suggestions: allocation.suggestions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Onboard a New Shop (Admin Only)
router.post('/shops', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      name,
      slug: customSlug,
      location,
      address,
      latitude,
      longitude,
      owner_name,
      owner_phone,
      owner_email,
      pin,
      password,
      opening_time,
      closing_time,
      working_days,
      upi_id,
      price_per_bw,
      price_per_color,
      spiral_price,
      staple_price,
      printer_name,
      printer_type,
    } = req.body;

    if (!name || !location) {
      res.status(400).json({ error: 'Shop name and location description are required.' });
      return;
    }

    if (!owner_phone) {
      res.status(400).json({ error: 'Shop owner phone number is required for login.' });
      return;
    }

    // Determine & validate custom subdomain slug using Smart Allocator (Phase 6B)
    const allocation = await allocateUniqueSlug(name, customSlug);
    const finalSlug = allocation.slug;
    const slugNotice = !allocation.isOriginalAvailable && customSlug
      ? `'${customSlug}' was taken. Your counter was registered as '${finalSlug}'.`
      : undefined;

    // Generate unique shop ID
    const shopId = `shop_${finalSlug.replace(/-/g, '_').slice(0, 16)}_${Math.random().toString(36).substring(2, 7)}`;
    const shopPin = pin ? pin.toString().trim() : '1234';
    const pwdHash = password ? hashPassword(password.trim()) : null;

    const bwRate = price_per_bw !== undefined ? Number(price_per_bw) : 2.0;
    const colorRate = price_per_color !== undefined ? Number(price_per_color) : 10.0;
    const spiralRate = spiral_price !== undefined ? Number(spiral_price) : 45.0;
    const stapleRate = staple_price !== undefined ? Number(staple_price) : 5.0;

    await query(
      `INSERT INTO shops (
        id, name, slug, location, address, latitude, longitude,
        owner_name, owner_phone, owner_email, pin, password_hash,
        opening_time, closing_time, working_days, upi_id,
        price_per_bw, price_per_color, spiral_price, staple_price,
        is_active, is_open
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, true, true)`,
      [
        shopId,
        name,
        finalSlug,
        location,
        address || location,
        latitude ? Number(latitude) : null,
        longitude ? Number(longitude) : null,
        owner_name || 'Shop Manager',
        owner_phone.trim(),
        owner_email || '',
        shopPin,
        pwdHash,
        opening_time || '08:00 AM',
        closing_time || '10:00 PM',
        working_days || 'Mon - Sat',
        upi_id || `${finalSlug}@upi`,
        bwRate,
        colorRate,
        spiralRate,
        stapleRate,
      ]
    );

    // Seed default services for this newly onboarded shop
    const initialServices = [
      { name: 'Black & White Printing', desc: 'Standard monochrome laser print', cat: 'print', price: bwRate, unit: 'page', enabled: true, is_default: true },
      { name: 'Color Printing', desc: 'High-clarity color document printing', cat: 'print', price: colorRate, unit: 'page', enabled: true, is_default: true },
      { name: 'Spiral Binding', desc: 'Plastic spiral ring binding with clear covers', cat: 'binding', price: spiralRate, unit: 'doc', enabled: true, is_default: false },
      { name: 'Stapled Binding', desc: 'Corner or side edge stapling', cat: 'binding', price: stapleRate, unit: 'doc', enabled: true, is_default: false },
    ];

    for (const s of initialServices) {
      const srvId = `srv_${uuidv4().substring(0, 8)}`;
      await query(
        `INSERT INTO shop_services (id, shop_id, name, description, category, price, unit, enabled, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [srvId, shopId, s.name, s.desc, s.cat, s.price, s.unit, s.enabled, s.is_default]
      );
    }

    // Register initial default printer
    const pName = printer_name || `${name} Primary Laser`;
    const pType = printer_type === 'color' ? 'color' : 'mono';
    await query(
      `INSERT INTO printers (id, shop_id, name, type, status, system_name)
       VALUES ($1, $2, $3, $4, 'online', 'Microsoft Print to PDF')`,
      [`printer_${uuidv4().substring(0, 8)}`, shopId, pName, pType]
    );

    const createdShopRes = await query('SELECT * FROM shops WHERE id = $1', [shopId]);
    const { password_hash, ...safeCreated } = createdShopRes.rows[0];

    const io = getSocketServer();
    if (io) {
      io.emit('shop_fleet_updated');
    }

    res.status(201).json({
      success: true,
      message: 'Shop successfully onboarded!',
      shop: safeCreated,
    });
  } catch (err: any) {
    console.error('[Admin Onboard] Error onboarding shop:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Toggle Shop Active / Suspended status
router.put('/shops/:id/status', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (is_active === undefined) {
      res.status(400).json({ error: 'is_active (boolean) is required.' });
      return;
    }

    await query('UPDATE shops SET is_active = $1 WHERE id = $2', [Boolean(is_active), id]);

    const io = getSocketServer();
    if (io) {
      io.to(`shop:${id}`).emit('shop_status_changed', { shopId: id, is_active: Boolean(is_active) });
      io.emit('shop_fleet_updated');
    }

    res.json({
      success: true,
      message: `Shop counter ${is_active ? 'activated' : 'deactivated'} successfully.`,
      shopId: id,
      is_active: Boolean(is_active),
    });
  } catch (err: any) {
    console.error('[Admin Shop Status] Error updating status:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Reset Shop Credentials (PIN / Password)
router.put('/shops/:id/credentials', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { pin, password } = req.body;

    if (!pin && !password) {
      res.status(400).json({ error: 'Provide a new PIN or password to reset.' });
      return;
    }

    const newPin = pin ? pin.toString().trim() : null;
    const pwdHash = password ? hashPassword(password.trim()) : null;

    if (newPin && pwdHash) {
      await query('UPDATE shops SET pin = $1, password_hash = $2 WHERE id = $3', [newPin, pwdHash, id]);
    } else if (newPin) {
      await query('UPDATE shops SET pin = $1 WHERE id = $2', [newPin, id]);
    } else if (pwdHash) {
      await query('UPDATE shops SET password_hash = $1 WHERE id = $2', [pwdHash, id]);
    }

    res.json({ success: true, message: 'Shop login credentials updated.' });
  } catch (err: any) {
    console.error('[Admin Credentials] Error updating credentials:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8. Delete / Archive Shop
router.delete('/shops/:id', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM shops WHERE id = $1', [id]);

    const io = getSocketServer();
    if (io) {
      io.emit('shop_fleet_updated');
    }

    res.json({ success: true, message: 'Shop counter removed from network.' });
  } catch (err: any) {
    console.error('[Admin Delete Shop] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
