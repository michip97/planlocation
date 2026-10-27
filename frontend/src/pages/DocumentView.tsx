import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import PDFViewer from '../components/PDFViewer';
import TaskMarker from '../components/TaskMarker';
import TaskSidebar from '../components/TaskSidebar';
import { mockTasks } from '../data/mockData';
import type { Task, Project, Document } from '../types';
import { ArrowLeft } from 'lucide-react';

export default function DocumentView() {
  const { projectId, documentId } = useParams();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string>('');

  const token = localStorage.getItem('token');
  const currentPage = 1;

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    // Fetch project details to get the document filename
    const fetchDetails = async () => {
      try {
        const response = await axios.get('http://localhost:3000/api/projects', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const proj = response.data.find((p: Project) => p.id === projectId);
        if (proj) {
          setProject(proj);
          const doc = proj.documents.find((d: Document) => d.id === documentId);
          if (doc) setDocument(doc);
        }
      } catch (e) {
        console.error("Failed to load project details", e);
      }
    };

    fetchDetails();

    // The actual PDF binary is requested directly from the backend endpoint
    // To pass auth headers to a PDF viewer component efficiently, we fetch it as a blob
    const fetchPdfBlob = async () => {
      try {
        const res = await axios.get(`http://localhost:3000/api/documents/${documentId}/file`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        });
        const url = URL.createObjectURL(res.data);
        setPdfUrl(url);
      } catch (e) {
        console.error("Failed to fetch PDF", e);
      }
    };

    fetchPdfBlob();

    return () => {
      // Cleanup object URL
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, documentId, token, navigate]);

  const handlePdfClick = (e: React.MouseEvent, pageNumber: number) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const newTask: Task = {
      id: `task-temp-${Date.now()}`,
      title: 'Neue Pendenz',
      description: 'Bitte Details ergänzen...',
      projectId: projectId || 'proj-1',
      documentId: documentId || 'doc-1',
      page: pageNumber,
      position: { x, y },
      status: 'Offen',
      priority: 'Normal',
      createdAt: new Date().toISOString(),
    };

    setTasks([...tasks, newTask]);
    setActiveTask(newTask);
  };

  const handleTaskClick = (task: Task) => {
    setActiveTask(task);
  };

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
          <div className="text-sm bg-slate-700 px-3 py-1 rounded border border-slate-600 truncate max-w-xs">
            {document?.filename || 'Lade Plan...'}
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          {pdfUrl ? (
            <PDFViewer
              url={pdfUrl}
              onClick={handlePdfClick}
            >
              {tasks
                .filter(t => t.page === currentPage)
                .map(task => (
                  <TaskMarker
                    key={task.id}
                    task={task}
                    isActive={activeTask?.id === task.id}
                    onClick={handleTaskClick}
                  />
                ))
              }
            </PDFViewer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
              <p>Plan wird vom Server abgerufen...</p>
            </div>
          )}
        </div>
      </div>

      {activeTask && (
        <TaskSidebar
          task={activeTask}
          onClose={() => setActiveTask(null)}
        />
      )}
    </div>
  );
}
