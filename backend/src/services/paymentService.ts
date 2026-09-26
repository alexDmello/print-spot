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
      `UPDATE print_jobs 
       SET payment_order_id = $1, razorpay_order_id = $1, status = 'payment_pending', payment_provider = 'razorpay' 
       WHERE id = $2`,
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
    `UPDATE print_jobs 
     SET payment_order_id = $1, razorpay_order_id = $1, status = 'payment_pending', payment_provider = 'simulation' 
     WHERE id = $2`,
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

  // 1. Calculate platform fee and online settlement (Phase 5)
  const shopRes = await query('SELECT platform_fee_percent, unsettled_cash_fee FROM shops WHERE id = $1', [job.shop_id]);
  const shop = shopRes.rows[0] || {};
  const feePercent = parseFloat(shop.platform_fee_percent || '5.0');
  const platformFee = +(Number(job.price) * (feePercent / 100)).toFixed(2);
  const unsettled = parseFloat(shop.unsettled_cash_fee || '0');
  const maxDeductible = Math.max(0, Number(job.price) - platformFee);
  const cashFeeDeduction = Math.min(unsettled, maxDeductible);
  const totalDeduction = +(platformFee + cashFeeDeduction).toFixed(2);
  const shopPayout = +(Number(job.price) - totalDeduction).toFixed(2);

  if (cashFeeDeduction > 0 || platformFee > 0) {
    await query(
      `UPDATE shops 
       SET unsettled_cash_fee = GREATEST(0, COALESCE(unsettled_cash_fee, 0) - $1),
           total_platform_fees_settled = COALESCE(total_platform_fees_settled, 0) + $2
       WHERE id = $3`,
      [cashFeeDeduction, totalDeduction, job.shop_id]
    );
  }

  // 2. Atomic Token generation
  const { tokenNumber, tokenCode } = await queueEngine.getNextTokenNumber(job.shop_id);

  // 3. Generate 4-digit pickup code
  const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();

  // 4. Update DB record to 'waiting' with fees
  await query(
    `UPDATE print_jobs 
     SET status = 'waiting',
         token_number = $1,
         token_code = $2,
         payment_transaction_id = $3,
         razorpay_payment_id = $3,
         payment_order_id = COALESCE($4, payment_order_id, razorpay_order_id),
         razorpay_order_id = COALESCE($4, razorpay_order_id),
         payment_status = 'paid',
         pickup_code = $5,
         platform_fee = $6,
         shop_payout = $7
     WHERE id = $8`,
    [tokenNumber, tokenCode, paymentId, orderId || null, pickupCode, platformFee, shopPayout, jobId]
  );

  // 5. Enqueue into FIFO engine
  const position = await queueEngine.enqueuePaidJob(job.shop_id, jobId);

  // 6. Broadcast real-time event via Socket.IO
  const io = getSocketServer();
  if (io) {
    const waitMins = await queueEngine.getEstimatedWaitForJob(job.shop_id, jobId);

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
    io.to(`shop:${job.shop_id}`).emit('new_order_arrived', {
      jobId,
      tokenCode,
      fileName: job.file_name,
      price: job.price,
      paymentMethod: 'razorpay',
    });
  }

  // 7. Automatically dispatch next waiting job to Printer Agent
  await checkAndDispatchNextJob(job.shop_id);

  return { tokenNumber, tokenCode, position, pickupCode };
}

/**
 * Initiates Pay at Counter order (Cash requires explicit shop confirmation)
 */
export async function confirmPayAtCounter(
  jobId: string,
  counterPaymentType: 'counter_cash' | 'counter_upi' = 'counter_cash'
): Promise<any> {
  const jobRes = await query(
    `SELECT j.*, u.name as user_name, u.phone as user_phone 
     FROM print_jobs j 
     LEFT JOIN users u ON j.user_id = u.id 
     WHERE j.id = $1`,
    [jobId]
  );

  if (jobRes.rowCount === 0) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const job = jobRes.rows[0];

  // If cash: Transition to cash_confirmation_pending and wait for shopkeeper
  if (counterPaymentType === 'counter_cash') {
    await query(
      `UPDATE print_jobs 
       SET status = 'cash_confirmation_pending',
           payment_method = 'counter_cash',
           payment_status = 'cash_pending'
       WHERE id = $1`,
      [jobId]
    );

    const io = getSocketServer();
    if (io) {
      // Notify Shop Counter with prominent confirmation card
      io.to(`shop:${job.shop_id}`).emit('cash_order_pending', {
        jobId: job.id,
        fileName: job.file_name,
        fileSize: job.file_size,
        pageCount: job.page_count,
        price: job.price,
        settings: typeof job.settings === 'string' ? JSON.parse(job.settings) : job.settings,
        userName: job.user_name || 'Counter Customer',
        userPhone: job.user_phone || '',
        createdAt: job.created_at || new Date().toISOString(),
      });

      // Notify Customer to await counter verification
      io.to(`job:${jobId}`).emit('cash_awaiting_confirmation', {
        jobId: job.id,
        price: job.price,
        status: 'cash_confirmation_pending',
      });
    }

    return {
      pendingConfirmation: true,
      jobId: job.id,
      price: job.price,
      status: 'cash_confirmation_pending',
    };
  }

  // If counter_upi (or direct instant counter):
  const { tokenNumber, tokenCode } = await queueEngine.getNextTokenNumber(job.shop_id);
  const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();

  await query(
    `UPDATE print_jobs 
     SET status = 'waiting',
         token_number = $1,
         token_code = $2,
         payment_method = $3,
         payment_status = 'pay_at_counter',
         pickup_code = $4
     WHERE id = $5`,
    [tokenNumber, tokenCode, counterPaymentType, pickupCode, jobId]
  );

  const position = await queueEngine.enqueuePaidJob(job.shop_id, jobId);

  const io = getSocketServer();
  if (io) {
    const waitMins = await queueEngine.getEstimatedWaitForJob(job.shop_id, jobId);
    io.to(`job:${jobId}`).emit('payment_confirmed', {
      jobId,
      tokenNumber,
      tokenCode,
      position,
      pickupCode,
      estimatedWaitMinutes: waitMins,
      status: 'waiting',
      paymentMethod: counterPaymentType,
    });

    const snapshot = await queueEngine.getQueueSnapshot(job.shop_id);
    io.to(`shop:${job.shop_id}`).emit('queue_updated', snapshot);
    io.to(`shop:${job.shop_id}`).emit('new_order_arrived', {
      jobId,
      tokenCode,
      fileName: job.file_name,
      price: job.price,
      paymentMethod: counterPaymentType,
    });
  }

  await checkAndDispatchNextJob(job.shop_id);
  return { tokenNumber, tokenCode, position, pickupCode };
}

/**
 * Shopkeeper confirms cash received at counter (Phase 4A & 5B)
 */
export async function confirmCashPaymentByShop(
  jobId: string,
  shopId: string
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
  if (job.shop_id !== shopId) {
    throw new Error('Unauthorized: this job belongs to a different counter.');
  }

  // Idempotency: if already confirmed/waiting
  if (job.status !== 'cash_confirmation_pending' && job.status !== 'created' && job.status !== 'payment_pending') {
    const pos = await queueEngine.getJobPosition(job.shop_id, job.id);
    return {
      tokenNumber: job.token_number,
      tokenCode: job.token_code,
      position: pos,
      pickupCode: job.pickup_code,
    };
  }

  // 1. Calculate platform fee for cash order (accumulated into unsettled_cash_fee)
  const shopRes = await query('SELECT platform_fee_percent, unsettled_cash_fee, max_pending_cash_fee FROM shops WHERE id = $1', [shopId]);
  const shop = shopRes.rows[0] || {};
  const feePercent = parseFloat(shop.platform_fee_percent || '5.0');
  const platformFee = +(Number(job.price) * (feePercent / 100)).toFixed(2);
  const shopPayout = Number(job.price); // Shopkeeper receives full cash at counter

  await query(
    `UPDATE shops 
     SET unsettled_cash_fee = COALESCE(unsettled_cash_fee, 0) + $1 
     WHERE id = $2`,
    [platformFee, shopId]
  );

  // 2. Atomic Token & Pickup Code Generation
  const { tokenNumber, tokenCode } = await queueEngine.getNextTokenNumber(shopId);
  const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();

  // 3. Update DB record to waiting
  await query(
    `UPDATE print_jobs 
     SET status = 'waiting',
         token_number = $1,
         token_code = $2,
         payment_method = 'counter_cash',
         payment_status = 'cash_confirmed',
         pickup_code = $3,
         platform_fee = $4,
         shop_payout = $5
     WHERE id = $6`,
    [tokenNumber, tokenCode, pickupCode, platformFee, shopPayout, jobId]
  );

  // 4. Enqueue into FIFO engine
  const position = await queueEngine.enqueuePaidJob(shopId, jobId);

  // 5. Broadcast real-time events
  const io = getSocketServer();
  if (io) {
    const waitMins = await queueEngine.getEstimatedWaitForJob(shopId, jobId);

    // Notify customer phone
    io.to(`job:${jobId}`).emit('payment_confirmed', {
      jobId,
      tokenNumber,
      tokenCode,
      position,
      pickupCode,
      estimatedWaitMinutes: waitMins,
      status: 'waiting',
      paymentMethod: 'counter_cash',
    });

    // Notify shopkeeper queue
    const snapshot = await queueEngine.getQueueSnapshot(shopId);
    io.to(`shop:${shopId}`).emit('queue_updated', snapshot);
    io.to(`shop:${shopId}`).emit('cash_order_confirmed', {
      jobId,
      tokenCode,
      price: job.price,
      platformFee,
    });
  }

  // 6. Automatically dispatch if ready
  await checkAndDispatchNextJob(shopId);

  return { tokenNumber, tokenCode, position, pickupCode };
}

/**
 * Shopkeeper declines cash order (e.g. customer walked away or insufficient funds)
 */
export async function declineCashPaymentByShop(
  jobId: string,
  shopId: string,
  reason?: string
): Promise<{ success: boolean }> {
  const jobRes = await query('SELECT * FROM print_jobs WHERE id = $1', [jobId]);
  if (jobRes.rowCount === 0) throw new Error('Job not found.');
  const job = jobRes.rows[0];
  if (job.shop_id !== shopId) throw new Error('Unauthorized.');

  const declineReason = reason || 'Payment not received at counter.';
  await query(
    `UPDATE print_jobs 
     SET status = 'cancelled', 
         error_message = $1 
     WHERE id = $2`,
    [declineReason, jobId]
  );

  const io = getSocketServer();
  if (io) {
    io.to(`job:${jobId}`).emit('cash_order_declined', {
      jobId,
      reason: declineReason,
    });
    const snapshot = await queueEngine.getQueueSnapshot(shopId);
    io.to(`shop:${shopId}`).emit('queue_updated', snapshot);
  }

  return { success: true };
}

