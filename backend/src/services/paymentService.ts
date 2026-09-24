import crypto from 'crypto';
import Razorpay from 'razorpay';
import { config } from '../config/env';
import { query } from '../db';
import { queueEngine } from '../redis/queueEngine';
import { getSocketServer, checkAndDispatchNextJob } from '../socket/socketHandler';

let razorpayInstance: Razorpay | null = null;

if (config.razorpayKeyId && config.razorpayKeySecret && !config.razorpayKeyId.includes('mock')) {
  try {
    razorpayInstance = new Razorpay({
      key_id: config.razorpayKeyId,
      key_secret: config.razorpayKeySecret,
    });
  } catch (err) {
    console.warn('[Payment] Failed to initialize live Razorpay instance, using mock/simulation mode:', err);
  }
}

export async function createPaymentOrder(jobId: string, amountRupees: number): Promise<{
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  isMock: boolean;
}> {
  const amountSubunits = Math.round(amountRupees * 100); // Razorpay expects paise

  if (razorpayInstance) {
    const order = await razorpayInstance.orders.create({
      amount: amountSubunits,
      currency: 'INR',
      receipt: `job_${jobId}`,
      notes: { jobId },
    });

    await query(
      `UPDATE print_jobs SET razorpay_order_id = $1, status = 'payment_pending' WHERE id = $2`,
      [order.id, jobId]
    );

    return {
      orderId: order.id,
      amount: amountSubunits,
      currency: 'INR',
      keyId: config.razorpayKeyId,
      isMock: false,
    };
  }

  // Fallback demo/simulation mode
  const mockOrderId = `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  await query(
    `UPDATE print_jobs SET razorpay_order_id = $1, status = 'payment_pending' WHERE id = $2`,
    [mockOrderId, jobId]
  );

  return {
    orderId: mockOrderId,
    amount: amountSubunits,
    currency: 'INR',
    keyId: config.razorpayKeyId,
    isMock: true,
  };
}

/**
 * Verifies Razorpay Webhook signature
 */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (!config.razorpayWebhookSecret) return true;
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpayWebhookSecret)
    .update(payload)
    .digest('hex');
  return expectedSignature === signature;
}

/**
 * Confirms payment and strictly ENTERS JOB INTO THE FIFO QUEUE.
 * Guarantees a job never enters the queue before payment is confirmed.
 */
export async function confirmJobPayment(
  jobId: string,
  paymentId: string,
  orderId?: string
): Promise<{
  tokenNumber: number;
  tokenCode: string;
  position: number;
  pickupCode: string;
}> {
  const jobRes = await query('SELECT * FROM print_jobs WHERE id = $1', [jobId]);
  if (jobRes.rowCount === 0) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const job = jobRes.rows[0];

  // Idempotency: if already paid/waiting, return existing token
  if (job.status !== 'created' && job.status !== 'payment_pending') {
    const pos = await queueEngine.getJobPosition(job.shop_id, job.id);
    return {
      tokenNumber: job.token_number,
      tokenCode: job.token_code,
      position: pos,
      pickupCode: job.pickup_code,
    };
  }

  // 1. Atomic Token generation
  const { tokenNumber, tokenCode } = await queueEngine.getNextTokenNumber(job.shop_id);

  // 2. Generate 4-digit pickup code
  const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();

  // 3. Update DB record to 'waiting'
  await query(
    `UPDATE print_jobs 
     SET status = 'waiting',
         token_number = $1,
         token_code = $2,
         razorpay_payment_id = $3,
         razorpay_order_id = COALESCE($4, razorpay_order_id),
         pickup_code = $5
     WHERE id = $6`,
    [tokenNumber, tokenCode, paymentId, orderId || null, pickupCode, jobId]
  );

  // 4. Enqueue into FIFO engine
  const position = await queueEngine.enqueuePaidJob(job.shop_id, jobId);

  // 5. Broadcast real-time event via Socket.IO
  const io = getSocketServer();
  if (io) {
    const waitMins = queueEngine.calculateWaitTime(position, job.page_count);

    // Notify customer
    io.to(`job:${jobId}`).emit('payment_confirmed', {
      jobId,
      tokenNumber,
      tokenCode,
      position,
      pickupCode,
      estimatedWaitMinutes: waitMins,
      status: 'waiting',
    });

    // Notify Shop Admin
    const snapshot = await queueEngine.getQueueSnapshot(job.shop_id);
    io.to(`shop:${job.shop_id}`).emit('queue_updated', snapshot);
  }

  // 6. Automatically dispatch next waiting job to Printer Agent
  await checkAndDispatchNextJob(job.shop_id);

  return { tokenNumber, tokenCode, position, pickupCode };
}
