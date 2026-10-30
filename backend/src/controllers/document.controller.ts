import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PMTiles, Source, RangeResponse } from 'pmtiles';

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();

// In-memory lock map storing active tile generation promises per documentId
// to prevent duplicate concurrent vips processes during lazy generation.
const tileGenerationLocks = new Map<string, Promise<void>>();

// Cache PMTiles reader instances per file path + mtimeMs for fast direct tile lookups
const pmtilesReaderCache = new Map<string, { mtimeMs: number; pm: PMTiles }>();

class LocalFileSource implements Source {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  getKey(): string {
    return this.filePath;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const handle = await fs.promises.open(this.filePath, 'r');
    try {
      const stat = await handle.stat();
      const clampedLength = Math.max(0, Math.min(length, stat.size - offset));
      const buffer = Buffer.allocUnsafe(clampedLength);
      const { bytesRead } = await handle.read(buffer, 0, clampedLength, offset);
      const slice = buffer.subarray(0, bytesRead);
      return {
        data: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength)
      };
    } finally {
      await handle.close();
    }
  }
}

const getPmtilesReader = (pmtilesPath: string): PMTiles => {
  const stat = fs.statSync(pmtilesPath);
  const cached = pmtilesReaderCache.get(pmtilesPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.pm;
  }
  const pm = new PMTiles(new LocalFileSource(pmtilesPath));
  pmtilesReaderCache.set(pmtilesPath, { mtimeMs: stat.mtimeMs, pm });
  return pm;
};

/**
 * Resolves the path to `scripts/generate-tiles.sh` across both local development
 * (`<repo>/scripts/generate-tiles.sh`) and Docker production (`<app>/scripts/generate-tiles.sh`).
 */
const resolveGenerateTilesScript = (): string => {
  const rootCandidate = path.join(__dirname, '../../../scripts/generate-tiles.sh');
  if (fs.existsSync(rootCandidate)) {
    return rootCandidate;
  }
  return path.join(__dirname, '../../scripts/generate-tiles.sh');
};

/**
 * Returns the storage directory where `<documentId>.pmtiles` and `<documentId>.metadata.json`
 * are stored. Can be overridden via `TILES_STORAGE_DIR` in production.
 */
export const getTilesStorageDir = (): string => {
  const dir = process.env.TILES_STORAGE_DIR
    ? path.resolve(process.env.TILES_STORAGE_DIR)
    : path.resolve(__dirname, '../../../storage/tiles');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const getDocumentTilePaths = (documentId: string) => {
  const storageDir = getTilesStorageDir();
  return {
    storageDir,
    pmtilesPath: path.join(storageDir, `${documentId}.pmtiles`),
    metadataPath: path.join(storageDir, `${documentId}.metadata.json`)
  };
};

/**
 * Generates `<documentId>.pmtiles` and `<documentId>.metadata.json` from `inputPdf`.
 * Uses an in-memory Promise lock (`tileGenerationLocks`) per `documentId` so concurrent
 * requests for the same uncached document share a single `libvips` process.
 */
const ensureTilesGenerated = async (documentId: string, inputPdf: string): Promise<void> => {
  const existingLock = tileGenerationLocks.get(documentId);
  if (existingLock) {
    await existingLock;
    return;
  }

  const { storageDir } = getDocumentTilePaths(documentId);
  const generateTilesScript = resolveGenerateTilesScript();
  const generationPromise = (async () => {
    await execFileAsync('bash', [generateTilesScript, inputPdf, storageDir, documentId]);
  })();

  tileGenerationLocks.set(documentId, generationPromise);
  try {
    await generationPromise;
  } finally {
    tileGenerationLocks.delete(documentId);
  }
};

export const uploadDocument = async (req: AuthRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  const projectId = req.params.projectId as string;
  const file = req.file;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!file) {
    res.status(400).json({ error: 'No PDF file provided' });
    return;
  }

  try {
    // Verify the project exists and belongs to the tenant
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId }
    });

    if (!project) {
      // If project doesn't exist, cleanup the uploaded file
      fs.unlinkSync(file.path);
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const document = await prisma.document.create({
      data: {
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        storageRef: file.filename, // Multer saves it with a unique name
        projectId: project.id
      }
    });

    const inputPdf = file.path;

    try {
      await ensureTilesGenerated(document.id, inputPdf);
    } catch (e) {
      console.error('Failed to generate PMTiles during upload:', e);
      // Do not fail upload request; tiles will be generated lazily on metadata/pmtiles request if needed.
    }

    res.status(201).json(document);
  } catch (error) {
    console.error(error);
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDocumentFile = async (req: AuthRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  const documentId = req.params.documentId as string;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // First, find the document and ensure it belongs to a project in this tenant
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        project: {
          tenantId: tenantId
        }
      }
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const filePath = path.join(__dirname, '../../uploads', document.storageRef);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found on server' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(filePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDocumentPmtiles = async (req: AuthRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  const documentId = req.params.documentId as string;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const document = await prisma.document.findFirst({
      where: { id: documentId, project: { tenantId } }
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const { pmtilesPath, metadataPath } = getDocumentTilePaths(document.id);
    const inputPdf = path.join(__dirname, '../../uploads', document.storageRef);

    if (!fs.existsSync(pmtilesPath) || !fs.existsSync(metadataPath)) {
      if (!fs.existsSync(inputPdf)) {
        res.status(404).json({ error: 'Source PDF not found to generate tiles' });
        return;
      }

      console.log(`PMTiles for document ${document.id} not found. Generating lazily...`);
      try {
        await ensureTilesGenerated(document.id, inputPdf);
      } catch (e) {
        console.error('Failed to generate PMTiles lazily:', e);
        res.status(500).json({ error: 'Failed to generate tiles' });
        return;
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', 'application/vnd.pmtiles');
    res.sendFile(pmtilesPath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDocumentTilesMetadata = async (req: AuthRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  const documentId = req.params.documentId as string;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const document = await prisma.document.findFirst({
      where: { id: documentId, project: { tenantId } }
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const { pmtilesPath, metadataPath } = getDocumentTilePaths(document.id);
    const inputPdf = path.join(__dirname, '../../uploads', document.storageRef);

    if (!fs.existsSync(metadataPath) || !fs.existsSync(pmtilesPath)) {
      if (!fs.existsSync(inputPdf)) {
        res.status(404).json({ error: 'Source PDF not found to generate tiles' });
        return;
      }

      console.log(`Tiles for document ${document.id} not found. Generating lazily...`);
      try {
        await ensureTilesGenerated(document.id, inputPdf);
      } catch (e) {
        console.error('Failed to generate tiles lazily:', e);
        res.status(500).json({ error: 'Failed to generate tiles' });
        return;
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(metadataPath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDocumentTile = async (req: AuthRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  const documentId = req.params.documentId as string;
  const z = req.params.z as string;
  const x = req.params.x as string;
  const y = req.params.y as string;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
    res.status(400).json({ error: 'Invalid tile coordinates' });
    return;
  }

  try {
    const document = await prisma.document.findFirst({
      where: { id: documentId, project: { tenantId } }
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const { pmtilesPath, metadataPath } = getDocumentTilePaths(document.id);
    const inputPdf = path.join(__dirname, '../../uploads', document.storageRef);

    if (!fs.existsSync(pmtilesPath) || !fs.existsSync(metadataPath)) {
      if (!fs.existsSync(inputPdf)) {
        res.status(404).json({ error: 'Source PDF not found to generate tiles' });
        return;
      }

      try {
        await ensureTilesGenerated(document.id, inputPdf);
      } catch (e) {
        console.error('Failed to generate tiles lazily:', e);
        res.status(500).json({ error: 'Failed to generate tiles' });
        return;
      }
    }

    const pm = getPmtilesReader(pmtilesPath);
    const tile = await pm.getZxy(parseInt(z, 10), parseInt(x, 10), parseInt(y, 10));

    if (!tile || !tile.data || tile.data.byteLength === 0) {
      // Return 204 No Content for missing edge/blank tiles in Google layout
      res.status(204).end();
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', 'image/webp');
    res.send(Buffer.from(tile.data));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteDocument = async (req: AuthRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  const documentId = req.params.documentId as string;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const document = await prisma.document.findFirst({
      where: { id: documentId, project: { tenantId } }
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const filePath = path.join(__dirname, '../../uploads', document.storageRef);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const { pmtilesPath, metadataPath } = getDocumentTilePaths(document.id);
    pmtilesReaderCache.delete(pmtilesPath);
    if (fs.existsSync(pmtilesPath)) {
      fs.unlinkSync(pmtilesPath);
    }
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }

    await prisma.document.delete({ where: { id: document.id } });
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
