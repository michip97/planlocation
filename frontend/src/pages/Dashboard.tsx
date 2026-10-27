import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import type { Project } from '../types';
import { FileText, Plus, LogOut, UploadCloud, ChevronRight } from 'lucide-react';

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    fetchProjects();
  }, [navigate, token]);

  const fetchProjects = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/projects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(response.data);
    } catch (error) {
      console.error('Failed to fetch projects', error);
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleCreateProject = async () => {
    const name = prompt('Name des neuen Projekts:');
    if (!name) return;

    try {
      await axios.post('http://localhost:3000/api/projects',
        { name, description: 'Neues Architekturprojekt' },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      fetchProjects();
    } catch (error) {
      alert('Fehler beim Erstellen des Projekts');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, projectId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Bitte nur PDF-Dateien hochladen.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(`http://localhost:3000/api/documents/project/${projectId}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      fetchProjects(); // refresh projects to show new document
    } catch (error) {
      alert('Fehler beim Hochladen der Datei.');
      console.error(error);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Lade Projekte...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-3">
             <div className="bg-blue-600 p-2 rounded-lg">
                <FileText size={24} className="text-white" />
             </div>
             <h1 className="text-xl font-bold text-slate-800">PlanSync Dashboard</h1>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-sm text-slate-600">Angemeldet als <strong>{user.firstName} {user.lastName}</strong></span>
            <button
              onClick={handleLogout}
              className="text-slate-500 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"
              title="Abmelden"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-slate-800">Meine Projekte</h2>
          <button
            onClick={handleCreateProject}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2 hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={20} />
            <span>Neues Projekt</span>
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <h3 className="text-lg font-medium text-slate-900 mb-2">Noch keine Projekte vorhanden</h3>
            <p className="text-slate-500 mb-6">Erstelle dein erstes Projekt, um Architekturpläne hochzuladen.</p>
            <button
              onClick={handleCreateProject}
              className="text-blue-600 font-medium hover:underline"
            >
              Jetzt Projekt erstellen
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => (
              <div key={project.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                <div className="p-6 border-b border-slate-100 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-slate-800 truncate pr-4" title={project.name}>{project.name}</h3>
                    <span className="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      Aktiv
                    </span>
                  </div>

                  <p className="text-sm text-slate-500 mb-4">{project.description || 'Keine Beschreibung'}</p>

                  <div className="space-y-3">
                    <div className="text-sm text-slate-600 flex justify-between items-center border-b pb-2">
                      <span>Dokumente:</span>
                      <span className="font-semibold bg-slate-100 px-2 py-1 rounded">{project.documents.length}</span>
                    </div>
                    <div className="text-sm text-slate-600 flex justify-between items-center">
                      <span>Pendenzen:</span>
                      <span className="font-semibold bg-slate-100 px-2 py-1 rounded">{project.tasks.length}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col space-y-3">
                  {project.documents.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Aktueller Plan</p>
                      {project.documents.map(doc => (
                        <button
                          key={doc.id}
                          onClick={() => navigate(`/viewer/${project.id}/${doc.id}`)}
                          className="w-full flex items-center justify-between bg-white border border-slate-200 p-2 rounded-lg hover:border-blue-500 hover:text-blue-600 transition-colors group"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <FileText size={16} className="text-slate-400 group-hover:text-blue-500 flex-shrink-0" />
                            <span className="text-sm font-medium truncate">{doc.filename}</span>
                          </div>
                          <ChevronRight size={16} className="text-slate-400 group-hover:text-blue-500 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      <p className="text-sm text-slate-500 mb-3">Kein Plan vorhanden</p>
                      <label className="cursor-pointer bg-white border border-dashed border-slate-300 rounded-lg px-4 py-3 flex items-center justify-center space-x-2 hover:bg-slate-50 hover:border-blue-400 transition-colors">
                        <UploadCloud size={18} className="text-blue-600" />
                        <span className="text-sm font-medium text-slate-700">PDF hochladen</span>
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, project.id)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
