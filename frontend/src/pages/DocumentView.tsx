import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import MapLibrePlanViewer from '../components/MapLibrePlanViewer';
import TaskSidebar from '../components/TaskSidebar';
import type { Task, Project, Document } from '../types';
import { ArrowLeft, Cloud, CloudOff } from 'lucide-react';
import { addToSyncQueue, processSyncQueue } from '../utils/syncManager';
import {
  cacheTasks, getCachedTasks,
  cacheProjectDetails, getCachedProjectDetails,
  cachePdfBlob, getCachedPdfBlob
} from '../utils/offlineCache';
import { v4 as uuidv4 } from 'uuid';

export default function DocumentView() {
  const { projectId, documentId } = useParams();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const token = localStorage.getItem('token');
  const currentPage = 1;

  // Handle Online/Offline Status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processSyncQueue().then(() => fetchTasks()); // Sync and refresh
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchTasks = async () => {
    if (!projectId || !documentId) return;

    if (navigator.onLine && token) {
      try {
        const response = await axios.get(`/api/tasks/${projectId}/${documentId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const fetchedTasks = response.data;
        setTasks(fetchedTasks);
        await cacheTasks(projectId, documentId, fetchedTasks);
      } catch (e) {
        console.error("Failed to load tasks", e);
        const cached = await getCachedTasks(projectId, documentId);
        setTasks(cached);
      }
    } else {
      const cached = await getCachedTasks(projectId, documentId);
      setTasks(cached);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    if (!projectId || !documentId) return;

    const fetchDetails = async () => {
      if (navigator.onLine) {
        try {
          const response = await axios.get('/api/projects', {
            headers: { Authorization: `Bearer ${token}` }
          });
          const proj = response.data.find((p: Project) => p.id === projectId);
          if (proj) {
            setProject(proj);
            await cacheProjectDetails(projectId, proj);
            const doc = proj.documents.find((d: Document) => d.id === documentId);
            if (doc) setDocument(doc);
          }
        } catch (e) {
          console.error("Failed to load project details", e);
          const cachedProj = await getCachedProjectDetails(projectId);
          if (cachedProj) {
            setProject(cachedProj);
            const doc = cachedProj.documents.find((d: Document) => d.id === documentId);
            if (doc) setDocument(doc);
          }
        }
      } else {
        const cachedProj = await getCachedProjectDetails(projectId);
        if (cachedProj) {
          setProject(cachedProj);
          const doc = cachedProj.documents.find((d: Document) => d.id === documentId);
          if (doc) setDocument(doc);
        }
      }
    };

    const fetchPdfBlob = async () => {
      if (navigator.onLine) {
        try {
          const res = await axios.get(`/api/documents/${documentId}/file`, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob'
          });
          const url = URL.createObjectURL(res.data);
          setPdfUrl(url);
          await cachePdfBlob(documentId, res.data);
        } catch (e) {
          console.error("Failed to fetch PDF", e);
          const cachedBlob = await getCachedPdfBlob(documentId);
          if (cachedBlob) {
            setPdfUrl(URL.createObjectURL(cachedBlob));
          }
        }
      } else {
        const cachedBlob = await getCachedPdfBlob(documentId);
        if (cachedBlob) {
          setPdfUrl(URL.createObjectURL(cachedBlob));
        } else {
          console.warn("Offline: PDF cannot be loaded currently.");
        }
      }
    };

    fetchDetails();
    fetchPdfBlob();
    fetchTasks();

    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, documentId, token, navigate]);

  const handlePlanClick = async ({ x, y }: { x: number; y: number }) => {
    const newTask: Task = {
      id: uuidv4(),
      title: 'Neue Pendenz',
      description: '',
      projectId: projectId || '',
      documentId: documentId || '',
      page: currentPage,
      position: { x, y },
      status: 'Offen',
      priority: 'Normal',
      createdAt: new Date().toISOString(),
    };

    const updatedTasks = [...tasks, newTask];
    setTasks(updatedTasks);
    setActiveTask(newTask);

    if (projectId && documentId) {
      await cacheTasks(projectId, documentId, updatedTasks);
    }

    const apiPayload = {
      ...newTask,
      posX: x,
      posY: y,
    };

    if (isOnline && token) {
      try {
        await axios.post(`/api/tasks/${projectId}/${documentId}`, apiPayload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (error) {
        console.error("Failed to save task immediately, queuing...", error);
        await addToSyncQueue({ id: uuidv4(), type: 'CREATE_TASK', payload: apiPayload, timestamp: Date.now() });
      }
    } else {
      console.log("Offline: Queuing task creation.");
      await addToSyncQueue({ id: uuidv4(), type: 'CREATE_TASK', payload: apiPayload, timestamp: Date.now() });
    }
  };

  const handleTaskClick = (task: Task) => {
    setActiveTask(task);
  };

  const handleTaskUpdate = async (updatedTask: Task) => {
    const updatedTasks = tasks.map(t => t.id === updatedTask.id ? updatedTask : t);
    setTasks(updatedTasks);
    setActiveTask(updatedTask);

    if (projectId && documentId) {
      await cacheTasks(projectId, documentId, updatedTasks);
    }

    if (isOnline && token) {
      try {
        await axios.put(`/api/tasks/${updatedTask.id}`, updatedTask, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (error) {
        console.error("Failed to update task, queuing...", error);
        await addToSyncQueue({ id: uuidv4(), type: 'UPDATE_TASK', payload: updatedTask, timestamp: Date.now() });
      }
    } else {
      console.log("Offline: Queuing task update.");
      await addToSyncQueue({ id: uuidv4(), type: 'UPDATE_TASK', payload: updatedTask, timestamp: Date.now() });
    }
  };

  const formattedTasks = tasks.map(t => {
    if ((t as any).posX !== undefined) {
      return {
        ...t,
        position: { x: (t as any).posX, y: (t as any).posY }
      };
    }
    return t;
  });

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden relative">
      <div className="flex-1 flex flex-col relative z-0">
        <div className="bg-slate-800 text-white p-4 shadow-md flex justify-between items-center z-30 relative">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 hover:bg-slate-700 rounded-full transition-colors"
              title="Zurück zum Dashboard"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="font-bold text-xl truncate max-w-md">
              Plan: {project?.name || 'Wird geladen...'}
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            {isOnline ? (
               <div className="flex items-center text-sm text-green-400" title="Online und synchronisiert">
                 <Cloud size={16} className="mr-1" /> Online
               </div>
            ) : (
               <div className="flex items-center text-sm text-yellow-400" title="Offline. Änderungen werden lokal gespeichert.">
                 <CloudOff size={16} className="mr-1" /> Offline
               </div>
            )}
            <div className="text-sm bg-slate-700 px-3 py-1 rounded border border-slate-600 truncate max-w-xs">
              {document?.filename || 'Lade Plan...'}
            </div>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          {pdfUrl ? (
            <MapLibrePlanViewer
              url={`/api/documents/${documentId}/file`}
              onPlanClick={handlePlanClick}
              onPinClick={handleTaskClick}
              tasks={formattedTasks.filter(t => t.page === currentPage)}
              activeTaskId={activeTask?.id || null}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400">
              {isOnline ? (
                 <>
                   <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                   <p>Plan wird vom Server abgerufen...</p>
                 </>
              ) : (
                 <p>Du bist offline. Der Plan wurde noch nicht lokal gespeichert.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {activeTask && (
        <TaskSidebar
          task={activeTask}
          onClose={() => setActiveTask(null)}
          onUpdate={handleTaskUpdate}
        />
      )}
    </div>
  );
}
