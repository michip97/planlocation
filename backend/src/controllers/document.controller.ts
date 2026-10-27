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
