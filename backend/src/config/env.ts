import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  adminUrl: process.env.ADMIN_URL || 'http://localhost:3000/admin',
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'printspot_super_secret_key_2026',
  printerAgentKey: process.env.PRINTER_AGENT_KEY || 'printspot_agent_secret_key_8899',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_key_12345',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || 'rzp_mock_secret_abcdef',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_xyz',
  uploadDir: process.env.VERCEL
    ? path.resolve('/tmp', 'uploads')
    : path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
};
