"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const storageService_1 = require("../services/storageService");
const router = (0, express_1.Router)();
router.post('/', (req, res, next) => {
    storageService_1.upload.single('file')(req, res, async (err) => {
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
            const pageCount = await (0, storageService_1.getDocumentPageCount)(file.path, file.mimetype);
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
        }
        catch (processErr) {
            console.error('[Upload] Error processing file:', processErr);
            res.status(500).json({ error: 'Failed to process uploaded file.' });
        }
    });
});
exports.default = router;
