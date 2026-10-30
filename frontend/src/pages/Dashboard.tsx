import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import type { Project } from '../types';
import { Plus, UploadCloud, ChevronRight, Download, Trash2, CheckCircle2, Cloud, FileText, QrCode, Loader2 } from 'lucide-react';
import QRCodeModal from '../components/QRCodeModal';
import Navbar from '../components/Navbar';
import {
  getOfflineProjectsRegistry,
  downloadProjectForOffline,
  removeProjectData,
  getCachedProjectDetails
} from '../utils/offlineCache';

interface UploadStatus {
  progress: number;
  phase: 'uploading' | 'tiling' | 'done';
  filename: string;
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [offlineRegistry, setOfflineRegistry] = useState<string[]>([]);
  const [downloadingProjects, setDownloadingProjects] = useState<Record<string, number>>({});
  const [uploadingProjects, setUploadingProjects] = useState<Record<string, UploadStatus>>({});
  const [loading, setLoading] = useState(true);
  const [qrModal, setQrModal] = useState<{url: string, title: string} | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }, [navigate]);

  const fetchProjects = useCallback(async () => {
    if (navigator.onLine) {
      try {
        const response = await axios.get('/api/projects', {
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
    } else {
      // If offline, only load projects from the offline registry
      const registry = await getOfflineProjectsRegistry();
      const offlineProjs: Project[] = [];
      for (const id of registry) {
        const cachedProj = await getCachedProjectDetails(id);
        if (cachedProj) offlineProjs.push(cachedProj);
      }
      setProjects(offlineProjs);
      setLoading(false);
    }
  }, [token, handleLogout]);

  const loadOfflineRegistry = useCallback(async () => {
    const registry = await getOfflineProjectsRegistry();
    setOfflineRegistry(registry);
  }, []);

  // Handle Online/Offline Status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void fetchProjects();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchProjects]);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    void fetchProjects();
    void loadOfflineRegistry();
  }, [navigate, token, fetchProjects, loadOfflineRegistry]);

  const handleCreateProject = async () => {
    if (!navigator.onLine) {
      alert("Projekte können nur online erstellt werden.");
      return;
    }
    const name = prompt('Name des neuen Projekts:');
    if (!name) return;

    try {
      await axios.post('/api/projects',
        { name, description: 'Neues Architekturprojekt' },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      await fetchProjects();
    } catch (err) {
      console.error(err);
      alert('Fehler beim Erstellen des Projekts');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, projectId: string) => {
    if (!navigator.onLine) {
      alert("Dateien können nur online hochgeladen werden.");
      return;
    }
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Bitte nur PDF-Dateien hochladen.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploadingProjects(prev => ({
      ...prev,
      [projectId]: { progress: 2, phase: 'uploading', filename: file.name }
    }));

    let tilingTimer: ReturnType<typeof setInterval> | null = null;

    try {
      await axios.post(`/api/documents/project/${projectId}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || file.size || 1;
          const rawRatio = Math.min(1, Math.max(0, progressEvent.loaded / total));

          if (rawRatio < 1) {
            // Scale HTTP upload phase from 2% to 75%
            const scaledProgress = Math.max(2, Math.round(rawRatio * 75));
            setUploadingProjects(prev => ({
              ...prev,
              [projectId]: {
                progress: scaledProgress,
                phase: 'uploading',
                filename: file.name
              }
            }));
          } else if (!tilingTimer) {
            // File bytes have arrived at server; backend is now rendering WebP tiles & packing .pmtiles in /dev/shm
            setUploadingProjects(prev => ({
              ...prev,
              [projectId]: {
                progress: 78,
                phase: 'tiling',
                filename: file.name
              }
            }));

            tilingTimer = setInterval(() => {
              setUploadingProjects(prev => {
                const current = prev[projectId];
                if (!current || current.phase !== 'tiling') return prev;
                const nextProgress = Math.min(96, current.progress + 2);
                return {
                  ...prev,
                  [projectId]: { ...current, progress: nextProgress }
                };
              });
            }, 250);
          }
        }
      });

      if (tilingTimer) {
        clearInterval(tilingTimer);
        tilingTimer = null;
      }

      setUploadingProjects(prev => ({
        ...prev,
        [projectId]: { progress: 100, phase: 'done', filename: file.name }
      }));

      await fetchProjects();

      setTimeout(() => {
        setUploadingProjects(prev => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
      }, 450);
    } catch (error) {
      if (tilingTimer) {
        clearInterval(tilingTimer);
      }
      setUploadingProjects(prev => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      alert('Fehler beim Hochladen der Datei.');
      console.error(error);
    }
  };

  const handleDownloadOffline = async (project: Project) => {
    if (!token || !navigator.onLine) {
      alert("Sie müssen online sein, um Projekte herunterzuladen.");
      return;
    }
    setDownloadingProjects(prev => ({ ...prev, [project.id]: 0 }));

    try {
      await downloadProjectForOffline(project, token, (progress) => {
        setDownloadingProjects(prev => ({ ...prev, [project.id]: progress }));
      });
      // Small delay so user sees 100%
      setTimeout(() => {
        setDownloadingProjects(prev => {
          const next = { ...prev };
          delete next[project.id];
          return next;
        });
        void loadOfflineRegistry();
      }, 500);
    } catch (err) {
      console.error(err);
      alert("Fehler beim Herunterladen des Projekts für den Offline-Modus.");
      setDownloadingProjects(prev => {
        const next = { ...prev };
        delete next[project.id];
        return next;
      });
    }
  };

  const handleRemoveOffline = async (project: Project) => {
    if (confirm(`Soll das Projekt "${project.name}" vom Gerät gelöscht werden? (Daten bleiben auf dem Server)`)) {
      await removeProjectData(project);
      await loadOfflineRegistry();
      // If we are currently offline, removing it should also remove it from view
      if (!isOnline) {
        void fetchProjects();
      }
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Lade Projekte...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-slate-800">
            {isOnline ? "Meine Projekte" : "Offline verfügbare Projekte"}
          </h2>
          <button
            onClick={handleCreateProject}
            disabled={!isOnline}
            className={`px-4 py-2 rounded-lg font-medium flex items-center space-x-2 transition-colors shadow-sm
              ${isOnline ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}
            `}
          >
            <Plus size={20} />
            <span>Neues Projekt</span>
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <h3 className="text-lg font-medium text-slate-900 mb-2">
                {isOnline ? "Noch keine Projekte vorhanden" : "Keine Offline-Projekte gefunden"}
            </h3>
            <p className="text-slate-500 mb-6">
                {isOnline
                  ? "Erstelle dein erstes Projekt, um Architekturpläne hochzuladen."
                  : "Du hast noch keine Projekte für die Offline-Nutzung heruntergeladen."}
            </p>
            {isOnline && (
                <button
                onClick={handleCreateProject}
                className="text-blue-600 font-medium hover:underline"
                >
                Jetzt Projekt erstellen
                </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => {
              const isOffline = offlineRegistry.includes(project.id);
              const downloadProgress = downloadingProjects[project.id];
              const isDownloading = downloadProgress !== undefined;
              const uploadStatus = uploadingProjects[project.id];
              const isUploading = uploadStatus !== undefined;

              return (
                <div key={project.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow relative">

                  {isDownloading && (
                    <div className="absolute inset-0 bg-white/85 z-20 flex flex-col items-center justify-center p-6 text-center backdrop-blur-sm">
                      <Loader2 size={28} className="animate-spin text-blue-600 mb-2" />
                      <div className="text-slate-800 font-medium mb-2">Lade für Offline-Nutzung...</div>
                      <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.round(downloadProgress)}%` }}
                        ></div>
                      </div>
                      <div className="text-sm font-semibold text-slate-600">{Math.round(downloadProgress)}%</div>
                    </div>
                  )}

                  {isUploading && (
                    <div className="absolute inset-0 bg-white/90 z-20 flex flex-col items-center justify-center p-6 text-center backdrop-blur-sm">
                      {uploadStatus.phase === 'done' ? (
                        <CheckCircle2 size={32} className="text-emerald-600 mb-2" />
                      ) : (
                        <Loader2 size={32} className="animate-spin text-blue-600 mb-2" />
                      )}
                      <div className="text-slate-800 font-semibold mb-1">
                        {uploadStatus.phase === 'uploading' && 'PDF wird hochgeladen...'}
                        {uploadStatus.phase === 'tiling' && 'Kacheln (.pmtiles) werden generiert...'}
                        {uploadStatus.phase === 'done' && 'Plan erfolgreich verarbeitet!'}
                      </div>
                      <div className="text-xs text-slate-500 truncate max-w-full px-2 mb-3">
                        {uploadStatus.filename}
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-200 ${
                            uploadStatus.phase === 'done' ? 'bg-emerald-600' : 'bg-blue-600'
                          }`}
                          style={{ width: `${Math.round(uploadStatus.progress)}%` }}
                        ></div>
                      </div>
                      <div className="text-xs font-semibold text-slate-600">
                        {Math.round(uploadStatus.progress)}%
                        {uploadStatus.phase === 'tiling' && ' · Hochauflösende Zoomstufen im RAM'}
                      </div>
                    </div>
                  )}

                  <div className="p-6 border-b border-slate-100 flex-1">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-bold text-slate-800 truncate pr-4" title={project.name}>{project.name}</h3>
                      {isOffline ? (
                        <span className="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center" title="Lokal auf dem Gerät gespeichert">
                          <CheckCircle2 size={14} className="mr-1" /> Offline
                        </span>
                      ) : (
                        <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center" title="Benötigt Internet">
                          <Cloud size={14} className="mr-1" /> Online
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-slate-500 mb-4">{project.description || 'Keine Beschreibung'}</p>

                    <div className="space-y-3">
                      <div className="text-sm text-slate-600 flex justify-between items-center border-b pb-2">
                        <span>Dokumente:</span>
                        <span className="font-semibold bg-slate-100 px-2 py-1 rounded">{project.documents?.length || 0}</span>
                      </div>
                      <div className="text-sm text-slate-600 flex justify-between items-center">
                        <span>Pendenzen:</span>
                        <span className="font-semibold bg-slate-100 px-2 py-1 rounded">{project.tasks?.length || 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col space-y-3">
                    {project.documents && project.documents.length > 0 ? (
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
                        <label className={`mt-1 bg-white border border-dashed border-slate-300 rounded-lg px-3 py-2 flex items-center justify-center space-x-2 transition-colors
                           ${isOnline && !isUploading ? 'cursor-pointer hover:bg-slate-50 hover:border-blue-400' : 'opacity-50 cursor-not-allowed'}
                        `}>
                          <UploadCloud size={15} className={isOnline ? 'text-blue-600' : 'text-slate-400'} />
                          <span className="text-xs font-medium text-slate-600">Weiteren Plan (PDF) hochladen</span>
                          <input
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            disabled={!isOnline || isUploading}
                            onChange={(e) => handleFileUpload(e, project.id)}
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="text-center py-2">
                        <p className="text-sm text-slate-500 mb-3">Kein Plan vorhanden</p>
                        <label className={`bg-white border border-dashed border-slate-300 rounded-lg px-4 py-3 flex items-center justify-center space-x-2 transition-colors
                           ${isOnline && !isUploading ? 'cursor-pointer hover:bg-slate-50 hover:border-blue-400' : 'opacity-50 cursor-not-allowed'}
                        `}>
                          <UploadCloud size={18} className={isOnline ? 'text-blue-600' : 'text-slate-400'} />
                          <span className="text-sm font-medium text-slate-700">PDF hochladen</span>
                          <input
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            disabled={!isOnline || isUploading}
                            onChange={(e) => handleFileUpload(e, project.id)}
                          />
                        </label>
                      </div>
                    )}

                    <div className="pt-2 flex justify-between items-center">
                      <button onClick={() => setQrModal({url: `${window.location.origin}/viewer/${project.id}/${project.documents[0]?.id || ''}`, title: project.name})} className="text-xs flex items-center text-slate-500 hover:text-slate-800 transition-colors" title="QR-Code generieren"><QrCode size={14} className="mr-1"/> QR-Code</button>
                      {isOffline ? (
                        <button
                          onClick={() => handleRemoveOffline(project)}
                          className="text-xs flex items-center text-slate-500 hover:text-red-600 transition-colors"
                          title="Vom Gerät entfernen (bleibt auf Server)"
                        >
                          <Trash2 size={14} className="mr-1" /> Lokal entfernen
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDownloadOffline(project)}
                          disabled={!isOnline}
                          className={`text-xs flex items-center transition-colors font-medium
                             ${isOnline ? 'text-blue-600 hover:text-blue-800' : 'text-slate-400 cursor-not-allowed'}
                          `}
                          title="Für Offline-Nutzung herunterladen"
                        >
                          <Download size={14} className="mr-1" /> Offline verfügbar machen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {qrModal && <QRCodeModal url={qrModal.url} title={qrModal.title} onClose={() => setQrModal(null)} />}
      </main>
    </div>
  );
}
