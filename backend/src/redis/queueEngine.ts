import Redis from 'ioredis';
import { config } from '../config/env';
import { query } from '../db';

export interface QueueJobInfo {
  jobId: string;
  shopId: string;
  tokenNumber: number;
  tokenCode: string;
  position: number;
  status: string;
  estimatedWaitMinutes: number;
}

class QueueEngine {
  private redis: Redis | null = null;
  private inMemoryCounters: Map<string, number> = new Map();
  private inMemoryQueues: Map<string, string[]> = new Map(); // shopId -> [jobId]

  constructor() {
    if (config.redisUrl) {
      console.log('[Queue] Connecting to Redis via REDIS_URL...');
      this.redis = new Redis(config.redisUrl, {
        retryStrategy: (times) => Math.min(times * 100, 3000),
      });
      this.redis.on('connect', () => console.log('[Queue] Redis connected successfully.'));
      this.redis.on('error', (err) => console.warn('[Queue] Redis warning/error, falling back to memory queue:', err.message));
    } else {
      console.log('[Queue] No REDIS_URL provided. Operating in embedded atomic in-memory queue mode.');
    }
  }

  private getDateKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  /**
   * Atomically increments and gets the daily token number for a shop
   */
  async getNextTokenNumber(shopId: string): Promise<{ tokenNumber: number; tokenCode: string }> {
    const dateKey = this.getDateKey();
    const redisKey = `printspot:token:${shopId}:${dateKey}`;

    let tokenNum = 1;
    if (this.redis && this.redis.status === 'ready') {
      try {
        tokenNum = await this.redis.incr(redisKey);
        // Expire key after 48 hours
        await this.redis.expire(redisKey, 172800);
      } catch (err) {
        tokenNum = this.getNextTokenMemory(shopId, dateKey);
      }
    } else {
      tokenNum = this.getNextTokenMemory(shopId, dateKey);
    }

    const tokenCode = `#${tokenNum}`;
    return { tokenNumber: tokenNum, tokenCode };
  }

  private getNextTokenMemory(shopId: string, dateKey: string): number {
    const memKey = `${shopId}:${dateKey}`;
    const current = this.inMemoryCounters.get(memKey) || 0;
    const next = current + 1;
    this.inMemoryCounters.set(memKey, next);
    return next;
  }

  /**
   * Enqueues a job into the shop's FIFO queue strictly AFTER payment confirmation
   */
  async enqueuePaidJob(shopId: string, jobId: string): Promise<number> {
    const queueKey = `printspot:queue:${shopId}`;

    if (this.redis && this.redis.status === 'ready') {
      try {
        await this.redis.rpush(queueKey, jobId);
      } catch (err) {
        this.enqueueMemory(shopId, jobId);
      }
    } else {
      this.enqueueMemory(shopId, jobId);
    }

    // Persist queue entry in DB
    await this.syncQueuePositions(shopId);
    return await this.getJobPosition(shopId, jobId);
  }

  private enqueueMemory(shopId: string, jobId: string): void {
    if (!this.inMemoryQueues.has(shopId)) {
      this.inMemoryQueues.set(shopId, []);
    }
    const q = this.inMemoryQueues.get(shopId)!;
    if (!q.includes(jobId)) {
      q.push(jobId);
    }
  }

  /**
   * Returns current active queue of job IDs in strict FIFO order
   */
  async getQueueJobIds(shopId: string): Promise<string[]> {
    const queueKey = `printspot:queue:${shopId}`;
    if (this.redis && this.redis.status === 'ready') {
      try {
        return await this.redis.lrange(queueKey, 0, -1);
      } catch (err) {
        return this.inMemoryQueues.get(shopId) || [];
      }
    }
    return this.inMemoryQueues.get(shopId) || [];
  }

  /**
   * Removes a job from the active queue (e.g. when completed, cancelled, or picked up)
   */
  async dequeueJob(shopId: string, jobId: string): Promise<void> {
    const queueKey = `printspot:queue:${shopId}`;
    if (this.redis && this.redis.status === 'ready') {
      try {
        await this.redis.lrem(queueKey, 0, jobId);
      } catch (err) {
        this.dequeueMemory(shopId, jobId);
      }
    } else {
      this.dequeueMemory(shopId, jobId);
    }

    await query('DELETE FROM queue_entries WHERE job_id = $1', [jobId]);
    await this.syncQueuePositions(shopId);
  }

  private dequeueMemory(shopId: string, jobId: string): void {
    const q = this.inMemoryQueues.get(shopId);
    if (q) {
      this.inMemoryQueues.set(shopId, q.filter((id) => id !== jobId));
    }
  }

  /**
   * Gets a job's 1-indexed position in the queue
   */
  async getJobPosition(shopId: string, jobId: string): Promise<number> {
    const jobIds = await this.getQueueJobIds(shopId);
    const index = jobIds.indexOf(jobId);
    return index !== -1 ? index + 1 : 0;
  }

  /**
   * Synchronizes positions in PostgreSQL/PGlite table for consistency
   */
  async syncQueuePositions(shopId: string): Promise<void> {
    const jobIds = await this.getQueueJobIds(shopId);
    for (let i = 0; i < jobIds.length; i++) {
      const jId = jobIds[i];
      const pos = i + 1;
      await query(
        `INSERT INTO queue_entries (job_id, shop_id, position, status, updated_at)
         VALUES ($1, $2, $3, 'waiting', CURRENT_TIMESTAMP)
         ON CONFLICT (job_id) DO UPDATE SET position = $3, updated_at = CURRENT_TIMESTAMP`,
        [jId, shopId, pos]
      );
    }
  }

  /**
   * Manual override: Reorder a job in the queue (e.g. bump to position 1 or custom)
   */
  async reorderJob(shopId: string, jobId: string, newPosition: number): Promise<string[]> {
    let jobIds = await this.getQueueJobIds(shopId);
    const currentIndex = jobIds.indexOf(jobId);
    if (currentIndex === -1) return jobIds;

    // Remove from current
    jobIds.splice(currentIndex, 1);
    // Insert at target index (1-based to 0-based)
    const targetIdx = Math.max(0, Math.min(newPosition - 1, jobIds.length));
    jobIds.splice(targetIdx, 0, jobId);

    const queueKey = `printspot:queue:${shopId}`;
    if (this.redis && this.redis.status === 'ready') {
      try {
        await this.redis.del(queueKey);
        if (jobIds.length > 0) {
          await this.redis.rpush(queueKey, ...jobIds);
        }
      } catch (err) {
        this.inMemoryQueues.set(shopId, jobIds);
      }
    } else {
      this.inMemoryQueues.set(shopId, jobIds);
    }

    await this.syncQueuePositions(shopId);
    return jobIds;
  }

  /**
   * Returns current queue state summary for clients and Admin
   */
  async getQueueSnapshot(shopId: string): Promise<{
    nowServingToken: string | null;
    totalWaiting: number;
    activeJobs: any[];
  }> {
    const jobIds = await this.getQueueJobIds(shopId);

    // Fetch details from print_jobs
    const jobsRes = await query(
      `SELECT j.id, j.user_id, j.shop_id, j.printer_id, j.file_name, j.file_size, j.page_count,
              j.settings, j.status, j.token_number, j.token_code, j.price, j.created_at,
              u.name as user_name, u.phone as user_phone
       FROM print_jobs j
       LEFT JOIN users u ON j.user_id = u.id
       WHERE j.shop_id = $1 AND j.status IN ('waiting', 'printing')
       ORDER BY j.token_number ASC`,
      [shopId]
    );

    const printingJob = jobsRes.rows.find((j) => j.status === 'printing');
    const waitingJobs = jobsRes.rows.filter((j) => j.status === 'waiting');

    const nowServingToken = printingJob ? printingJob.token_code : (waitingJobs[0]?.token_code || null);

    return {
      nowServingToken,
      totalWaiting: waitingJobs.length,
      activeJobs: jobsRes.rows,
    };
  }

  /**
   * Calculates wait time estimate (minutes)
   */
  calculateWaitTime(position: number, pageCount: number = 5): number {
    if (position <= 1) return 1;
    // Assume ~1.5 mins per job ahead + 0.1 min per page
    const jobsAhead = position - 1;
    const estimated = Math.ceil(jobsAhead * 1.5 + (pageCount * 0.1));
    return Math.max(1, estimated);
  }
}

export const queueEngine = new QueueEngine();
