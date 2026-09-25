"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const paymentService_1 = require("../services/paymentService");
const env_1 = require("../config/env");
const router = (0, express_1.Router)();
// Create Razorpay Order for a Job
router.post('/create-order', async (req, res) => {
    try {
        const { jobId, amount } = req.body;
        if (!jobId || !amount) {
            res.status(400).json({ error: 'jobId and amount are required.' });
            return;
        }
        const orderData = await (0, paymentService_1.createPaymentOrder)(jobId, Number(amount));
        res.json(orderData);
    }
    catch (err) {
        console.error('[Payment] Error creating order:', err);
        res.status(500).json({ error: err.message || 'Failed to initiate payment.' });
    }
});
// Verify live Razorpay payment from frontend SDK
router.post('/verify', async (req, res) => {
    try {
        const { jobId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        if (!jobId || !razorpay_payment_id) {
            res.status(400).json({ error: 'Missing payment confirmation parameters.' });
            return;
        }
        // Verify signature if secret provided
        if (env_1.config.razorpayKeySecret && razorpay_order_id && razorpay_signature) {
            const body = razorpay_order_id + '|' + razorpay_payment_id;
            const expectedSignature = crypto_1.default
                .createHmac('sha256', env_1.config.razorpayKeySecret)
                .update(body)
                .digest('hex');
            if (expectedSignature !== razorpay_signature) {
                res.status(400).json({ error: 'Invalid payment signature verification failed.' });
                return;
            }
        }
        const result = await (0, paymentService_1.confirmJobPayment)(jobId, razorpay_payment_id, razorpay_order_id);
        res.json({ success: true, ...result });
    }
    catch (err) {
        console.error('[Payment] Error verifying payment:', err);
        res.status(500).json({ error: err.message || 'Payment confirmation failed.' });
    }
});
// Demo/Simulated payment verification (for testing without live Razorpay account)
router.post('/verify-simulated', async (req, res) => {
    try {
        const { jobId } = req.body;
        if (!jobId) {
            res.status(400).json({ error: 'jobId is required.' });
            return;
        }
        const mockPaymentId = `pay_sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const result = await (0, paymentService_1.confirmJobPayment)(jobId, mockPaymentId);
        res.json({ success: true, isSimulated: true, paymentId: mockPaymentId, ...result });
    }
    catch (err) {
        console.error('[Payment] Error in simulated payment:', err);
        res.status(500).json({ error: err.message });
    }
});
// Pay at Counter (Cash or Counter UPI) option
router.post('/pay-at-counter', async (req, res) => {
    try {
        const { jobId, counterPaymentType } = req.body;
        if (!jobId) {
            res.status(400).json({ error: 'jobId is required.' });
            return;
        }
        const type = counterPaymentType === 'counter_upi' ? 'counter_upi' : 'counter_cash';
        const result = await (0, paymentService_1.confirmPayAtCounter)(jobId, type);
        res.json({ success: true, isCounterPayment: true, ...result });
    }
    catch (err) {
        console.error('[Payment] Error in Pay at Counter:', err);
        res.status(500).json({ error: err.message || 'Failed to place order.' });
    }
});
// Razorpay Webhook endpoint
router.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const rawPayload = JSON.stringify(req.body);
        if (signature && !(0, paymentService_1.verifyWebhookSignature)(rawPayload, signature)) {
            console.warn('[Payment Webhook] Invalid webhook signature');
            res.status(400).json({ error: 'Invalid webhook signature' });
            return;
        }
        const event = req.body.event;
        console.log(`[Payment Webhook] Received Razorpay event: ${event}`);
        if (event === 'payment.captured' || event === 'order.paid') {
            const paymentEntity = req.body.payload?.payment?.entity;
            const orderEntity = req.body.payload?.order?.entity;
            const jobId = paymentEntity?.notes?.jobId || orderEntity?.notes?.jobId;
            const paymentId = paymentEntity?.id || `pay_${Date.now()}`;
            const orderId = orderEntity?.id;
            if (jobId) {
                await (0, paymentService_1.confirmJobPayment)(jobId, paymentId, orderId);
                console.log(`[Payment Webhook] Job ${jobId} confirmed & queued via webhook`);
            }
        }
        res.json({ status: 'ok' });
    }
    catch (err) {
        console.error('[Payment Webhook] Error processing webhook:', err);
        res.status(500).json({ error: 'Webhook processing error' });
    }
});
exports.default = router;
