"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaymentOrder = createPaymentOrder;
exports.verifyWebhookSignature = verifyWebhookSignature;
exports.confirmJobPayment = confirmJobPayment;
exports.confirmPayAtCounter = confirmPayAtCounter;
const crypto_1 = __importDefault(require("crypto"));
const razorpay_1 = __importDefault(require("razorpay"));
const env_1 = require("../config/env");
const db_1 = require("../db");
const queueEngine_1 = require("../redis/queueEngine");
const socketHandler_1 = require("../socket/socketHandler");
let razorpayInstance = null;
if (env_1.config.razorpayKeyId && env_1.config.razorpayKeySecret && !env_1.config.razorpayKeyId.includes('mock')) {
    try {
        razorpayInstance = new razorpay_1.default({
            key_id: env_1.config.razorpayKeyId,
            key_secret: env_1.config.razorpayKeySecret,
        });
    }
    catch (err) {
        console.warn('[Payment] Failed to initialize live Razorpay instance, using mock/simulation mode:', err);
    }
}
async function createPaymentOrder(jobId, amountRupees) {
    const amountSubunits = Math.round(amountRupees * 100); // Razorpay expects paise
    if (razorpayInstance) {
        const order = await razorpayInstance.orders.create({
            amount: amountSubunits,
            currency: 'INR',
            receipt: `job_${jobId}`,
            notes: { jobId },
        });
        await (0, db_1.query)(`UPDATE print_jobs 
       SET payment_order_id = $1, razorpay_order_id = $1, status = 'payment_pending', payment_provider = 'razorpay' 
       WHERE id = $2`, [order.id, jobId]);
        return {
            orderId: order.id,
            amount: amountSubunits,
            currency: 'INR',
            keyId: env_1.config.razorpayKeyId,
            isMock: false,
        };
    }
    // Fallback demo/simulation mode
    const mockOrderId = `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    await (0, db_1.query)(`UPDATE print_jobs 
     SET payment_order_id = $1, razorpay_order_id = $1, status = 'payment_pending', payment_provider = 'simulation' 
     WHERE id = $2`, [mockOrderId, jobId]);
    return {
        orderId: mockOrderId,
        amount: amountSubunits,
        currency: 'INR',
        keyId: env_1.config.razorpayKeyId,
        isMock: true,
    };
}
/**
 * Verifies Razorpay Webhook signature
 */
function verifyWebhookSignature(payload, signature) {
    if (!env_1.config.razorpayWebhookSecret)
        return true;
    const expectedSignature = crypto_1.default
        .createHmac('sha256', env_1.config.razorpayWebhookSecret)
        .update(payload)
        .digest('hex');
    return expectedSignature === signature;
}
/**
 * Confirms payment and strictly ENTERS JOB INTO THE FIFO QUEUE.
 * Guarantees a job never enters the queue before payment is confirmed.
 */
async function confirmJobPayment(jobId, paymentId, orderId) {
    const jobRes = await (0, db_1.query)('SELECT * FROM print_jobs WHERE id = $1', [jobId]);
    if (jobRes.rowCount === 0) {
        throw new Error(`Job not found: ${jobId}`);
    }
    const job = jobRes.rows[0];
    // Idempotency: if already paid/waiting, return existing token
    if (job.status !== 'created' && job.status !== 'payment_pending') {
        const pos = await queueEngine_1.queueEngine.getJobPosition(job.shop_id, job.id);
        return {
            tokenNumber: job.token_number,
            tokenCode: job.token_code,
            position: pos,
            pickupCode: job.pickup_code,
        };
    }
    // 1. Atomic Token generation
    const { tokenNumber, tokenCode } = await queueEngine_1.queueEngine.getNextTokenNumber(job.shop_id);
    // 2. Generate 4-digit pickup code
    const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();
    // 3. Update DB record to 'waiting'
    await (0, db_1.query)(`UPDATE print_jobs 
     SET status = 'waiting',
         token_number = $1,
         token_code = $2,
         payment_transaction_id = $3,
         razorpay_payment_id = $3,
         payment_order_id = COALESCE($4, payment_order_id, razorpay_order_id),
         razorpay_order_id = COALESCE($4, razorpay_order_id),
         payment_status = 'paid',
         pickup_code = $5
     WHERE id = $6`, [tokenNumber, tokenCode, paymentId, orderId || null, pickupCode, jobId]);
    // 4. Enqueue into FIFO engine
    const position = await queueEngine_1.queueEngine.enqueuePaidJob(job.shop_id, jobId);
    // 5. Broadcast real-time event via Socket.IO
    const io = (0, socketHandler_1.getSocketServer)();
    if (io) {
        const waitMins = queueEngine_1.queueEngine.calculateWaitTime(position, job.page_count);
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
        const snapshot = await queueEngine_1.queueEngine.getQueueSnapshot(job.shop_id);
        io.to(`shop:${job.shop_id}`).emit('queue_updated', snapshot);
        io.to(`shop:${job.shop_id}`).emit('new_order_arrived', {
            jobId,
            tokenCode,
            fileName: job.file_name,
            price: job.price,
            paymentMethod: 'razorpay',
        });
    }
    // 6. Automatically dispatch next waiting job to Printer Agent
    await (0, socketHandler_1.checkAndDispatchNextJob)(job.shop_id);
    return { tokenNumber, tokenCode, position, pickupCode };
}
/**
 * Confirms Pay at Counter order (cash or counter UPI)
 */
async function confirmPayAtCounter(jobId, counterPaymentType = 'counter_cash') {
    const jobRes = await (0, db_1.query)('SELECT * FROM print_jobs WHERE id = $1', [jobId]);
    if (jobRes.rowCount === 0) {
        throw new Error(`Job not found: ${jobId}`);
    }
    const job = jobRes.rows[0];
    // Idempotency: if already in queue
    if (job.status !== 'created' && job.status !== 'payment_pending') {
        const pos = await queueEngine_1.queueEngine.getJobPosition(job.shop_id, job.id);
        return {
            tokenNumber: job.token_number,
            tokenCode: job.token_code,
            position: pos,
            pickupCode: job.pickup_code,
        };
    }
    // 1. Atomic Token generation
    const { tokenNumber, tokenCode } = await queueEngine_1.queueEngine.getNextTokenNumber(job.shop_id);
    // 2. 4-digit pickup code
    const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();
    // 3. Update DB record to 'waiting' with pay_at_counter flag
    await (0, db_1.query)(`UPDATE print_jobs 
     SET status = 'waiting',
         token_number = $1,
         token_code = $2,
         payment_method = $3,
         payment_status = 'pay_at_counter',
         pickup_code = $4
     WHERE id = $5`, [tokenNumber, tokenCode, counterPaymentType, pickupCode, jobId]);
    // 4. Enqueue into FIFO engine
    const position = await queueEngine_1.queueEngine.enqueuePaidJob(job.shop_id, jobId);
    // 5. Broadcast real-time events via Socket.IO
    const io = (0, socketHandler_1.getSocketServer)();
    if (io) {
        const waitMins = queueEngine_1.queueEngine.calculateWaitTime(position, job.page_count);
        // Notify customer
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
        // Notify Shopkeeper with Audio notification trigger
        const snapshot = await queueEngine_1.queueEngine.getQueueSnapshot(job.shop_id);
        io.to(`shop:${job.shop_id}`).emit('queue_updated', snapshot);
        io.to(`shop:${job.shop_id}`).emit('new_order_arrived', {
            jobId,
            tokenCode,
            fileName: job.file_name,
            price: job.price,
            paymentMethod: counterPaymentType,
        });
    }
    // 6. Automatically dispatch if ready
    await (0, socketHandler_1.checkAndDispatchNextJob)(job.shop_id);
    return { tokenNumber, tokenCode, position, pickupCode };
}
