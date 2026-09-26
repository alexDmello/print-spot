"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const child_process_1 = require("child_process");
const util_1 = __importDefault(require("util"));
const db_1 = require("../db");
const queueEngine_1 = require("../redis/queueEngine");
const socketHandler_1 = require("../socket/socketHandler");
const shopAuthService_1 = require("../services/shopAuthService");
const printerFilter_1 = require("../utils/printerFilter");
const execAsync = util_1.default.promisify(child_process_1.exec);
const router = (0, express_1.Router)();
// Helper to fetch full shop details (supports both ID and Subdomain Slug)
async function getShopWithDetails(idOrSlug) {
    const shopRes = await (0, db_1.query)('SELECT * FROM shops WHERE id = $1 OR slug = $1', [idOrSlug]);
    if (shopRes.rowCount === 0)
        return null;
    const rawShop = shopRes.rows[0];
    const shopId = rawShop.id;
    const { password_hash, pin, ...shop } = rawShop;
    const printersRes = await (0, db_1.query)('SELECT id, shop_id, name, type, status, system_name, created_at FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [shopId]);
    const servicesRes = await (0, db_1.query)('SELECT id, shop_id, name, description, category, price, unit, enabled, is_default, created_at FROM shop_services WHERE shop_id = $1 ORDER BY is_default DESC, created_at ASC', [shopId]);
    const snapshot = await queueEngine_1.queueEngine.getQueueSnapshot(shopId);
    return {
        ...shop,
        printers: printersRes.rows,
        services: servicesRes.rows,
        nowServingToken: snapshot.nowServingToken,
        totalWaiting: snapshot.totalWaiting,
    };
}
// ==========================================
// SHOP AUTHENTICATION & SESSION PERSISTENCE
// ==========================================
// Shopkeeper Login (Phone/ID + PIN/Password)
router.post('/login', async (req, res) => {
    try {
        const { identifier, secret, phone, pin, password } = req.body;
        const loginId = identifier || phone || '';
        const loginSecret = secret || pin || password || '';
        const result = await (0, shopAuthService_1.loginShop)(loginId, loginSecret);
        res.json(result);
    }
    catch (err) {
        res.status(401).json({ error: err.message || 'Login failed.' });
    }
});
// Authenticated Shopkeeper Session Check & Full Dashboard Data
router.get('/me', shopAuthService_1.shopAuthMiddleware, async (req, res) => {
    try {
        const shopId = req.shop?.shopId;
        if (!shopId) {
            res.status(401).json({ error: 'Shop session not found.' });
            return;
        }
        const shopDetails = await getShopWithDetails(shopId);
        if (!shopDetails) {
            res.status(404).json({ error: 'Shop not found.' });
            return;
        }
        res.json({ shop: shopDetails });
    }
    catch (err) {
        console.error('[Shop /me] Error:', err);
        res.status(500).json({ error: err.message });
    }
});
// Public Counter Verification (for Customer QR Scan)
router.get('/:id/public', async (req, res) => {
    try {
        const { id } = req.params;
        const shop = await getShopWithDetails(id);
        if (!shop) {
            res.status(404).json({ error: 'No print counter exists with this QR code.' });
            return;
        }
        if (!shop.is_active) {
            res.status(403).json({
                error: 'This print counter has been deactivated or suspended.',
                shopName: shop.name,
            });
            return;
        }
        res.json({
            shop: {
                id: shop.id,
                name: shop.name,
                slug: shop.slug,
                location: shop.location,
                address: shop.address,
                opening_time: shop.opening_time,
                closing_time: shop.closing_time,
                working_days: shop.working_days,
                upi_id: shop.upi_id,
                price_per_bw: shop.price_per_bw,
                price_per_color: shop.price_per_color,
                is_open: shop.is_open,
                printers: shop.printers,
                services: shop.services,
                nowServingToken: shop.nowServingToken,
                totalWaiting: shop.totalWaiting,
            },
        });
    }
    catch (err) {
        console.error('[Shop Public] Error:', err);
        res.status(500).json({ error: err.message });
    }
});
// Liveness & Counter Availability Check (Phase 2B)
router.get('/:id/availability', async (req, res) => {
    try {
        const { id } = req.params;
        const shop = await getShopWithDetails(id);
        if (!shop)
            return res.status(404).json({ available: false, reason: 'Shop not found.' });
        if (!shop.is_active)
            return res.json({ available: false, reason: 'This print counter is currently deactivated.' });
        if (!shop.is_open)
            return res.json({ available: false, reason: 'This print counter is currently closed.' });
        const live = (0, socketHandler_1.isShopLive)(shop.id);
        if (!live)
            return res.json({ available: false, reason: 'Counter station is currently offline. Connect physical printer and keep counter dashboard open.' });
        return res.json({ available: true, shopName: shop.name });
    }
    catch (err) {
        console.error('[Shop Availability] Error checking shop availability:', err);
        res.status(500).json({ available: false, error: err.message });
    }
});
// Toggle Shop Open / Paused State
router.put('/:id/toggle-open', shopAuthService_1.shopAuthMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_open } = req.body;
        // Verify authorized to manage this shop
        if (req.shop.role !== 'admin' && req.shop.shopId !== id) {
            res.status(403).json({ error: 'Unauthorized to modify this shop counter.' });
            return;
        }
        const currentShop = await (0, db_1.query)('SELECT is_open FROM shops WHERE id = $1', [id]);
        if (currentShop.rowCount === 0) {
            res.status(404).json({ error: 'Shop not found' });
            return;
        }
        const newOpenState = is_open !== undefined ? Boolean(is_open) : !currentShop.rows[0].is_open;
        await (0, db_1.query)('UPDATE shops SET is_open = $1 WHERE id = $2', [newOpenState, id]);
        const updatedShop = await getShopWithDetails(id);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${id}`).emit('shop_open_status_changed', { shopId: id, is_open: newOpenState });
            io.emit('shop_updated', updatedShop);
        }
        res.json({
            success: true,
            message: `Shop counter is now ${newOpenState ? 'Open for orders' : 'Paused / Closed'}.`,
            is_open: newOpenState,
            shop: updatedShop,
        });
    }
    catch (err) {
        console.error('[Shop Toggle Open] Error:', err);
        res.status(500).json({ error: err.message });
    }
});
// 1. List all shops
router.get('/', async (_req, res) => {
    try {
        const shopsRes = await (0, db_1.query)('SELECT * FROM shops ORDER BY created_at ASC');
        const shopsWithDetails = [];
        for (const shop of shopsRes.rows) {
            const printersRes = await (0, db_1.query)('SELECT id, shop_id, name, type, status, system_name, created_at FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [shop.id]);
            const servicesRes = await (0, db_1.query)('SELECT id, shop_id, name, description, category, price, unit, enabled, is_default, created_at FROM shop_services WHERE shop_id = $1 ORDER BY is_default DESC, created_at ASC', [shop.id]);
            const snapshot = await queueEngine_1.queueEngine.getQueueSnapshot(shop.id);
            shopsWithDetails.push({
                ...shop,
                printers: printersRes.rows,
                services: servicesRes.rows,
                nowServingToken: snapshot.nowServingToken,
                totalWaiting: snapshot.totalWaiting,
            });
        }
        res.json(shopsWithDetails);
    }
    catch (err) {
        console.error('[Shops] Error fetching shops:', err);
        res.status(500).json({ error: err.message });
    }
});
// 2. Public Shop Self-Onboarding Disabled
// Shop onboarding is restricted exclusively to the Platform Super Admin (/api/admin/shops)
router.post('/onboard', (_req, res) => {
    res.status(403).json({
        error: 'Public shop self-onboarding is disabled. All print counters must be onboarded through the Super Admin Portal (/admin).',
    });
});
// 3. Single shop info
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const shop = await getShopWithDetails(id);
        if (!shop) {
            res.status(404).json({ error: 'Shop not found' });
            return;
        }
        res.json(shop);
    }
    catch (err) {
        console.error('[Shops] Error fetching shop:', err);
        res.status(500).json({ error: err.message });
    }
});
// 4. Update Shop Profile & Location Details
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, location, address, latitude, longitude, owner_name, owner_phone, owner_email, opening_time, closing_time, working_days, upi_id, } = req.body;
        const shopRes = await (0, db_1.query)('SELECT * FROM shops WHERE id = $1', [id]);
        if (shopRes.rowCount === 0) {
            res.status(404).json({ error: 'Shop not found' });
            return;
        }
        const current = shopRes.rows[0];
        await (0, db_1.query)(`UPDATE shops 
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
       WHERE id = $13`, [
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
        ]);
        const updatedShop = await getShopWithDetails(id);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${id}`).emit('shop_updated', updatedShop);
            io.emit('shop_profile_updated', updatedShop);
        }
        res.json({
            success: true,
            message: 'Shop profile updated successfully.',
            shop: updatedShop,
        });
    }
    catch (err) {
        console.error('[Shops] Error updating shop profile:', err);
        res.status(500).json({ error: err.message });
    }
});
// 5. Daily metrics for Admin Panel
router.get('/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;
        const todayStats = await (0, db_1.query)(`SELECT 
         COUNT(*) as completed_count,
         COALESCE(SUM(price), 0) as total_revenue,
         COALESCE(SUM(page_count * (settings->>'copies')::int), 0) as total_sheets
       FROM print_jobs 
       WHERE shop_id = $1 
         AND status IN ('ready', 'picked_up') 
         AND (completed_at >= CURRENT_DATE OR created_at >= CURRENT_DATE)`, [id]);
        const queueStats = await (0, db_1.query)(`SELECT 
         COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting_count,
         COUNT(CASE WHEN status = 'printing' THEN 1 END) as printing_count,
         COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
       FROM print_jobs 
       WHERE shop_id = $1 AND status IN ('waiting', 'printing', 'failed')`, [id]);
        const printersRes = await (0, db_1.query)(`SELECT id, name, type, status, system_name FROM printers WHERE shop_id = $1`, [id]);
        const revenueBreakdown = await (0, db_1.query)(`SELECT 
         COALESCE(SUM(CASE WHEN payment_method IN ('counter_cash') THEN price ELSE 0 END), 0) as cash_revenue,
         COALESCE(SUM(CASE WHEN payment_method NOT IN ('counter_cash') THEN price ELSE 0 END), 0) as online_revenue,
         COALESCE(SUM(platform_fee), 0) as platform_fees_today
       FROM print_jobs 
       WHERE shop_id = $1 
         AND status IN ('ready', 'picked_up', 'waiting', 'printing') 
         AND (completed_at >= CURRENT_DATE OR created_at >= CURRENT_DATE)`, [id]);
        const shopRes = await (0, db_1.query)('SELECT unsettled_cash_fee FROM shops WHERE id = $1', [id]);
        const unsettledCashFee = parseFloat(shopRes.rows[0]?.unsettled_cash_fee || '0');
        const stats = todayStats.rows[0] || {};
        const qStats = queueStats.rows[0] || {};
        const rev = revenueBreakdown.rows[0] || {};
        const cashRev = parseFloat(rev.cash_revenue || '0');
        const onlineRev = parseFloat(rev.online_revenue || '0');
        const totalRev = parseFloat(stats.total_revenue || '0') || (cashRev + onlineRev);
        const platformFeesToday = parseFloat(rev.platform_fees_today || '0');
        const shopNetPayoutToday = Math.max(0, totalRev - platformFeesToday);
        res.json({
            completedJobsToday: parseInt(stats.completed_count || '0', 10),
            revenueToday: totalRev,
            pagesPrintedToday: parseInt(stats.total_sheets || '0', 10),
            waitingJobs: parseInt(qStats.waiting_count || '0', 10),
            printingJobs: parseInt(qStats.printing_count || '0', 10),
            failedJobs: parseInt(qStats.failed_count || '0', 10),
            cashRevenueToday: cashRev,
            onlineRevenueToday: onlineRev,
            totalRevenueToday: totalRev,
            platformFeesToday: platformFeesToday,
            unsettledCashFee: unsettledCashFee,
            shopNetPayoutToday: shopNetPayoutToday,
            printers: printersRes.rows,
        });
    }
    catch (err) {
        console.error('[Shops] Error fetching shop stats:', err);
        res.status(500).json({ error: err.message });
    }
});
// ==========================================
// 6. MULTI-DEVICE / PRINTER MANAGEMENT CRUD
// ==========================================
// List printers for a shop
router.get('/:id/printers', async (req, res) => {
    try {
        const { id } = req.params;
        const resPrinters = await (0, db_1.query)('SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [id]);
        res.json(resPrinters.rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Add a new device/printer
router.post('/:id/printers', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, system_name, status } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Device name is required.' });
            return;
        }
        const printerId = `printer_${(0, uuid_1.v4)().substring(0, 8)}`;
        await (0, db_1.query)(`INSERT INTO printers (id, shop_id, name, type, status, system_name)
       VALUES ($1, $2, $3, $4, $5, $6)`, [
            printerId,
            id,
            name,
            type === 'color' ? 'color' : 'mono',
            status || 'online',
            system_name || 'Microsoft Print to PDF',
        ]);
        const printersRes = await (0, db_1.query)('SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [id]);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${id}`).emit('printers_updated', printersRes.rows);
        }
        res.status(201).json({
            success: true,
            message: 'New printer device registered successfully.',
            printers: printersRes.rows,
        });
    }
    catch (err) {
        console.error('[Shops] Error adding printer device:', err);
        res.status(500).json({ error: err.message });
    }
});
// Update printer device (status, target name, type)
router.put('/:id/printers/:printerId', async (req, res) => {
    try {
        const { id, printerId } = req.params;
        const { name, type, system_name, status } = req.body;
        await (0, db_1.query)(`UPDATE printers 
       SET name = COALESCE($1, name),
           type = COALESCE($2, type),
           system_name = COALESCE($3, system_name),
           status = COALESCE($4, status)
       WHERE id = $5 AND shop_id = $6`, [name, type, system_name, status, printerId, id]);
        const printersRes = await (0, db_1.query)('SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [id]);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${id}`).emit('printers_updated', printersRes.rows);
        }
        res.json({
            success: true,
            message: 'Printer device updated successfully.',
            printers: printersRes.rows,
        });
    }
    catch (err) {
        console.error('[Shops] Error updating printer device:', err);
        res.status(500).json({ error: err.message });
    }
});
// Delete a printer device
router.delete('/:id/printers/:printerId', async (req, res) => {
    try {
        const { id, printerId } = req.params;
        await (0, db_1.query)('DELETE FROM printers WHERE id = $1 AND shop_id = $2', [printerId, id]);
        const printersRes = await (0, db_1.query)('SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [id]);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${id}`).emit('printers_updated', printersRes.rows);
        }
        res.json({
            success: true,
            message: 'Printer device removed.',
            printers: printersRes.rows,
        });
    }
    catch (err) {
        console.error('[Shops] Error deleting printer device:', err);
        res.status(500).json({ error: err.message });
    }
});
// Assign machine roles (Color vs Mono)
router.post('/:id/printers/assign', async (req, res) => {
    try {
        const { id } = req.params;
        const { colorPrinterId, monoPrinterId, assignments } = req.body;
        if (Array.isArray(assignments)) {
            for (const item of assignments) {
                if (item.printerId && (item.type === 'color' || item.type === 'mono')) {
                    await (0, db_1.query)(`UPDATE printers SET type = $1 WHERE id = $2 AND shop_id = $3`, [item.type, item.printerId, id]);
                }
            }
        }
        else {
            if (colorPrinterId) {
                await (0, db_1.query)(`UPDATE printers SET type = 'color' WHERE id = $1 AND shop_id = $2`, [colorPrinterId, id]);
            }
            if (monoPrinterId) {
                await (0, db_1.query)(`UPDATE printers SET type = 'mono' WHERE id = $1 AND shop_id = $2`, [monoPrinterId, id]);
            }
        }
        const printersRes = await (0, db_1.query)('SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [id]);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${id}`).emit('printers_updated', printersRes.rows);
        }
        res.json({
            success: true,
            message: 'Printer machine roles assigned successfully.',
            printers: printersRes.rows,
        });
    }
    catch (err) {
        console.error('[Shops] Error assigning printer roles:', err);
        res.status(500).json({ error: err.message });
    }
});
// Detect real connected system printers from host OS
router.get('/:id/printers/system-hardware', async (req, res) => {
    try {
        const isWindows = process.platform === 'win32';
        let systemPrinters = [];
        if (isWindows) {
            try {
                const cmd = `powershell -NoProfile -Command "Get-Printer | Select-Object Name, Type, DriverName, PortName, PrinterStatus | ConvertTo-Json"`;
                const { stdout } = await execAsync(cmd);
                if (stdout && stdout.trim()) {
                    const parsed = JSON.parse(stdout);
                    const list = Array.isArray(parsed) ? parsed : [parsed];
                    const physicalList = list.filter((p) => !(0, printerFilter_1.isVirtualPrinter)(p.Name, p.DriverName, p.PortName));
                    systemPrinters = physicalList.map((p) => ({
                        name: p.Name || 'Unknown Device',
                        system_name: p.Name || 'Unknown Device',
                        driver: p.DriverName || 'System Spooler Driver',
                        port: p.PortName || '',
                        status: p.PrinterStatus && p.PrinterStatus.toString().toLowerCase().includes('offline') ? 'offline' : 'online',
                    }));
                }
            }
            catch (execErr) {
                console.warn('[System Printer Detection] PowerShell Get-Printer failed:', execErr);
            }
        }
        else {
            // Unix / CUPS detection fallback
            try {
                const { stdout } = await execAsync('lpstat -p');
                const lines = stdout.split('\n');
                for (const line of lines) {
                    const match = line.match(/^printer (\S+)/);
                    if (match) {
                        const name = match[1];
                        if (!(0, printerFilter_1.isVirtualPrinter)(name)) {
                            systemPrinters.push({
                                name,
                                system_name: name,
                                driver: 'CUPS Native Driver',
                                port: 'cups',
                                status: 'online',
                            });
                        }
                    }
                }
            }
            catch (lpErr) {
                console.warn('[System Printer Detection] lpstat failed:', lpErr);
            }
        }
        res.json({
            success: true,
            platform: process.platform,
            printers: systemPrinters,
            message: systemPrinters.length === 0 ? 'No physical printers detected.' : undefined,
        });
    }
    catch (err) {
        console.error('[Shops] Error detecting system hardware printers:', err);
        res.status(500).json({ error: err.message });
    }
});
// Direct assignment of a detected host printer to Color or B&W
router.post('/:id/printers/assign-system', async (req, res) => {
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
        const existing = await (0, db_1.query)('SELECT id, name, type FROM printers WHERE shop_id = $1 AND system_name = $2', [id, system_name]);
        let assignedId;
        if (existing.rowCount && existing.rowCount > 0) {
            assignedId = existing.rows[0].id;
            await (0, db_1.query)(`UPDATE printers 
         SET type = $1, name = COALESCE($2, name), status = 'online' 
         WHERE id = $3 AND shop_id = $4`, [assignedType, friendlyName, assignedId, id]);
        }
        else {
            assignedId = `printer_${(0, uuid_1.v4)().substring(0, 8)}`;
            await (0, db_1.query)(`INSERT INTO printers (id, shop_id, name, type, status, system_name)
         VALUES ($1, $2, $3, $4, 'online', $5)`, [assignedId, id, friendlyName, assignedType, system_name]);
        }
        const printersRes = await (0, db_1.query)('SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at ASC', [id]);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${id}`).emit('printers_updated', printersRes.rows);
        }
        res.json({
            success: true,
            message: `System printer "${system_name}" assigned as ${assignedType === 'color' ? 'Color' : 'B&W'} device.`,
            assignedPrinterId: assignedId,
            printers: printersRes.rows,
        });
    }
    catch (err) {
        console.error('[Shops] Error assigning system printer:', err);
        res.status(500).json({ error: err.message });
    }
});
// ==========================================
// 7. SERVICES & PRICING CATALOG CRUD
// ==========================================
// List services for a shop
router.get('/:id/services', async (req, res) => {
    try {
        const { id } = req.params;
        const servicesRes = await (0, db_1.query)('SELECT * FROM shop_services WHERE shop_id = $1 ORDER BY is_default DESC, created_at ASC', [id]);
        res.json(servicesRes.rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Add a custom service
router.post('/:id/services', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, category, price, unit, enabled } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Service name is required.' });
            return;
        }
        const srvId = `srv_${(0, uuid_1.v4)().substring(0, 8)}`;
        await (0, db_1.query)(`INSERT INTO shop_services (id, shop_id, name, description, category, price, unit, enabled, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)`, [
            srvId,
            id,
            name,
            description || '',
            category || 'custom',
            price !== undefined ? Number(price) : 0,
            unit || 'page',
            enabled !== false,
        ]);
        const servicesRes = await (0, db_1.query)('SELECT * FROM shop_services WHERE shop_id = $1 ORDER BY is_default DESC, created_at ASC', [id]);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${id}`).emit('services_updated', servicesRes.rows);
            io.emit('shop_pricing_updated', { shopId: id, services: servicesRes.rows });
        }
        res.status(201).json({
            success: true,
            message: 'Custom service added successfully.',
            services: servicesRes.rows,
        });
    }
    catch (err) {
        console.error('[Shops] Error adding service:', err);
        res.status(500).json({ error: err.message });
    }
});
// Update a service (price, enabled/disabled toggle, title, desc)
router.put('/:id/services/:serviceId', async (req, res) => {
    try {
        const { id, serviceId } = req.params;
        const { name, description, category, price, unit, enabled } = req.body;
        const srvCheck = await (0, db_1.query)('SELECT * FROM shop_services WHERE id = $1 AND shop_id = $2', [serviceId, id]);
        if (srvCheck.rowCount === 0) {
            res.status(404).json({ error: 'Service not found.' });
            return;
        }
        const currentSrv = srvCheck.rows[0];
        const newPrice = price !== undefined ? Number(price) : currentSrv.price;
        const newEnabled = enabled !== undefined ? Boolean(enabled) : currentSrv.enabled;
        await (0, db_1.query)(`UPDATE shop_services 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           category = COALESCE($3, category),
           price = $4,
           unit = COALESCE($5, unit),
           enabled = $6
       WHERE id = $7 AND shop_id = $8`, [name, description, category, newPrice, unit, newEnabled, serviceId, id]);
        // Sync legacy shop price fields if this is a default B&W or Color service
        if (currentSrv.is_default) {
            if (currentSrv.name.toLowerCase().includes('black') || currentSrv.name.toLowerCase().includes('b&w')) {
                await (0, db_1.query)('UPDATE shops SET price_per_bw = $1 WHERE id = $2', [newPrice, id]);
            }
            else if (currentSrv.name.toLowerCase().includes('color')) {
                await (0, db_1.query)('UPDATE shops SET price_per_color = $1 WHERE id = $2', [newPrice, id]);
            }
        }
        const servicesRes = await (0, db_1.query)('SELECT * FROM shop_services WHERE shop_id = $1 ORDER BY is_default DESC, created_at ASC', [id]);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${id}`).emit('services_updated', servicesRes.rows);
            io.emit('shop_pricing_updated', { shopId: id, services: servicesRes.rows });
        }
        res.json({
            success: true,
            message: 'Service updated successfully.',
            services: servicesRes.rows,
        });
    }
    catch (err) {
        console.error('[Shops] Error updating service:', err);
        res.status(500).json({ error: err.message });
    }
});
// Delete a custom service (default B&W and Color are protected, only togglable)
router.delete('/:id/services/:serviceId', async (req, res) => {
    try {
        const { id, serviceId } = req.params;
        const srvCheck = await (0, db_1.query)('SELECT * FROM shop_services WHERE id = $1 AND shop_id = $2', [serviceId, id]);
        if (srvCheck.rowCount === 0) {
            res.status(404).json({ error: 'Service not found.' });
            return;
        }
        if (srvCheck.rows[0].is_default) {
            res.status(400).json({ error: 'Default services cannot be deleted. You can toggle them active or inactive instead.' });
            return;
        }
        await (0, db_1.query)('DELETE FROM shop_services WHERE id = $1 AND shop_id = $2', [serviceId, id]);
        const servicesRes = await (0, db_1.query)('SELECT * FROM shop_services WHERE shop_id = $1 ORDER BY is_default DESC, created_at ASC', [id]);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${id}`).emit('services_updated', servicesRes.rows);
            io.emit('shop_pricing_updated', { shopId: id, services: servicesRes.rows });
        }
        res.json({
            success: true,
            message: 'Custom service deleted.',
            services: servicesRes.rows,
        });
    }
    catch (err) {
        console.error('[Shops] Error deleting service:', err);
        res.status(500).json({ error: err.message });
    }
});
// 8. Custom shopkeeper pricing rates (legacy backward-compatible endpoint)
router.put('/:id/pricing', async (req, res) => {
    try {
        const { id } = req.params;
        const { price_per_bw, price_per_color, spiral_price, staple_price, double_sided_discount, custom_rates, } = req.body;
        const shopRes = await (0, db_1.query)('SELECT * FROM shops WHERE id = $1', [id]);
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
        await (0, db_1.query)(`UPDATE shops 
       SET price_per_bw = $1,
           price_per_color = $2,
           spiral_price = $3,
           staple_price = $4,
           double_sided_discount = $5,
           custom_rates = $6
       WHERE id = $7`, [newBw, newColor, newSpiral, newStaple, newDiscount, newCustomRates, id]);
        // Sync to shop_services
        if (price_per_bw !== undefined) {
            await (0, db_1.query)(`UPDATE shop_services SET price = $1 WHERE shop_id = $2 AND (name ILIKE '%black%' OR name ILIKE '%b&w%')`, [newBw, id]);
        }
        if (price_per_color !== undefined) {
            await (0, db_1.query)(`UPDATE shop_services SET price = $1 WHERE shop_id = $2 AND name ILIKE '%color%'`, [newColor, id]);
        }
        if (spiral_price !== undefined) {
            await (0, db_1.query)(`UPDATE shop_services SET price = $1 WHERE shop_id = $2 AND name ILIKE '%spiral%'`, [newSpiral, id]);
        }
        if (staple_price !== undefined) {
            await (0, db_1.query)(`UPDATE shop_services SET price = $1 WHERE shop_id = $2 AND name ILIKE '%staple%'`, [newStaple, id]);
        }
        const updatedShop = await getShopWithDetails(id);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${id}`).emit('shop_updated', updatedShop);
            io.emit('shop_pricing_updated', updatedShop);
        }
        res.json({
            success: true,
            message: 'Shop pricing configuration updated successfully.',
            shop: updatedShop,
        });
    }
    catch (err) {
        console.error('[Shops] Error updating pricing:', err);
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
