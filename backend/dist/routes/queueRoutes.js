"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const queueEngine_1 = require("../redis/queueEngine");
const socketHandler_1 = require("../socket/socketHandler");
const router = (0, express_1.Router)();
// Get queue snapshot for a shop
router.get('/:shopId', async (req, res) => {
    try {
        const { shopId } = req.params;
        const snapshot = await queueEngine_1.queueEngine.getQueueSnapshot(shopId);
        res.json(snapshot);
    }
    catch (err) {
        console.error('[Queue] Error fetching snapshot:', err);
        res.status(500).json({ error: err.message });
    }
});
// Admin manual override: Reorder job position
router.post('/:shopId/reorder', async (req, res) => {
    try {
        const { shopId } = req.params;
        const { jobId, newPosition } = req.body;
        if (!jobId || !newPosition) {
            res.status(400).json({ error: 'jobId and newPosition are required.' });
            return;
        }
        await queueEngine_1.queueEngine.reorderJob(shopId, jobId, Number(newPosition));
        const snapshot = await queueEngine_1.queueEngine.getQueueSnapshot(shopId);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${shopId}`).emit('queue_updated', snapshot);
            io.to(`job:${jobId}`).emit('queue_position_changed', {
                jobId,
                newPosition,
                nowServingToken: snapshot.nowServingToken,
            });
        }
        res.json({ success: true, message: `Job moved to position ${newPosition}`, snapshot });
    }
    catch (err) {
        console.error('[Queue] Error reordering job:', err);
        res.status(500).json({ error: err.message });
    }
});
// Admin manual override: Cancel job
router.post('/:shopId/cancel', async (req, res) => {
    try {
        const { shopId } = req.params;
        const { jobId, reason } = req.body;
        if (!jobId) {
            res.status(400).json({ error: 'jobId is required.' });
            return;
        }
        await (0, db_1.query)(`UPDATE print_jobs SET status = 'cancelled', error_message = $1 WHERE id = $2`, [reason || 'Cancelled by shop manager', jobId]);
        await queueEngine_1.queueEngine.dequeueJob(shopId, jobId);
        const snapshot = await queueEngine_1.queueEngine.getQueueSnapshot(shopId);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${shopId}`).emit('queue_updated', snapshot);
            io.to(`job:${jobId}`).emit('job_status_update', {
                jobId,
                status: 'cancelled',
                errorMessage: reason || 'Cancelled by shop manager',
            });
        }
        // Check if next job can now be dispatched
        await (0, socketHandler_1.checkAndDispatchNextJob)(shopId);
        res.json({ success: true, message: 'Job cancelled successfully.' });
    }
    catch (err) {
        console.error('[Queue] Error cancelling job:', err);
        res.status(500).json({ error: err.message });
    }
});
// Admin manual override: Retry a failed/stuck job
router.post('/:shopId/retry', async (req, res) => {
    try {
        const { shopId } = req.params;
        const { jobId } = req.body;
        if (!jobId) {
            res.status(400).json({ error: 'jobId is required.' });
            return;
        }
        await (0, db_1.query)(`UPDATE print_jobs SET status = 'waiting', error_message = NULL WHERE id = $1`, [jobId]);
        await queueEngine_1.queueEngine.enqueuePaidJob(shopId, jobId);
        const snapshot = await queueEngine_1.queueEngine.getQueueSnapshot(shopId);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${shopId}`).emit('queue_updated', snapshot);
            io.to(`job:${jobId}`).emit('job_status_update', {
                jobId,
                status: 'waiting',
                errorMessage: null,
            });
        }
        await (0, socketHandler_1.checkAndDispatchNextJob)(shopId);
        res.json({ success: true, message: 'Job requeued for printing.' });
    }
    catch (err) {
        console.error('[Queue] Error retrying job:', err);
        res.status(500).json({ error: err.message });
    }
});
// Shopkeeper Action: Mark Pay at Counter as Paid
router.post('/:shopId/mark-paid', async (req, res) => {
    try {
        const { shopId } = req.params;
        const { jobId } = req.body;
        if (!jobId) {
            res.status(400).json({ error: 'jobId is required.' });
            return;
        }
        await (0, db_1.query)(`UPDATE print_jobs SET payment_status = 'paid' WHERE id = $1 AND shop_id = $2`, [jobId, shopId]);
        const snapshot = await queueEngine_1.queueEngine.getQueueSnapshot(shopId);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${shopId}`).emit('queue_updated', snapshot);
            io.to(`job:${jobId}`).emit('job_status_update', {
                jobId,
                paymentStatus: 'paid',
                message: 'Payment confirmed at counter by shop manager.',
            });
        }
        res.json({ success: true, message: 'Job payment marked as collected.' });
    }
    catch (err) {
        console.error('[Queue] Error marking job paid:', err);
        res.status(500).json({ error: err.message });
    }
});
// Shopkeeper Action: Mark Job as Ready for Pickup
router.post('/:shopId/ready', async (req, res) => {
    try {
        const { shopId } = req.params;
        const { jobId } = req.body;
        if (!jobId) {
            res.status(400).json({ error: 'jobId is required.' });
            return;
        }
        const jobRes = await (0, db_1.query)('SELECT * FROM print_jobs WHERE id = $1 AND shop_id = $2', [jobId, shopId]);
        if (jobRes.rowCount === 0) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        const job = jobRes.rows[0];
        await (0, db_1.query)(`UPDATE print_jobs SET status = 'ready', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
        await queueEngine_1.queueEngine.dequeueJob(shopId, jobId);
        const snapshot = await queueEngine_1.queueEngine.getQueueSnapshot(shopId);
        const io = (0, socketHandler_1.getSocketServer)();
        if (io) {
            io.to(`shop:${shopId}`).emit('queue_updated', snapshot);
            io.to(`job:${jobId}`).emit('job_status_update', {
                jobId,
                status: 'ready',
                pickupCode: job.pickup_code,
                message: 'Your documents are printed and ready for pickup at the counter!',
            });
        }
        // Check if next job can be dispatched
        await (0, socketHandler_1.checkAndDispatchNextJob)(shopId);
        res.json({ success: true, message: 'Job marked ready for pickup.', pickupCode: job.pickup_code });
    }
    catch (err) {
        console.error('[Queue] Error marking job ready:', err);
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
