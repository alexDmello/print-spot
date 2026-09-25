import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { PDFDocument } from 'pdf-lib';
import cron from 'node-cron';
import { config } from '../config/env';
import { query } from '../db';

// Ensure upload directory exists (wrapped in try/catch to avoid module-level crashes on serverless)
try {
  if (!fs.existsSync(config.uploadDir)) {
    fs.mkdirSync(config.uploadDir, { recursive: true });
  }
} catch (err) {
  console.warn('[Storage] Could not create upload directory:', config.uploadDir, err);
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// File filter accepting all file types (PDF, Office, Images, Text, etc.)
const fileFilter = (
  _req: any,
  _file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Support all file types for universal printing
  cb(null, true);
};

export const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024,
  },
  fileFilter,
});

/**
 * Calculates page count for PDF, Text, Images, and universal documents
 */
export async function getDocumentPageCount(filePath: string, mimetype: string): Promise<number> {
  const ext = path.extname(filePath).toLowerCase();

  // 1. PDF
  if (mimetype === 'application/pdf' || ext === '.pdf') {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
      return pdfDoc.getPageCount();
    } catch (err) {
      console.warn('[Storage] Failed to read PDF page count, defaulting to 1:', err);
      return 1;
    }
  }

  // 2. Text / CSV / Markdown files
  if (['.txt', '.csv', '.md', '.rtf', '.log'].includes(ext) || mimetype.startsWith('text/')) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').length;
      // Estimate ~45 lines or ~2500 chars per printed A4 page
      const byLines = Math.ceil(lines / 45);
      const byChars = Math.ceil(content.length / 2500);
      return Math.max(1, Math.max(byLines, byChars));
    } catch {
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
export function removeFile(filePathOrUrl: string): boolean {
  try {
    let localPath = filePathOrUrl;
    if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
      const fileName = path.basename(filePathOrUrl);
      localPath = path.join(config.uploadDir, fileName);
    } else if (!path.isAbsolute(filePathOrUrl)) {
      localPath = path.join(config.uploadDir, path.basename(filePathOrUrl));
    }

    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      console.log(`[Storage] Deleted file: ${localPath}`);
      return true;
    }
  } catch (err) {
    console.error(`[Storage] Error deleting file ${filePathOrUrl}:`, err);
  }
  return false;
}

/**
 * Background auto-delete policy:
 * Deletes uploaded files 24 hours after creation OR immediately upon pickup
 */
export function startStorageCleanupWorker(): void {
  // Run hourly: At minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('[Storage Cleanup] Running 24-hour file auto-delete policy check...');
    try {
      // Find jobs older than 24h OR picked up > 5 mins ago where file_url is not marked deleted
      const res = await query(
        `SELECT id, file_url, created_at, status, picked_up_at 
         FROM print_jobs 
         WHERE file_url NOT LIKE '%[DELETED]%' 
           AND (
             created_at < NOW() - INTERVAL '24 hours' 
             OR (status = 'picked_up' AND picked_up_at < NOW() - INTERVAL '5 minutes')
           )`
      );

      for (const row of res.rows) {
        removeFile(row.file_url);
        await query(
          `UPDATE print_jobs SET file_url = '[DELETED]' WHERE id = $1`,
          [row.id]
        );
        console.log(`[Storage Cleanup] Auto-deleted expired file for job ${row.id}`);
      }
    } catch (err) {
      console.error('[Storage Cleanup] Error running auto-delete job:', err);
    }
  });

  console.log('[Storage] Auto-delete cleanup cron scheduled (24h retention policy).');
}
