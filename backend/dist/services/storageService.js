"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
exports.getDocumentPageCount = getDocumentPageCount;
exports.removeFile = removeFile;
exports.startStorageCleanupWorker = startStorageCleanupWorker;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const uuid_1 = require("uuid");
const pdf_lib_1 = require("pdf-lib");
const node_cron_1 = __importDefault(require("node-cron"));
const env_1 = require("../config/env");
const db_1 = require("../db");
// Ensure upload directory exists (wrapped in try/catch to avoid module-level crashes on serverless)
try {
    if (!fs_1.default.existsSync(env_1.config.uploadDir)) {
        fs_1.default.mkdirSync(env_1.config.uploadDir, { recursive: true });
    }
}
catch (err) {
    console.warn('[Storage] Could not create upload directory:', env_1.config.uploadDir, err);
}
// Multer Storage Configuration
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, env_1.config.uploadDir);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const uniqueName = `${(0, uuid_1.v4)()}${ext}`;
        cb(null, uniqueName);
    },
});
// File filter accepting all file types (PDF, Office, Images, Text, etc.)
const fileFilter = (_req, _file, cb) => {
    // Support all file types for universal printing
    cb(null, true);
};
exports.upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: env_1.config.maxFileSizeMb * 1024 * 1024,
    },
    fileFilter,
});
/**
 * Calculates page count for PDF, Text, Images, and universal documents
 */
async function getDocumentPageCount(filePath, mimetype) {
    const ext = path_1.default.extname(filePath).toLowerCase();
    // 1. PDF
    if (mimetype === 'application/pdf' || ext === '.pdf') {
        try {
            const fileBuffer = fs_1.default.readFileSync(filePath);
            const pdfDoc = await pdf_lib_1.PDFDocument.load(fileBuffer, { ignoreEncryption: true });
            return pdfDoc.getPageCount();
        }
        catch (err) {
            console.warn('[Storage] Failed to read PDF page count, defaulting to 1:', err);
            return 1;
        }
    }
    // 2. Text / CSV / Markdown files
    if (['.txt', '.csv', '.md', '.rtf', '.log'].includes(ext) || mimetype.startsWith('text/')) {
        try {
            const content = fs_1.default.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').length;
            // Estimate ~45 lines or ~2500 chars per printed A4 page
            const byLines = Math.ceil(lines / 45);
            const byChars = Math.ceil(content.length / 2500);
            return Math.max(1, Math.max(byLines, byChars));
        }
        catch {
            return 1;
        }
    }
    // 3. Images (JPG, PNG, WebP, etc.) are 1 page
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.svg'];
    if (imageExts.includes(ext) || mimetype.startsWith('image/')) {
        return 1;
    }
    // 4. Default for office files (.docx, .xlsx, .pptx)
    return 1;
}
/**
 * Safely unlinks a file from disk
 */
function removeFile(filePathOrUrl) {
    try {
        let localPath = filePathOrUrl;
        if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
            const fileName = path_1.default.basename(filePathOrUrl);
            localPath = path_1.default.join(env_1.config.uploadDir, fileName);
        }
        else if (!path_1.default.isAbsolute(filePathOrUrl)) {
            localPath = path_1.default.join(env_1.config.uploadDir, path_1.default.basename(filePathOrUrl));
        }
        if (fs_1.default.existsSync(localPath)) {
            fs_1.default.unlinkSync(localPath);
            console.log(`[Storage] Deleted file: ${localPath}`);
            return true;
        }
    }
    catch (err) {
        console.error(`[Storage] Error deleting file ${filePathOrUrl}:`, err);
    }
    return false;
}
/**
 * Background auto-delete policy:
 * Deletes uploaded files 24 hours after creation OR immediately upon pickup
 */
function startStorageCleanupWorker() {
    // Run hourly: At minute 0
    node_cron_1.default.schedule('0 * * * *', async () => {
        console.log('[Storage Cleanup] Running 24-hour file auto-delete policy check...');
        try {
            // Find jobs older than 24h OR picked up > 5 mins ago where file_url is not marked deleted
            const res = await (0, db_1.query)(`SELECT id, file_url, created_at, status, picked_up_at 
         FROM print_jobs 
         WHERE file_url NOT LIKE '%[DELETED]%' 
           AND (
             created_at < NOW() - INTERVAL '24 hours' 
             OR (status = 'picked_up' AND picked_up_at < NOW() - INTERVAL '5 minutes')
           )`);
            for (const row of res.rows) {
                removeFile(row.file_url);
                await (0, db_1.query)(`UPDATE print_jobs SET file_url = '[DELETED]' WHERE id = $1`, [row.id]);
                console.log(`[Storage Cleanup] Auto-deleted expired file for job ${row.id}`);
            }
        }
        catch (err) {
            console.error('[Storage Cleanup] Error running auto-delete job:', err);
        }
    });
    console.log('[Storage] Auto-delete cleanup cron scheduled (24h retention policy).');
}
