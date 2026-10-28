import { Router } from 'express';
import { getTasks, createTask, updateTask, deleteTask } from '../controllers/task.controller';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken); // Protect all task routes

router.get('/:projectId/:documentId', getTasks);
router.post('/:projectId/:documentId', createTask);
router.put('/:taskId', updateTask);
router.delete('/:taskId', deleteTask);

export default router;
