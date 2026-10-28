import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth';

const prisma = new PrismaClient();

export const getAllTasks = async (req: AuthRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  const { status, priority, projectId } = req.query;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Build filter object based on provided query params
    const filter: any = {
      project: { tenantId }
    };

    if (status) filter.status = String(status);
    if (priority) filter.priority = String(priority);
    if (projectId) filter.projectId = String(projectId);

    const tasks = await prisma.task.findMany({
      where: filter,
      include: {
        project: {
          select: { name: true }
        },
        document: {
          select: { filename: true }
        },
        assignee: {
          select: { firstName: true, lastName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
