import { Router } from 'express';
import { getProjects, createProject } from '../controllers/project.controller';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken); // Protect all project routes

router.get('/', getProjects);
router.post('/', createProject);

export default router;
