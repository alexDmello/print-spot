import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import { initDb } from './db';
import { initSocketServer } from './socket/socketHandler';
import { startStorageCleanupWorker } from './services/storageService';

import authRoutes from './routes/authRoutes';
import uploadRoutes from './routes/uploadRoutes';
import paymentRoutes from './routes/paymentRoutes';
import jobRoutes from './routes/jobRoutes';
import queueRoutes from './routes/queueRoutes';
import shopRoutes from './routes/shopRoutes';

const app = express();
const httpServer = http.createServer(app);

// Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically (with inline preview & CORS enabled)
app.use(
  '/uploads',
  express.static(config.uploadDir, {
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Disposition', 'inline');
    },
  })
);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/shops', shopRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'PrintSpot Backend',
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

async function startServer(): Promise<void> {
  try {
    // 1. Initialize Database & Migrations
    await initDb();

    // 2. Initialize 24h File Auto-Delete Cron
    startStorageCleanupWorker();

    // 3. Initialize Socket.IO Realtime Engine
    initSocketServer(httpServer);

    // 4. Start HTTP Server
    httpServer.listen(config.port, () => {
      console.log(`===============================================`);
      console.log(`🚀 PrintSpot Backend running on port ${config.port}`);
      console.log(`📡 WebSocket & REST API ready`);
      console.log(`📁 Upload storage directory: ${config.uploadDir}`);
      console.log(`===============================================`);
    });
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

startServer();
