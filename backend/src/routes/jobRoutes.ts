import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db';
import { queueEngine } from '../redis/queueEngine';
import { removeFile } from '../services/storageService';
import { getSocketServer } from '../socket/socketHandler';

const router = Router();

// Create a new print job (before payment)
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      userId,
      shopId,
      fileUrl,
      fileName,
      fileSize,
      pageCount,
      settings,
      price,
    } = req.body;

    if (!userId || !shopId || !fileUrl || !fileName || !price) {
      res.status(400).json({ error: 'Missing required print job fields.' });
      return;
    }

    const jobId = uuidv4();
    const settingsJson = JSON.stringify(settings || {
      copies: 1,
      color: false,
      duplex: false,
      paperSize: 'A4',
    });

    await query(
      `INSERT INTO print_jobs 
       (id, user_id, shop_id, file_url, file_name, file_size, page_count, settings, status, price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'created', $9)`,
      [
        jobId,
        userId,
        shopId,
        fileUrl,
        fileName,
        fileSize || 0,
        pageCount || 1,
        settingsJson,
        price,
      ]
    );

    const jobRes = await query('SELECT * FROM print_jobs WHERE id = $1', [jobId]);
    res.status(201).json({ success: true, job: jobRes.rows[0] });
  } catch (err: any) {
    console.error('[Jobs] Error creating print job:', err);
    res.status(500).json({ error: err.message || 'Failed to create job.' });
  }
});

// Get job details & queue position
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const jobRes = await query(
      `SELECT j.*, u.name as user_name, u.phone as user_phone, s.name as shop_name, s.location as shop_location
       FROM print_jobs j
       LEFT JOIN users u ON j.user_id = u.id
       LEFT JOIN shops s ON j.shop_id = s.id
       WHERE j.id = $1`,
      [id]
    );

    if (jobRes.rowCount === 0) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }

    const job = jobRes.rows[0];
    const position = await queueEngine.getJobPosition(job.shop_id, job.id);
    const snapshot = await queueEngine.getQueueSnapshot(job.shop_id);
    const estimatedWaitMinutes = queueEngine.calculateWaitTime(position, job.page_count);

    res.json({
      job,
      position,
      nowServingToken: snapshot.nowServingToken,
      estimatedWaitMinutes,
    });
  } catch (err: any) {
    console.error('[Jobs] Error fetching job:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mark job as Picked Up (triggers auto-deletion of uploaded document)
router.post('/:id/pickup', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { pickupCode } = req.body;

    const jobRes = await query('SELECT * FROM print_jobs WHERE id = $1', [id]);
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
    await query(
      `UPDATE print_jobs 
       SET status = 'picked_up', picked_up_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [id]
    );

    // Remove file per auto-delete policy upon pickup
    removeFile(job.file_url);
    await query(`UPDATE print_jobs SET file_url = '[DELETED_ON_PICKUP]' WHERE id = $1`, [id]);

    // Dequeue if still in queue
    await queueEngine.dequeueJob(job.shop_id, id);

    // Broadcast update
    const io = getSocketServer();
    if (io) {
      io.to(`job:${id}`).emit('job_status_update', {
        jobId: id,
        status: 'picked_up',
        message: 'Order completed and picked up. Document securely shredded.',
      });
      const snapshot = await queueEngine.getQueueSnapshot(job.shop_id);
      io.to(`shop:${job.shop_id}`).emit('queue_updated', snapshot);
    }

    res.json({
      success: true,
      message: 'Job confirmed picked up. File securely deleted.',
    });
  } catch (err: any) {
    console.error('[Jobs] Error confirming pickup:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
