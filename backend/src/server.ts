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
import adminRoutes from './routes/adminRoutes';

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

// API Routes (Mounted both with and without /api prefix for Vercel rewrite compatibility)
app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/upload', '/upload'], uploadRoutes);
app.use(['/api/payments', '/payments'], paymentRoutes);
app.use(['/api/jobs', '/jobs'], jobRoutes);
app.use(['/api/queue', '/queue'], queueRoutes);
app.use(['/api/shops', '/shops'], shopRoutes);
app.use(['/api/admin', '/admin'], adminRoutes);

// Health check
app.get(['/health', '/api/health'], (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'PrintSpot Backend',
    timestamp: new Date().toISOString(),
    databaseConfigured: Boolean(config.databaseUrl),
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
  } catch (err) {
    console.error('[Startup] Warning: Database connection deferred/failed:', err);
  }

  try {
    // 2. Initialize 24h File Auto-Delete Cron
    startStorageCleanupWorker();

    // 3. Initialize Socket.IO Realtime Engine
    initSocketServer(httpServer);

    // 4. Start HTTP Server
    if (!httpServer.listening) {
      const port = parseInt(process.env.PORT || `${config.port || 5000}`, 10);
      httpServer.listen(port, '0.0.0.0', () => {
        console.log(`===============================================`);
        console.log(`🚀 PrintSpot Backend running on port ${port}`);
        console.log(`📡 WebSocket & REST API ready`);
        console.log(`📁 Upload storage directory: ${config.uploadDir}`);
        console.log(`===============================================`);
      });
    }
  } catch (err) {
    console.error('Fatal startup error:', err);
  }
}

// Only auto-start persistent background listeners in standalone (non-Vercel Serverless) environments
if (!process.env.VERCEL && !process.env.NOW_REGION) {
  startServer();
}

// Export directly as module.exports for Vercel Serverless Function compatibility
// Vercel's Express framework builder expects: module.exports = expressApp
(app as any).default = app;
(module as any).exports = app;
