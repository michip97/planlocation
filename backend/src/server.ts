import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/project.routes';
import documentRoutes from './routes/document.routes';
import taskRoutes from './routes/task.routes';
import fs from 'fs';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', 'upgrade-insecure-requests');
  }
  next();
});

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/tasks', taskRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Pendenzen API is running' });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'API route not found' });
  } else {
    const indexPath = path.join(__dirname, '../public/index.html');
    if (fs.existsSync(indexPath)) {
       res.sendFile(indexPath);
    } else {
       res.status(404).send('Frontend not built yet. Run npm run build in frontend folder.');
    }
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
