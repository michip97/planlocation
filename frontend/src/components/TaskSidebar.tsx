import type { Task } from '../types';
import { X, Calendar, User, AlertCircle, Clock } from 'lucide-react';

interface TaskSidebarProps {
  task: Task | null;
  onClose: () => void;
}

export default function TaskSidebar({ task, onClose }: TaskSidebarProps) {
  if (!task) return null;

  return (
    <div className="w-80 bg-white border-l shadow-xl flex flex-col h-full absolute right-0 top-0 z-30 transition-transform transform translate-x-0">
      <div className="p-4 border-b flex justify-between items-center bg-gray-50">
        <h2 className="font-semibold text-lg truncate pr-2">{task.title}</h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
          <X size={20} />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase">Status</label>
            <div className="mt-1 flex items-center">
              <span className={`px-2 py-1 text-xs rounded-full font-medium
                ${task.status === 'Offen' ? 'bg-red-100 text-red-800' : ''}
                ${task.status === 'In Bearbeitung' ? 'bg-yellow-100 text-yellow-800' : ''}
                ${task.status === 'Erledigt' ? 'bg-green-100 text-green-800' : ''}
                ${task.status === 'Zur Prüfung' ? 'bg-blue-100 text-blue-800' : ''}
              `}>
                {task.status}
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase">Priorität</label>
            <div className="mt-1 flex items-center text-sm">
              <AlertCircle size={16} className="mr-2 text-gray-400" />
              {task.priority}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase">Zugewiesen an</label>
            <div className="mt-1 flex items-center text-sm">
              <User size={16} className="mr-2 text-gray-400" />
              {task.assignee || 'Nicht zugewiesen'}
            </div>
          </div>

          {task.dueDate && (
            <div>
              <label className="text-xs text-gray-500 font-semibold uppercase">Fällig am</label>
              <div className="mt-1 flex items-center text-sm">
                <Calendar size={16} className="mr-2 text-gray-400" />
                {new Date(task.dueDate).toLocaleDateString()}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase">Erstellt am</label>
            <div className="mt-1 flex items-center text-sm">
              <Clock size={16} className="mr-2 text-gray-400" />
              {new Date(task.createdAt).toLocaleDateString()}
            </div>
          </div>

          <div className="pt-4 border-t">
            <label className="text-xs text-gray-500 font-semibold uppercase">Beschreibung</label>
            <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
              {task.description || 'Keine Beschreibung vorhanden.'}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 border-t bg-gray-50">
        <button className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 transition-colors">
          Bearbeiten
        </button>
      </div>
    </div>
  );
}
