import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config/env';
import { query } from '../db';
import { queueEngine } from '../redis/queueEngine';
import { removeFile } from '../services/storageService';
import { assignPrintersToJob } from '../services/printerRoutingService';

let io: Server | null = null;

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Customer subscribes to a specific print job
    socket.on('subscribe_job', async (data: { jobId: string }) => {
      if (!data || !data.jobId) return;
      const room = `job:${data.jobId}`;
      socket.join(room);
      console.log(`[Socket] Socket ${socket.id} subscribed to ${room}`);

      // Send immediate status update
      try {
        const jobRes = await query('SELECT * FROM print_jobs WHERE id = $1', [data.jobId]);
        if (jobRes.rowCount > 0) {
          const job = jobRes.rows[0];
          const pos = await queueEngine.getJobPosition(job.shop_id, job.id);
          const snapshot = await queueEngine.getQueueSnapshot(job.shop_id);

          socket.emit('job_status_update', {
            jobId: job.id,
            status: job.status,
            tokenNumber: job.token_number,
            tokenCode: job.token_code,
            position: pos,
            nowServingToken: snapshot.nowServingToken,
            pickupCode: job.pickup_code,
            errorMessage: job.error_message,
            estimatedWaitMinutes: queueEngine.calculateWaitTime(pos, job.page_count),
          });
        }
      } catch (err) {
        console.error('[Socket] Error fetching job status on subscribe:', err);
      }
    });

    // Shop Admin subscribes to shop updates
    socket.on('subscribe_shop', async (data: { shopId: string }) => {
      if (!data || !data.shopId) return;
      const room = `shop:${data.shopId}`;
      socket.join(room);
      console.log(`[Socket] Admin ${socket.id} subscribed to ${room}`);

      try {
        const snapshot = await queueEngine.getQueueSnapshot(data.shopId);
        socket.emit('queue_updated', snapshot);

        const printersRes = await query('SELECT * FROM printers WHERE shop_id = $1', [data.shopId]);
        socket.emit('printers_updated', printersRes.rows);
      } catch (err) {
        console.error('[Socket] Error sending initial shop data:', err);
      }
    });

    // Shop-side Printer Agent connects and registers
    socket.on('agent_register', async (data: { shopId: string; agentKey: string; printers?: any[] }) => {
      if (data.agentKey !== config.printerAgentKey) {
        socket.emit('agent_auth_error', { message: 'Invalid agent key' });
        socket.disconnect();
        return;
      }

      const agentRoom = `agent:${data.shopId}`;
      socket.join(agentRoom);
      console.log(`[Socket] Printer Agent authenticated and joined ${agentRoom}`);

      socket.emit('agent_registered', {
        success: true,
        shopId: data.shopId,
        message: 'Printer agent connected and ready for jobs.',
      });

      // Update printers in DB if agent reported system printers
      if (data.printers && Array.isArray(data.printers)) {
        for (const p of data.printers) {
          await query(
            `UPDATE printers SET status = $1, system_name = $2 WHERE shop_id = $3 AND id = $4`,
            [p.status || 'online', p.systemName || p.name, data.shopId, p.id]
          );
        }
      }

      // Check if there are waiting jobs to immediately dispatch to agent
      await checkAndDispatchNextJob(data.shopId);
    });

    // Printer Agent reports job status changes:
    // status: 'printing' | 'ready' | 'failed'
    socket.on('agent_job_status', async (data: {
      jobId: string;
      shopId: string;
      status: 'printing' | 'ready' | 'failed';
      printerId?: string;
      errorMessage?: string;
    }) => {
      console.log(`[Socket] Agent reported job ${data.jobId} status -> ${data.status}`);
      try {
        const { jobId, shopId, status, errorMessage } = data;

        if (status === 'printing') {
          await query(
            `UPDATE print_jobs SET status = 'printing', error_message = NULL WHERE id = $1`,
            [jobId]
          );
        } else if (status === 'ready') {
          // Completed printing
          await query(
            `UPDATE print_jobs 
             SET status = 'ready', completed_at = CURRENT_TIMESTAMP, error_message = NULL 
             WHERE id = $1`,
            [jobId]
          );
          // Dequeue from active waiting line
          await queueEngine.dequeueJob(shopId, jobId);
        } else if (status === 'failed') {
          // Failed (paper jam, out of ink, printer offline)
          await query(
            `UPDATE print_jobs 
             SET status = 'failed', error_message = $1 
             WHERE id = $2`,
            [errorMessage || 'Printer reported hardware or communication error', jobId]
          );
          // Flag in queue
          await query(
            `UPDATE queue_entries SET status = 'failed' WHERE job_id = $1`,
            [jobId]
          );
        }

        // Broadcast to customer
        const jobRes = await query('SELECT * FROM print_jobs WHERE id = $1', [jobId]);
        const job = jobRes.rows[0];
        const snapshot = await queueEngine.getQueueSnapshot(shopId);
        const pos = await queueEngine.getJobPosition(shopId, jobId);

        io?.to(`job:${jobId}`).emit('job_status_update', {
          jobId: job.id,
          status: job.status,
          tokenNumber: job.token_number,
          tokenCode: job.token_code,
          position: pos,
          nowServingToken: snapshot.nowServingToken,
          pickupCode: job.pickup_code,
          errorMessage: job.error_message,
        });

        // Broadcast to shop admin
        io?.to(`shop:${shopId}`).emit('queue_updated', snapshot);

        // If job completed or failed, dispatch next waiting job to agent
        if (status === 'ready' || status === 'failed') {
          await checkAndDispatchNextJob(shopId);
        }
      } catch (err) {
        console.error('[Socket] Error updating agent job status:', err);
      }
    });

    // Printer Agent reports printer status heartbeat
    socket.on('agent_printer_heartbeat', async (data: {
      shopId: string;
      printers: Array<{ id: string; name: string; status: string }>;
    }) => {
      try {
        for (const p of data.printers) {
          await query(
            `UPDATE printers SET status = $1 WHERE shop_id = $2 AND (id = $3 OR name = $4)`,
            [p.status, data.shopId, p.id, p.name]
          );
        }
        const printersRes = await query('SELECT * FROM printers WHERE shop_id = $1', [data.shopId]);
        io?.to(`shop:${data.shopId}`).emit('printers_updated', printersRes.rows);
      } catch (err) {
        console.error('[Socket] Error updating printer heartbeat:', err);
      }
    });

    socket.on('disconnect', () => {
      // Clean disconnect
    });
  });

  return io;
}

export function getSocketServer(): Server | null {
  return io;
}

/**
 * Checks for the next waiting job in the FIFO queue and dispatches it to the printer agent
 */
export async function checkAndDispatchNextJob(shopId: string): Promise<boolean> {
  try {
    // Check if there is already a job actively printing for this shop
    const currentPrinting = await query(
      `SELECT id FROM print_jobs WHERE shop_id = $1 AND status = 'printing'`,
      [shopId]
    );

    if (currentPrinting.rowCount > 0) {
      // Printer is currently busy with a job
      return false;
    }

    // Get ordered waiting job IDs
    const jobIds = await queueEngine.getQueueJobIds(shopId);
    if (jobIds.length === 0) return false;

    // Pick the first waiting job
    const nextJobId = jobIds[0];
    const jobRes = await query(
      `SELECT j.*, s.name as shop_name 
       FROM print_jobs j 
       JOIN shops s ON j.shop_id = s.id 
       WHERE j.id = $1 AND j.status = 'waiting'`,
      [nextJobId]
    );

    if (jobRes.rowCount === 0) return false;
    const job = jobRes.rows[0];

    const settings = typeof job.settings === 'string' ? JSON.parse(job.settings) : job.settings;

    // Execute sturdy printer routing and load balancing
    const routingDecision = await assignPrintersToJob(
      shopId,
      settings,
      job.page_count,
      job.file_url,
      job.file_name
    );

    const assignedPrinterId = routingDecision.primaryPrinterId;
    const assignedSystemName = routingDecision.primarySystemPrinterName;

    if (assignedPrinterId) {
      await query(`UPDATE print_jobs SET printer_id = $1 WHERE id = $2`, [assignedPrinterId, job.id]);
    }

    const dispatchedSettings = {
      ...settings,
      files: routingDecision.assignedFiles,
      isMultiPrinterSplit: routingDecision.isMultiPrinterSplit,
      routingSummary: routingDecision.routingSummary,
    };

    // Dispatch to Agent room
    io?.to(`agent:${shopId}`).emit('print_job_dispatch', {
      jobId: job.id,
      shopId: job.shop_id,
      tokenCode: job.token_code,
      fileUrl: job.file_url,
      fileName: job.file_name,
      pageCount: job.page_count,
      settings: dispatchedSettings,
      printerId: assignedPrinterId,
      systemPrinterName: assignedSystemName,
      isMultiPrinterSplit: routingDecision.isMultiPrinterSplit,
      routingSummary: routingDecision.routingSummary,
    });

    console.log(`[Queue Engine] Dispatched job ${job.token_code} (${job.id}) to Printer Agent`);
    console.log(`   Routing: ${routingDecision.routingSummary}`);
    return true;
  } catch (err) {
    console.error('[Queue Engine] Error dispatching next job:', err);
    return false;
  }
}
