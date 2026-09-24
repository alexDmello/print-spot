import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import util from 'util';
import { query } from '../db';
import { queueEngine } from '../redis/queueEngine';
import { getSocketServer } from '../socket/socketHandler';

const execAsync = util.promisify(exec);
const router = Router();

// Helper to fetch full shop details
async function getShopWithDetails(shopId: string) {
  const shopRes = await query('SELECT * FROM shops WHERE id = $1', [shopId]);
  if (shopRes.rowCount === 0) return null;

  const shop = shopRes.rows[0];
  const printersRes = await query(
    'SELECT id, shop_id, name, type, status, system_name, created_at FROM printers WHERE shop_id = $1 ORDER BY created_at ASC',
    [shopId]
  );
  const servicesRes = await query(
    'SELECT id, shop_id, name, description, category, price, unit, enabled, is_default, created_at FROM shop_services WHERE shop_id = $1 ORDER BY is_default DESC, created_at ASC',
    [shopId]
  );
  const snapshot = await queueEngine.getQueueSnapshot(shopId);

  return {
    ...shop,
    printers: printersRes.rows,
    services: servicesRes.rows,
    nowServingToken: snapshot.nowServingToken,
    totalWaiting: snapshot.totalWaiting,
  };
}

// 1. List all shops
router.get('/', async (_req: Request, res: Response) => {
  try {
    const shopsRes = await query('SELECT * FROM shops ORDER BY created_at ASC');
    const shopsWithDetails = [];

    for (const shop of shopsRes.rows) {
      const printersRes = await query(
        'SELECT id, shop_id, name, type, status, system_name, created_at FROM printers WHERE shop_id = $1 ORDER BY created_at ASC',
        [shop.id]
      );
      const servicesRes = await query(
        'SELECT id, shop_id, name, description, category, price, unit, enabled, is_default, created_at FROM shop_services WHERE shop_id = $1 ORDER BY is_default DESC, created_at ASC',
        [shop.id]
      );
      const snapshot = await queueEngine.getQueueSnapshot(shop.id);

      shopsWithDetails.push({
        ...shop,
        printers: printersRes.rows,
        services: servicesRes.rows,
        nowServingToken: snapshot.nowServingToken,
        totalWaiting: snapshot.totalWaiting,
      });
    }

    res.json(shopsWithDetails);
  } catch (err: any) {
    console.error('[Shops] Error fetching shops:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Shop Self-Onboarding
router.post('/onboard', async (req: Request, res: Response) => {
  try {
    const {
      name,
      location,
      address,
      latitude,
      longitude,
      owner_name,
      owner_phone,
      owner_email,
      opening_time,
      closing_time,
      working_days,
      upi_id,
      price_per_bw,
      price_per_color,
      printers,
      services,
    } = req.body;

    if (!name || !location) {
      res.status(400).json({ error: 'Shop name and location are required.' });
      return;
    }

    // Generate unique shop ID
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 16);
    const shopId = `shop_${slug}_${Math.random().toString(36).substring(2, 7)}`;

    const bwRate = price_per_bw !== undefined ? Number(price_per_bw) : 2.0;
    const colorRate = price_per_color !== undefined ? Number(price_per_color) : 10.0;

    await query(
      `INSERT INTO shops (
        id, name, location, address, latitude, longitude,
        owner_name, owner_phone, owner_email,
        opening_time, closing_time, working_days, upi_id,
        price_per_bw, price_per_color
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        shopId,
        name,
        location,
        address || location,
        latitude ? Number(latitude) : null,
        longitude ? Number(longitude) : null,
        owner_name || 'Shop Manager',
        owner_phone || '',
        owner_email || '',
        opening_time || '08:00 AM',
        closing_time || '10:00 PM',
        working_days || 'Mon - Sat',
        upi_id || `${slug}@upi`,
        bwRate,
        colorRate,
      ]
    );

    // Initial Services Setup
    const initialServices = Array.isArray(services) && services.length > 0 ? services : [
      { name: 'Black & White Printing', desc: 'Standard monochrome document printing', cat: 'print', price: bwRate, unit: 'page', enabled: true, is_default: true },
      { name: 'Color Printing', desc: 'High-clarity color document printing', cat: 'print', price: colorRate, unit: 'page', enabled: true, is_default: true },
      { name: 'Spiral Binding', desc: 'Plastic spiral ring binding with transparent sheet covers', cat: 'binding', price: 45.0, unit: 'doc', enabled: true, is_default: false },
      { name: 'Stapled Binding', desc: 'Corner or side edge metal stapling', cat: 'binding', price: 5.0, unit: 'doc', enabled: true, is_default: false },
    ];

    for (const s of initialServices) {
      const srvId = `srv_${uuidv4().substring(0, 8)}`;
      await query(
        `INSERT INTO shop_services (id, shop_id, name, description, category, price, unit, enabled, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [srvId, shopId, s.name, s.desc || s.description || '', s.cat || s.category || 'print', Number(s.price) || 0, s.unit || 'page', s.enabled !== false, s.is_default || false]
      );
    }

    // Initial Printers Setup
    const initialPrinters = Array.isArray(printers) && printers.length > 0 ? printers : [
      { name: `${name} High-Speed B&W`, type: 'mono', status: 'online', system_name: 'Microsoft Print to PDF' },
      { name: `${name} Color LaserJet`, type: 'color', status: 'online', system_name: 'Microsoft Print to PDF' },
    ];

    for (const p of initialPrinters) {
      const printerId = `printer_${uuidv4().substring(0, 8)}`;
      await query(
        `INSERT INTO printers (id, shop_id, name, type, status, system_name)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [printerId, shopId, p.name, p.type || 'mono', p.status || 'online', p.system_name || 'Microsoft Print to PDF']
      );
    }

    const createdShop = await getShopWithDetails(shopId);

    const io = getSocketServer();
    if (io) {
      io.emit('shop_created', createdShop);
    }

    res.status(201).json({
      success: true,
      message: 'Shop successfully onboarded!',
      shop: createdShop,
    });
  } catch (err: any) {
    console.error('[Shops] Error during shop onboarding:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Single shop info
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shop = await getShopWithDetails(id);
    if (!shop) {
      res.status(404).json({ error: 'Shop not found' });
      return;
    }
    res.json(shop);
  } catch (err: any) {
    console.error('[Shops] Error fetching shop:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Update Shop Profile & Location Details
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      location,
      address,
      latitude,
      longitude,
      owner_name,
      owner_phone,
      owner_email,
      opening_time,
      closing_time,
      working_days,
      upi_id,
    } = req.body;

    const shopRes = await query('SELECT * FROM shops WHERE id = $1', [id]);
    if (shopRes.rowCount === 0) {
      res.status(404).json({ error: 'Shop not found' });
      return;
    }

    const current = shopRes.rows[0];

    await query(
      `UPDATE shops 
       SET name = COALESCE($1, name),
           location = COALESCE($2, location),
           address = COALESCE($3, address),
           latitude = COALESCE($4, latitude),
           longitude = COALESCE($5, longitude),
           owner_name = COALESCE($6, owner_name),
           owner_phone = COALESCE($7, owner_phone),
           owner_email = COALESCE($8, owner_email),
           opening_time = COALESCE($9, opening_time),
           closing_time = COALESCE($10, closing_time),
           working_days = COALESCE($11, working_days),
           upi_id = COALESCE($12, upi_id)
       WHERE id = $13`,
      [
        name ?? current.name,
        location ?? current.location,
        address ?? current.address,
        latitude !== undefined ? Number(latitude) : current.latitude,
        longitude !== undefined ? Number(longitude) : current.longitude,
        owner_name ?? current.owner_name,
        owner_phone ?? current.owner_phone,
        owner_email ?? current.owner_email,
        opening_time ?? current.opening_time,
        closing_time ?? current.closing_time,
        working_days ?? current.working_days,
        upi_id ?? current.upi_id,
        id,
      ]
    );

    const updatedShop = await getShopWithDetails(id);

    const io = getSocketServer();
    if (io) {
      io.to(`shop:${id}`).emit('shop_updated', updatedShop);
      io.emit('shop_profile_updated', updatedShop);
    }

    res.json({
      success: true,
      message: 'Shop profile updated successfully.',
      shop: updatedShop,
    });
  } catch (err: any) {
    console.error('[Shops] Error updating shop profile:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Daily metrics for Admin Panel
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const todayStats = await query(
      `SELECT 
         COUNT(*) as completed_count,
         COALESCE(SUM(price), 0) as total_revenue,
         COALESCE(SUM(page_count * (settings->>'copies')::int), 0) as total_sheets
       FROM print_jobs 
       WHERE shop_id = $1 
         AND status IN ('ready', 'picked_up') 
         AND (completed_at >= CURRENT_DATE OR created_at >= CURRENT_DATE)`,
      [id]
    );

    const queueStats = await query(
      `SELECT 
         COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting_count,
         COUNT(CASE WHEN status = 'printing' THEN 1 END) as printing_count,
         COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
       FROM print_jobs 
       WHERE shop_id = $1 AND status IN ('waiting', 'printing', 'failed')`,
      [id]
    );

    const printersRes = await query(
      `SELECT id, name, type, status, system_name FROM printers WHERE shop_id = $1`,
      [id]
    );

    const stats = todayStats.rows[0] || {};
    const qStats = queueStats.rows[0] || {};

    res.json({
      completedJobsToday: parseInt(stats.completed_count || '0', 10),
      revenueToday: parseFloat(stats.total_revenue || '0'),
      pagesPrintedToday: parseInt(stats.total_sheets || '0', 10),
      waitingJobs: parseInt(qStats.waiting_count || '0', 10),
      printingJobs: parseInt(qStats.printing_count || '0', 10),
      failedJobs: parseInt(qStats.failed_count || '0', 10),
      printers: printersRes.rows,
    });
  } catch (err: any) {
    console.error('[Shops] Error fetching shop stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. MULTI-DEVICE / PRINTER MANAGEMENT CRUD
// ==========================================

// List printers for a shop
router.get('/:id/printers', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const resPrinters = await query(
      'SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json(resPrinters.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new device/printer
router.post('/:id/printers', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, system_name, status } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Device name is required.' });
      return;
    }

    const printerId = `printer_${uuidv4().substring(0, 8)}`;
    await query(
      `INSERT INTO printers (id, shop_id, name, type, status, system_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        printerId,
        id,
        name,
        type === 'color' ? 'color' : 'mono',
        status || 'online',
        system_name || 'Microsoft Print to PDF',
      ]
    );

    const printersRes = await query('SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [id]);
    const io = getSocketServer();
    if (io) {
      io.to(`shop:${id}`).emit('printers_updated', printersRes.rows);
    }

    res.status(201).json({
      success: true,
      message: 'New printer device registered successfully.',
      printers: printersRes.rows,
    });
  } catch (err: any) {
    console.error('[Shops] Error adding printer device:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update printer device (status, target name, type)
router.put('/:id/printers/:printerId', async (req: Request, res: Response) => {
  try {
    const { id, printerId } = req.params;
    const { name, type, system_name, status } = req.body;

    await query(
      `UPDATE printers 
       SET name = COALESCE($1, name),
           type = COALESCE($2, type),
           system_name = COALESCE($3, system_name),
           status = COALESCE($4, status)
       WHERE id = $5 AND shop_id = $6`,
      [name, type, system_name, status, printerId, id]
    );

    const printersRes = await query('SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [id]);
    const io = getSocketServer();
    if (io) {
      io.to(`shop:${id}`).emit('printers_updated', printersRes.rows);
    }

    res.json({
      success: true,
      message: 'Printer device updated successfully.',
      printers: printersRes.rows,
    });
  } catch (err: any) {
    console.error('[Shops] Error updating printer device:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a printer device
router.delete('/:id/printers/:printerId', async (req: Request, res: Response) => {
  try {
    const { id, printerId } = req.params;
    await query('DELETE FROM printers WHERE id = $1 AND shop_id = $2', [printerId, id]);

    const printersRes = await query('SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [id]);
    const io = getSocketServer();
    if (io) {
      io.to(`shop:${id}`).emit('printers_updated', printersRes.rows);
    }

    res.json({
      success: true,
      message: 'Printer device removed.',
      printers: printersRes.rows,
    });
  } catch (err: any) {
    console.error('[Shops] Error deleting printer device:', err);
    res.status(500).json({ error: err.message });
  }
});

// Assign machine roles (Color vs Mono)
router.post('/:id/printers/assign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { colorPrinterId, monoPrinterId, assignments } = req.body;

    if (Array.isArray(assignments)) {
      for (const item of assignments) {
        if (item.printerId && (item.type === 'color' || item.type === 'mono')) {
          await query(
            `UPDATE printers SET type = $1 WHERE id = $2 AND shop_id = $3`,
            [item.type, item.printerId, id]
          );
        }
      }
    } else {
      if (colorPrinterId) {
        await query(
          `UPDATE printers SET type = 'color' WHERE id = $1 AND shop_id = $2`,
          [colorPrinterId, id]
        );
      }
      if (monoPrinterId) {
        await query(
          `UPDATE printers SET type = 'mono' WHERE id = $1 AND shop_id = $2`,
          [monoPrinterId, id]
        );
      }
    }

    const printersRes = await query('SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [id]);
    const io = getSocketServer();
    if (io) {
      io.to(`shop:${id}`).emit('printers_updated', printersRes.rows);
    }

    res.json({
      success: true,
      message: 'Printer machine roles assigned successfully.',
      printers: printersRes.rows,
    });
  } catch (err: any) {
    console.error('[Shops] Error assigning printer roles:', err);
    res.status(500).json({ error: err.message });
  }
});

// Detect real connected system printers from host OS
router.get('/:id/printers/system-hardware', async (req: Request, res: Response) => {
  try {
    const isWindows = process.platform === 'win32';
    let systemPrinters: any[] = [];

    if (isWindows) {
      try {
        const cmd = `powershell -NoProfile -Command "Get-Printer | Select-Object Name, Type, DriverName, PrinterStatus | ConvertTo-Json"`;
        const { stdout } = await execAsync(cmd);
        if (stdout && stdout.trim()) {
          const parsed = JSON.parse(stdout);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          systemPrinters = list.map((p: any) => ({
            name: p.Name || 'Unknown Device',
            system_name: p.Name || 'Unknown Device',
            driver: p.DriverName || 'System Spooler Driver',
            status: p.PrinterStatus && p.PrinterStatus.toString().toLowerCase().includes('offline') ? 'offline' : 'online',
          }));
        }
      } catch (execErr) {
        console.warn('[System Printer Detection] PowerShell Get-Printer failed:', execErr);
      }
    } else {
      // Unix / CUPS detection fallback
      try {
        const { stdout } = await execAsync('lpstat -p');
        const lines = stdout.split('\n');
        for (const line of lines) {
          const match = line.match(/^printer (\S+)/);
          if (match) {
            systemPrinters.push({
              name: match[1],
              system_name: match[1],
              driver: 'CUPS Native Driver',
              status: 'online',
            });
          }
        }
      } catch (lpErr) {
        console.warn('[System Printer Detection] lpstat failed:', lpErr);
      }
    }

    // Default virtual fallbacks if none detected
    if (systemPrinters.length === 0) {
      systemPrinters = [
        { name: 'Microsoft Print to PDF', system_name: 'Microsoft Print to PDF', driver: 'PDF Virtual Spooler', status: 'online' },
        { name: 'OneNote for Windows 10', system_name: 'OneNote for Windows 10', driver: 'OneNote Driver', status: 'online' },
      ];
    }

    res.json({
      success: true,
      platform: process.platform,
      printers: systemPrinters,
    });
  } catch (err: any) {
    console.error('[Shops] Error detecting system hardware printers:', err);
    res.status(500).json({ error: err.message });
  }
});

// Direct assignment of a detected host printer to Color or B&W
router.post('/:id/printers/assign-system', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, system_name, type } = req.body;

    if (!system_name || !type) {
      res.status(400).json({ error: 'system_name and type (color or mono) are required.' });
      return;
    }

    const assignedType = type === 'color' ? 'color' : 'mono';
    const friendlyName = name || system_name;

    // Check if printer with this system_name already exists for this shop
    const existing = await query(
      'SELECT id, name, type FROM printers WHERE shop_id = $1 AND system_name = $2',
      [id, system_name]
    );

    let assignedId: string;
    if (existing.rowCount && existing.rowCount > 0) {
      assignedId = existing.rows[0].id;
      await query(
        `UPDATE printers 
         SET type = $1, name = COALESCE($2, name), status = 'online' 
         WHERE id = $3 AND shop_id = $4`,
        [assignedType, friendlyName, assignedId, id]
      );
    } else {
      assignedId = `printer_${uuidv4().substring(0, 8)}`;
      await query(
        `INSERT INTO printers (id, shop_id, name, type, status, system_name)
         VALUES ($1, $2, $3, $4, 'online', $5)`,
        [assignedId, id, friendlyName, assignedType, system_name]
      );
    }

    const printersRes = await query('SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [id]);
    const io = getSocketServer();
    if (io) {
      io.to(`shop:${id}`).emit('printers_updated', printersRes.rows);
    }

    res.json({
      success: true,
      message: `System printer "${system_name}" assigned as ${assignedType === 'color' ? 'Color' : 'B&W'} device.`,
      assignedPrinterId: assignedId,
      printers: printersRes.rows,
    });
  } catch (err: any) {
    console.error('[Shops] Error assigning system printer:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. SERVICES & PRICING CATALOG CRUD
// ==========================================

// List services for a shop
router.get('/:id/services', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const servicesRes = await query(
      'SELECT * FROM shop_services WHERE shop_id = $1 ORDER BY is_default DESC, created_at ASC',
      [id]
    );
    res.json(servicesRes.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add a custom service
router.post('/:id/services', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, category, price, unit, enabled } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Service name is required.' });
      return;
    }

    const srvId = `srv_${uuidv4().substring(0, 8)}`;
    await query(
      `INSERT INTO shop_services (id, shop_id, name, description, category, price, unit, enabled, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)`,
      [
        srvId,
        id,
        name,
        description || '',
        category || 'custom',
        price !== undefined ? Number(price) : 0,
        unit || 'page',
        enabled !== false,
      ]
    );

    const servicesRes = await query(
      'SELECT * FROM shop_services WHERE shop_id = $1 ORDER BY is_default DESC, created_at ASC',
      [id]
    );

    const io = getSocketServer();
    if (io) {
      io.to(`shop:${id}`).emit('services_updated', servicesRes.rows);
      io.emit('shop_pricing_updated', { shopId: id, services: servicesRes.rows });
    }

    res.status(201).json({
      success: true,
      message: 'Custom service added successfully.',
      services: servicesRes.rows,
    });
  } catch (err: any) {
    console.error('[Shops] Error adding service:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update a service (price, enabled/disabled toggle, title, desc)
router.put('/:id/services/:serviceId', async (req: Request, res: Response) => {
  try {
    const { id, serviceId } = req.params;
    const { name, description, category, price, unit, enabled } = req.body;

    const srvCheck = await query('SELECT * FROM shop_services WHERE id = $1 AND shop_id = $2', [serviceId, id]);
    if (srvCheck.rowCount === 0) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }

    const currentSrv = srvCheck.rows[0];
    const newPrice = price !== undefined ? Number(price) : currentSrv.price;
    const newEnabled = enabled !== undefined ? Boolean(enabled) : currentSrv.enabled;

    await query(
      `UPDATE shop_services 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           category = COALESCE($3, category),
           price = $4,
           unit = COALESCE($5, unit),
           enabled = $6
       WHERE id = $7 AND shop_id = $8`,
      [name, description, category, newPrice, unit, newEnabled, serviceId, id]
    );

    // Sync legacy shop price fields if this is a default B&W or Color service
    if (currentSrv.is_default) {
      if (currentSrv.name.toLowerCase().includes('black') || currentSrv.name.toLowerCase().includes('b&w')) {
        await query('UPDATE shops SET price_per_bw = $1 WHERE id = $2', [newPrice, id]);
      } else if (currentSrv.name.toLowerCase().includes('color')) {
        await query('UPDATE shops SET price_per_color = $1 WHERE id = $2', [newPrice, id]);
      }
    }

    const servicesRes = await query(
      'SELECT * FROM shop_services WHERE shop_id = $1 ORDER BY is_default DESC, created_at ASC',
      [id]
    );

    const io = getSocketServer();
    if (io) {
      io.to(`shop:${id}`).emit('services_updated', servicesRes.rows);
      io.emit('shop_pricing_updated', { shopId: id, services: servicesRes.rows });
    }

    res.json({
      success: true,
      message: 'Service updated successfully.',
      services: servicesRes.rows,
    });
  } catch (err: any) {
    console.error('[Shops] Error updating service:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a custom service (default B&W and Color are protected, only togglable)
router.delete('/:id/services/:serviceId', async (req: Request, res: Response) => {
  try {
    const { id, serviceId } = req.params;

    const srvCheck = await query('SELECT * FROM shop_services WHERE id = $1 AND shop_id = $2', [serviceId, id]);
    if (srvCheck.rowCount === 0) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }

    if (srvCheck.rows[0].is_default) {
      res.status(400).json({ error: 'Default services cannot be deleted. You can toggle them active or inactive instead.' });
      return;
    }

    await query('DELETE FROM shop_services WHERE id = $1 AND shop_id = $2', [serviceId, id]);

    const servicesRes = await query(
      'SELECT * FROM shop_services WHERE shop_id = $1 ORDER BY is_default DESC, created_at ASC',
      [id]
    );

    const io = getSocketServer();
    if (io) {
      io.to(`shop:${id}`).emit('services_updated', servicesRes.rows);
      io.emit('shop_pricing_updated', { shopId: id, services: servicesRes.rows });
    }

    res.json({
      success: true,
      message: 'Custom service deleted.',
      services: servicesRes.rows,
    });
  } catch (err: any) {
    console.error('[Shops] Error deleting service:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8. Custom shopkeeper pricing rates (legacy backward-compatible endpoint)
router.put('/:id/pricing', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      price_per_bw,
      price_per_color,
      spiral_price,
      staple_price,
      double_sided_discount,
      custom_rates,
    } = req.body;

    const shopRes = await query('SELECT * FROM shops WHERE id = $1', [id]);
    if (shopRes.rowCount === 0) {
      res.status(404).json({ error: 'Shop not found' });
      return;
    }

    const current = shopRes.rows[0];
    const newBw = price_per_bw !== undefined ? Number(price_per_bw) : current.price_per_bw;
    const newColor = price_per_color !== undefined ? Number(price_per_color) : current.price_per_color;
    const newSpiral = spiral_price !== undefined ? Number(spiral_price) : current.spiral_price;
    const newStaple = staple_price !== undefined ? Number(staple_price) : current.staple_price;
    const newDiscount = double_sided_discount !== undefined ? Number(double_sided_discount) : current.double_sided_discount;
    const newCustomRates = custom_rates !== undefined ? JSON.stringify(custom_rates) : current.custom_rates;

    await query(
      `UPDATE shops 
       SET price_per_bw = $1,
           price_per_color = $2,
           spiral_price = $3,
           staple_price = $4,
           double_sided_discount = $5,
           custom_rates = $6
       WHERE id = $7`,
      [newBw, newColor, newSpiral, newStaple, newDiscount, newCustomRates, id]
    );

    // Sync to shop_services
    if (price_per_bw !== undefined) {
      await query(
        `UPDATE shop_services SET price = $1 WHERE shop_id = $2 AND (name ILIKE '%black%' OR name ILIKE '%b&w%')`,
        [newBw, id]
      );
    }
    if (price_per_color !== undefined) {
      await query(
        `UPDATE shop_services SET price = $1 WHERE shop_id = $2 AND name ILIKE '%color%'`,
        [newColor, id]
      );
    }
    if (spiral_price !== undefined) {
      await query(
        `UPDATE shop_services SET price = $1 WHERE shop_id = $2 AND name ILIKE '%spiral%'`,
        [newSpiral, id]
      );
    }
    if (staple_price !== undefined) {
      await query(
        `UPDATE shop_services SET price = $1 WHERE shop_id = $2 AND name ILIKE '%staple%'`,
        [newStaple, id]
      );
    }

    const updatedShop = await getShopWithDetails(id);

    const io = getSocketServer();
    if (io) {
      io.to(`shop:${id}`).emit('shop_updated', updatedShop);
      io.emit('shop_pricing_updated', updatedShop);
    }

    res.json({
      success: true,
      message: 'Shop pricing configuration updated successfully.',
      shop: updatedShop,
    });
  } catch (err: any) {
    console.error('[Shops] Error updating pricing:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
