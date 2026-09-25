"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestPhoneOtp = requestPhoneOtp;
exports.verifyPhoneOtp = verifyPhoneOtp;
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const env_1 = require("../config/env");
const db_1 = require("../db");
const otpStore = new Map();
async function requestPhoneOtp(phone) {
    const cleanedPhone = phone.trim().replace(/\s+/g, '');
    if (!cleanedPhone || cleanedPhone.length < 10) {
        throw new Error('Please enter a valid 10-digit mobile number.');
    }
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    otpStore.set(cleanedPhone, { otp, expiresAt });
    console.log(`[AUTH] Generated OTP for ${cleanedPhone}: ${otp}`);
    // In production, integrate SMS gateway (Twilio, Gupshup, etc.)
    // For MVP/Dev, return demoOtp for instant UI convenience
    return {
        success: true,
        message: 'OTP sent successfully to your mobile number.',
        demoOtp: otp,
    };
}
async function verifyPhoneOtp(phone, otp, name) {
    const cleanedPhone = phone.trim().replace(/\s+/g, '');
    const entry = otpStore.get(cleanedPhone);
    // Allow standard '123456' as master test OTP in development
    const isMasterOtp = env_1.config.nodeEnv === 'development' && otp === '123456';
    if (!isMasterOtp) {
        if (!entry) {
            throw new Error('OTP expired or not requested. Please request a new OTP.');
        }
        if (Date.now() > entry.expiresAt) {
            otpStore.delete(cleanedPhone);
            throw new Error('OTP has expired. Please request a new OTP.');
        }
        if (entry.otp !== otp.trim()) {
            throw new Error('Invalid OTP. Please check the 6-digit code entered.');
        }
    }
    otpStore.delete(cleanedPhone);
    // Find or create user
    let userRes = await (0, db_1.query)('SELECT * FROM users WHERE phone = $1', [cleanedPhone]);
    let user;
    if (userRes.rowCount === 0) {
        const userId = (0, uuid_1.v4)();
        const userName = name?.trim() || `Customer ${cleanedPhone.slice(-4)}`;
        await (0, db_1.query)('INSERT INTO users (id, phone, name) VALUES ($1, $2, $3)', [userId, cleanedPhone, userName]);
        user = { id: userId, phone: cleanedPhone, name: userName };
    }
    else {
        user = userRes.rows[0];
        if (name && name.trim()) {
            await (0, db_1.query)('UPDATE users SET name = $1 WHERE id = $2', [name.trim(), user.id]);
            user.name = name.trim();
        }
    }
    const token = jsonwebtoken_1.default.sign({ userId: user.id, phone: user.phone, name: user.name }, env_1.config.jwtSecret, { expiresIn: '30d' });
    return { user, token };
}
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwtSecret);
        req.user = decoded;
        next();
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid or expired authentication token' });
    }
}
