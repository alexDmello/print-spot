"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./config/env");
const db_1 = require("./db");
const socketHandler_1 = require("./socket/socketHandler");
const storageService_1 = require("./services/storageService");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const uploadRoutes_1 = __importDefault(require("./routes/uploadRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const jobRoutes_1 = __importDefault(require("./routes/jobRoutes"));
const queueRoutes_1 = __importDefault(require("./routes/queueRoutes"));
const shopRoutes_1 = __importDefault(require("./routes/shopRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const app = (0, express_1.default)();
const httpServer = http_1.default.createServer(app);
// Middlewares
app.use((0, cors_1.default)({ origin: '*' }));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Serve uploaded files statically (with inline preview & CORS enabled)
app.use('/uploads', express_1.default.static(env_1.config.uploadDir, {
    setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Disposition', 'inline');
    },
}));
// API Routes (Mounted both with and without /api prefix for Vercel rewrite compatibility)
app.use(['/api/auth', '/auth'], authRoutes_1.default);
app.use(['/api/upload', '/upload'], uploadRoutes_1.default);
app.use(['/api/payments', '/payments'], paymentRoutes_1.default);
app.use(['/api/jobs', '/jobs'], jobRoutes_1.default);
app.use(['/api/queue', '/queue'], queueRoutes_1.default);
app.use(['/api/shops', '/shops'], shopRoutes_1.default);
app.use(['/api/admin', '/admin'], adminRoutes_1.default);
// Health check
app.get(['/health', '/api/health'], (_req, res) => {
    res.json({
        status: 'healthy',
        service: 'PrintSpot Backend',
        timestamp: new Date().toISOString(),
        databaseConfigured: Boolean(env_1.config.databaseUrl),
    });
});
// Error handling middleware
app.use((err, _req, res, _next) => {
    console.error('[Server Error]', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
    });
});
async function startServer() {
    try {
        // 1. Initialize Database & Migrations
        await (0, db_1.initDb)();
    }
    catch (err) {
        console.error('[Startup] Warning: Database connection deferred/failed:', err);
    }
    try {
        // 2. Initialize 24h File Auto-Delete Cron
        (0, storageService_1.startStorageCleanupWorker)();
        // 3. Initialize Socket.IO Realtime Engine
        (0, socketHandler_1.initSocketServer)(httpServer);
        // 4. Start HTTP Server
        if (!httpServer.listening) {
            const port = parseInt(process.env.PORT || `${env_1.config.port || 5000}`, 10);
            httpServer.listen(port, '0.0.0.0', () => {
                console.log(`===============================================`);
                console.log(`🚀 PrintSpot Backend running on port ${port}`);
                console.log(`📡 WebSocket & REST API ready`);
                console.log(`📁 Upload storage directory: ${env_1.config.uploadDir}`);
                console.log(`===============================================`);
            });
        }
    }
    catch (err) {
        console.error('Fatal startup error:', err);
    }
}
// Only auto-start persistent background listeners in standalone (non-Vercel Serverless) environments
if (!process.env.VERCEL && !process.env.NOW_REGION) {
    startServer();
}
// Export directly as module.exports for Vercel Serverless Function compatibility
// Vercel's Express framework builder expects: module.exports = expressApp
app.default = app;
module.exports = app;
