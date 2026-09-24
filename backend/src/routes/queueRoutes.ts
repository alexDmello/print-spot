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

export default router;
