import { Router, Request, Response } from 'express';
import { query } from '../db';
import { queueEngine } from '../redis/queueEngine';
import { getSocketServer, checkAndDispatchNextJob } from '../socket/socketHandler';

const router = Router();

// Get queue snapshot for a shop
router.get('/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const snapshot = await queueEngine.getQueueSnapshot(shopId);
    res.json(snapshot);
  } catch (err: any) {
    console.error('[Queue] Error fetching snapshot:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin manual override: Reorder job position
router.post('/:shopId/reorder', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { jobId, newPosition } = req.body;

    if (!jobId || !newPosition) {
      res.status(400).json({ error: 'jobId and newPosition are required.' });
      return;
    }

    await queueEngine.reorderJob(shopId, jobId, Number(newPosition));
    const snapshot = await queueEngine.getQueueSnapshot(shopId);

    const io = getSocketServer();
    if (io) {
      io.to(`shop:${shopId}`).emit('queue_updated', snapshot);
      io.to(`job:${jobId}`).emit('queue_position_changed', {
        jobId,
        newPosition,
        nowServingToken: snapshot.nowServingToken,
      });
    }

    res.json({ success: true, message: `Job moved to position ${newPosition}`, snapshot });
  } catch (err: any) {
    console.error('[Queue] Error reordering job:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin manual override: Cancel job
router.post('/:shopId/cancel', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { jobId, reason } = req.body;

    if (!jobId) {
      res.status(400).json({ error: 'jobId is required.' });
      return;
    }

    await query(
      `UPDATE print_jobs SET status = 'cancelled', error_message = $1 WHERE id = $2`,
      [reason || 'Cancelled by shop manager', jobId]
    );

    await queueEngine.dequeueJob(shopId, jobId);
    const snapshot = await queueEngine.getQueueSnapshot(shopId);

    const io = getSocketServer();
    if (io) {
      io.to(`shop:${shopId}`).emit('queue_updated', snapshot);
      io.to(`job:${jobId}`).emit('job_status_update', {
        jobId,
        status: 'cancelled',
        errorMessage: reason || 'Cancelled by shop manager',
      });
    }

    // Check if next job can now be dispatched
    await checkAndDispatchNextJob(shopId);

    res.json({ success: true, message: 'Job cancelled successfully.' });
  } catch (err: any) {
    console.error('[Queue] Error cancelling job:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin manual override: Retry a failed/stuck job
router.post('/:shopId/retry', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { jobId } = req.body;

    if (!jobId) {
      res.status(400).json({ error: 'jobId is required.' });
      return;
    }

    await query(
      `UPDATE print_jobs SET status = 'waiting', error_message = NULL WHERE id = $1`,
      [jobId]
    );

    await queueEngine.enqueuePaidJob(shopId, jobId);
    const snapshot = await queueEngine.getQueueSnapshot(shopId);

    const io = getSocketServer();
    if (io) {
      io.to(`shop:${shopId}`).emit('queue_updated', snapshot);
      io.to(`job:${jobId}`).emit('job_status_update', {
        jobId,
        status: 'waiting',
        errorMessage: null,
      });
    }

    await checkAndDispatchNextJob(shopId);

    res.json({ success: true, message: 'Job requeued for printing.' });
  } catch (err: any) {
    console.error('[Queue] Error retrying job:', err);
    res.status(500).json({ error: err.message });
  }
});

// Shopkeeper Action: Mark Pay at Counter as Paid
router.post('/:shopId/mark-paid', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { jobId } = req.body;

    if (!jobId) {
      res.status(400).json({ error: 'jobId is required.' });
      return;
    }

    await query(
      `UPDATE print_jobs SET payment_status = 'paid' WHERE id = $1 AND shop_id = $2`,
      [jobId, shopId]
    );

    const snapshot = await queueEngine.getQueueSnapshot(shopId);
    const io = getSocketServer();
    if (io) {
      io.to(`shop:${shopId}`).emit('queue_updated', snapshot);
      io.to(`job:${jobId}`).emit('job_status_update', {
        jobId,
        paymentStatus: 'paid',
        message: 'Payment confirmed at counter by shop manager.',
      });
    }

    res.json({ success: true, message: 'Job payment marked as collected.' });
  } catch (err: any) {
    console.error('[Queue] Error marking job paid:', err);
    res.status(500).json({ error: err.message });
  }
});

// Shopkeeper Action: Mark Job as Ready for Pickup
router.post('/:shopId/ready', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { jobId } = req.body;

    if (!jobId) {
      res.status(400).json({ error: 'jobId is required.' });
      return;
    }

    const jobRes = await query('SELECT * FROM print_jobs WHERE id = $1 AND shop_id = $2', [jobId, shopId]);
    if (jobRes.rowCount === 0) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const job = jobRes.rows[0];

    await query(
      `UPDATE print_jobs SET status = 'ready', completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [jobId]
    );

    await queueEngine.dequeueJob(shopId, jobId);
    const snapshot = await queueEngine.getQueueSnapshot(shopId);

    const io = getSocketServer();
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
    await checkAndDispatchNextJob(shopId);

    res.json({ success: true, message: 'Job marked ready for pickup.', pickupCode: job.pickup_code });
  } catch (err: any) {
    console.error('[Queue] Error marking job ready:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

