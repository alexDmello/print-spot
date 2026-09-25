"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authService_1 = require("../services/authService");
const router = (0, express_1.Router)();
router.post('/send-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            res.status(400).json({ error: 'Phone number is required.' });
            return;
        }
        const result = await (0, authService_1.requestPhoneOtp)(phone);
        res.json(result);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.post('/verify-otp', async (req, res) => {
    try {
        const { phone, otp, name } = req.body;
        if (!phone || !otp) {
            res.status(400).json({ error: 'Phone number and 6-digit OTP are required.' });
            return;
        }
        const result = await (0, authService_1.verifyPhoneOtp)(phone, otp, name);
        res.json(result);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.get('/me', authService_1.authMiddleware, (req, res) => {
    res.json({ user: req.user });
});
exports.default = router;
