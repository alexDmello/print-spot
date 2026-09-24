import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import { upload, getDocumentPageCount } from '../services/storageService';
import { config } from '../config/env';

const router = Router();

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, async (err: any) => {
    if (err) {
      return res.status(400).json({
        error: err.message || 'File upload failed. Ensure the file is a PDF, JPG, or PNG under 50MB.',
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please select a document.' });
    }

    try {
      const file = req.file;
      const pageCount = await getDocumentPageCount(file.path, file.mimetype);
      const relativePath = `/uploads/${file.filename}`;
      const fullUrl = `${req.protocol}://${req.get('host')}${relativePath}`;

      res.status(200).json({
        success: true,
        fileName: file.originalname,
        storedName: file.filename,
        fileUrl: fullUrl,
        relativePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        pageCount,
      });
    } catch (processErr: any) {
      console.error('[Upload] Error processing file:', processErr);
      res.status(500).json({ error: 'Failed to process uploaded file.' });
    }
  });
});

export default router;
