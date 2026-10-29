import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

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

    // Generate tiles synchronously
    const generateTilesScript = path.join(__dirname, '../../../scripts/generate-tiles.sh');
    const inputPdf = file.path;
    const tilesDirName = file.filename.replace('.pdf', '');
    const outputDir = path.join(__dirname, '../../uploads/tiles', tilesDirName);

    try {
      const { execSync } = require('child_process');
      execSync(`${generateTilesScript} "${inputPdf}" "${outputDir}"`, { stdio: 'inherit' });
    } catch (e) {
      console.error('Failed to generate tiles during upload:', e);
      // We don't fail the request, just log it. They will be generated lazily if needed.
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

// Simple in-memory lock to prevent race conditions during lazy tile generation
const tileGenerationLocks: Record<string, boolean> = {};

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

    const tilesDirName = document.storageRef.replace('.pdf', '');
    const outputDir = path.join(__dirname, '../../uploads/tiles', tilesDirName);
    const metadataPath = path.join(outputDir, 'metadata.json');
    const inputPdf = path.join(__dirname, '../../uploads', document.storageRef);

    if (!fs.existsSync(metadataPath)) {
      if (!fs.existsSync(inputPdf)) {
        res.status(404).json({ error: 'Source PDF not found to generate tiles' });
        return;
      }

      // Check lock to prevent parallel generation
      if (tileGenerationLocks[document.id]) {
        res.status(429).json({ error: 'Tiles are currently being generated. Please try again in a few seconds.' });
        return;
      }

      console.log('Tiles not found. Generating lazily...');
      tileGenerationLocks[document.id] = true;
      const generateTilesScript = path.join(__dirname, '../../../scripts/generate-tiles.sh');
      try {
        const { execSync } = require('child_process');
        execSync(`${generateTilesScript} "${inputPdf}" "${outputDir}"`, { stdio: 'inherit' });
      } catch (e) {
        console.error('Failed to generate tiles lazily:', e);
        delete tileGenerationLocks[document.id];
        res.status(500).json({ error: 'Failed to generate tiles' });
        return;
      }
      delete tileGenerationLocks[document.id];
    }

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
  const { z, x, y } = req.params;

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

    const tilesDirName = document.storageRef.replace('.pdf', '');
    const tilePath = path.join(__dirname, '../../uploads/tiles', tilesDirName, z as string, x as string, `${y}.webp`);

    if (!fs.existsSync(tilePath)) {
      // Return 204 No Content for missing edge tiles as requested for MapLibre layout google padding
      res.status(204).end();
      return;
    }

    res.setHeader('Content-Type', 'image/webp');
    res.sendFile(tilePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
