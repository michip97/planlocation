import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/Navbar';
import { Filter, Search, ArrowRight, Download, CloudOff } from 'lucide-react';
import { generateTasksPDF } from '../utils/pdfExport';
import { getOfflineProjectsRegistry, getCachedTasks, getCachedProjectDetails } from '../utils/offlineCache';

export default function TasksList() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [search, setSearch] = useState('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    fetchTasks();
  }, [token, navigate, filterStatus, filterPriority, isOnline]);

  const fetchTasks = async () => {
    const loadOfflineData = async () => {
      // Offline mode: Aggregate all tasks from cached offline projects
      const registry = await getOfflineProjectsRegistry();
      let offlineTasks: any[] = [];

      for (const projectId of registry) {
          const project = await getCachedProjectDetails(projectId);
          if (!project) continue;

          for (const doc of project.documents) {
              const cachedTasksForDoc = await getCachedTasks(projectId, doc.id);
              const enrichedTasks = cachedTasksForDoc.map(t => ({
                  ...t,
                  project: { name: project.name },
                  document: { filename: doc.filename }
              }));
              offlineTasks = [...offlineTasks, ...enrichedTasks];
          }
      }

      // Apply filters locally since we're offline
      if (filterStatus) {
          offlineTasks = offlineTasks.filter(t => t.status === filterStatus);
      }
      if (filterPriority) {
          offlineTasks = offlineTasks.filter(t => t.priority === filterPriority);
      }
      setTasks(offlineTasks);
    };

    try {
      setLoading(true);
      if (isOnline) {
          const params = new URLSearchParams();
          if (filterStatus) params.append('status', filterStatus);
          if (filterPriority) params.append('priority', filterPriority);

          const response = await axios.get(`/api/tasks?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setTasks(response.data);
      } else {
          await loadOfflineData();
      }
    } catch (error) {
      console.error('Failed to fetch tasks', error);
      // Fallback to offline data if server is unreachable
      setIsOnline(false);
      await loadOfflineData();
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    (t.description && t.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {!isOnline && (
            <div className="mb-4 bg-yellow-50 text-yellow-800 p-3 rounded-lg flex items-center border border-yellow-200">
                <CloudOff size={20} className="mr-2" />
                <span className="text-sm font-medium">Offline-Modus. Es werden nur Pendenzen aus lokal heruntergeladenen Projekten angezeigt.</span>
            </div>
        )}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 space-y-4 md:space-y-0">
          <h2 className="text-2xl font-bold text-slate-800">Alle Pendenzen</h2>

          <div className="flex items-center space-x-4 bg-white p-2 rounded-lg shadow-sm border border-slate-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Suchen..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-1.5 text-sm border-r border-slate-200 focus:outline-none w-48"
              />
            </div>

            <div className="flex items-center space-x-2 px-2 text-sm text-slate-600">
              <Filter size={16} />
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-transparent font-medium focus:outline-none cursor-pointer"
              >
                <option value="">Alle Status</option>
                <option value="Offen">Offen</option>
                <option value="In Bearbeitung">In Bearbeitung</option>
                <option value="Erledigt">Erledigt</option>
                <option value="Zur Prüfung">Zur Prüfung</option>
              </select>
            </div>

            <div className="flex items-center space-x-2 px-2 text-sm text-slate-600">
              <select
                value={filterPriority}
                onChange={e => setFilterPriority(e.target.value)}
                className="bg-transparent font-medium focus:outline-none cursor-pointer"
              >
                <option value="">Alle Prioritäten</option>
                <option value="Niedrig">Niedrig</option>
                <option value="Normal">Normal</option>
                <option value="Hoch">Hoch</option>
                <option value="Dringend">Dringend</option>
              </select>
            </div>
          </div>

          <button onClick={() => generateTasksPDF(filteredTasks)} className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
            <Download size={16} />
            <span>Als PDF Exportieren</span>
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500">Lade Pendenzen...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-12 text-center text-slate-500">Keine Pendenzen gefunden.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Titel</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Projekt & Plan</th>
                    <th className="px-6 py-4 font-semibold">Erstellt am</th>
                    <th className="px-6 py-4 font-semibold text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map(task => (
                    <tr key={task.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800">{task.title}</div>
                        <div className="text-xs truncate max-w-xs">{task.description || '-'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs rounded-full font-medium
                          ${task.status === 'Offen' ? 'bg-red-100 text-red-800' : ''}
                          ${task.status === 'In Bearbeitung' ? 'bg-yellow-100 text-yellow-800' : ''}
                          ${task.status === 'Erledigt' ? 'bg-green-100 text-green-800' : ''}
                          ${task.status === 'Zur Prüfung' ? 'bg-blue-100 text-blue-800' : ''}
                        `}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium">{task.project?.name || 'Unbekanntes Projekt'}</div>
                        <div className="text-xs text-slate-400">{task.document?.filename || 'Unbekannter Plan'}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {new Date(task.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => navigate(`/viewer/${task.projectId}/${task.documentId}`)}
                          className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <span>Ansehen</span>
                          <ArrowRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
