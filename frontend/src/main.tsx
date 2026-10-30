import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TasksList from './pages/TasksList';
import DocumentView from './pages/DocumentView'
import './index.css';
import PWABadge from './components/PWABadge';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <BrowserRouter>
    <PWABadge />
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/tasks" element={<TasksList />} />
      <Route path="/viewer/:projectId/:documentId" element={<DocumentView />} />
    </Routes>
  </BrowserRouter>,
)
