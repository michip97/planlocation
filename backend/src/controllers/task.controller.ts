import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth';

const prisma = new PrismaClient();

export const getTasks = async (req: AuthRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  const projectId = req.params.projectId as string;
  const documentId = req.params.documentId as string;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        projectId,
        documentId,
        project: { tenantId }
      }
    });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createTask = async (req: AuthRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  const userId = req.user?.id;
  const projectId = req.params.projectId as string;
  const documentId = req.params.documentId as string;
  const { id, title, description, status, priority, page, posX, posY } = req.body;

  if (!tenantId || !userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId }
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Check if task with ID already exists (can happen on retry from syncQueue)
    if (id) {
        const existing = await prisma.task.findUnique({ where: { id }});
        if (existing) {
            // Already synced, just return it
            res.status(200).json(existing);
            return;
        }
    }

    const task = await prisma.task.create({
      data: {
        id: id || undefined,
        title,
        description,
        status,
        priority,
        page,
        posX,
        posY,
        projectId,
        documentId,
        creatorId: userId
      }
    });
    res.status(201).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateTask = async (req: AuthRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  const taskId = req.params.taskId as string;
  const { title, description, status, priority, assigneeId, dueDate } = req.body;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, project: { tenantId } }
    });

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: { title, description, status, priority, assigneeId, dueDate: dueDate ? new Date(dueDate) : null }
    });
    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  const taskId = req.params.taskId as string;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, project: { tenantId } }
    });

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    await prisma.task.delete({ where: { id: taskId } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
