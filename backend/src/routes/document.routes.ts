import fs from 'fs';
import { Router } from 'express';
import { uploadDocument, getDocumentFile, getDocumentTilesMetadata, getDocumentTile } from '../controllers/document.controller';
import { authenticateToken } from '../middlewares/auth';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

// Setup multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    cb(null, uniqueSuffix + '.pdf');
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max size for large architectural plans
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

const router = Router();

router.use(authenticateToken); // Protect routes

router.post('/project/:projectId', upload.single('file'), uploadDocument);
router.get('/:documentId/file', getDocumentFile);
router.get('/:documentId/tiles/metadata.json', getDocumentTilesMetadata);
router.get('/:documentId/tiles/:z/:x/:y.webp', getDocumentTile);

export default router;
