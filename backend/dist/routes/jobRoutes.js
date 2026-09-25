"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const db_1 = require("../db");
const queueEngine_1 = require("../redis/queueEngine");
const storageService_1 = require("../services/storageService");
const socketHandler_1 = require("../socket/socketHandler");
const router = (0, express_1.Router)();
// Create a new print job (before payment)
router.post('/', async (req, res) => {
    try {
        const { userId, shopId, fileUrl, fileName, fileSize, pageCount, settings, price, } = req.body;
        if (!userId || !shopId || !fileUrl || !fileName || !price) {
            res.status(400).json({ error: 'Missing required print job fields.' });
            return;
        }
        const jobId = (0, uuid_1.v4)();
        const settingsJson = JSON.stringify(settings || {
            copies: 1,
            color: false,
            duplex: false,
            paperSize: 'A4',
        });
        await (0, db_1.query)(`INSERT INTO print_jobs 
       (id, user_id, shop_id, file_url, file_name, file_size, page_count, settings, status, price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'created', $9)`, [
            jobId,
            userId,
            shopId,
            fileUrl,
            fileName,
            fileSize || 0,
            pageCount || 1,
            settingsJson,
            price,
        ]);
        const jobRes = await (0, db_1.query)('SELECT * FROM print_jobs WHERE id = $1', [jobId]);
        res.status(201).json({ success: true, job: jobRes.rows[0] });
    }
    catch (err) {
        console.error('[Jobs] Error creating print job:', err);
        res.status(500).json({ error: err.message || 'Failed to create job.' });
    }
});
// Get job details & queue position
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const jobRes = await (0, db_1.query)(`SELECT j.*, u.name as user_name, u.phone as user_phone, s.name as shop_name, s.location as shop_location
       FROM print_jobs j
       LEFT JOIN users u ON j.user_id = u.id
       LEFT JOIN shops s ON j.shop_id = s.id
       WHERE j.id = $1`, [id]);
        if (jobRes.rowCount === 0) {
            res.status(404).json({ error: 'Job not found.' });
            return;
        }
        const job = jobRes.rows[0];
        const position = await queueEngine_1.queueEngine.getJobPosition(job.shop_id, job.id);
        const snapshot = await queueEngine_1.queueEngine.getQueueSnapshot(job.shop_id);
        const estimatedWaitMinutes = queueEngine_1.queueEngine.calculateWaitTime(position, job.page_count);
        res.json({
            job,
            position,
            nowServingToken: snapshot.nowServingToken,
            estimatedWaitMinutes,
        });
    }
    catch (err) {
        console.error('[Jobs] Error fetching job:', err);
        res.status(500).json({ error: err.message });
    }
});
// Mark job as Picked Up (triggers auto-deletion of uploaded document)
router.post('/:id/pickup', async (req, res) => {
    try {
        const { id } = req.params;
        const { pickupCode } = req.body;
        const jobRes = await (0, db_1.query)('SELECT * FROM print_jobs WHERE id = $1', [id]);
        if (jobRes.rowCount === 0) {
            res.status(404).json({ error: 'Job not found.' });
            return;
        }
        const job = jobRes.rows[0];
        // Verify pickup code if provided
        if (pickupCode && job.pickup_code && pickupCode.trim() !== job.pickup_code.trim()) {
            res.status(400).json({ error: 'Invalid 4-digit pickup code.' });
            return;
        }
        // Update status to picked_up
        await (0, db_1.query)(`UPDATE print_jobs 
       SET status = 'picked_up', picked_up_at = CURRENT_TIMESTAMP 
       WHERE id = $1`, [id]);
        // Remove file per auto-delete policy upon pickup
        (0, storageService_1.removeFile)(job.file_url);
        await (0, db_1.query)(`UPDATE print_jobs SET file_url = '[DELETED_ON_PICKUP]' WHERE id = $1`, [id]);
        // Dequeue if still in queue
        await queueEngine_1.queueEngine.dequeueJob(job.shop_id, id);
        // Broadcast update
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`job:${id}`).emit('job_status_update', {
                jobId: id,
                status: 'picked_up',
                message: 'Order completed and picked up. Document securely shredded.',
            });
            const snapshot = await queueEngine_1.queueEngine.getQueueSnapshot(job.shop_id);
            io.to(`shop:${job.shop_id}`).emit('queue_updated', snapshot);
        }
        res.json({
            success: true,
            message: 'Job confirmed picked up. File securely deleted.',
        });
    }
    catch (err) {
        console.error('[Jobs] Error confirming pickup:', err);
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
