import { useState, useEffect } from 'react';
import type { Task, TaskStatus, TaskPriority } from '../types';
import { X, Calendar, User, AlertCircle, Clock, Save } from 'lucide-react';

interface TaskSidebarProps {
  task: Task | null;
  onClose: () => void;
  onUpdate: (task: Task) => void;
}

export default function TaskSidebar({ task, onClose, onUpdate }: TaskSidebarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTask, setEditedTask] = useState<Task | null>(null);

  useEffect(() => {
    setEditedTask(task);
    setIsEditing(false); // Reset edit mode when a new task is selected
  }, [task]);

  if (!task || !editedTask) return null;

  const handleSave = () => {
    onUpdate(editedTask);
    setIsEditing(false);
  };

  return (
    <div className="w-80 bg-white border-l shadow-xl flex flex-col h-full absolute right-0 top-0 z-30 transition-transform transform translate-x-0">
      <div className="p-4 border-b flex justify-between items-center bg-slate-50">
        {isEditing ? (
          <input
            type="text"
            className="font-semibold text-lg border rounded px-2 py-1 w-full mr-2"
            value={editedTask.title}
            onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
          />
        ) : (
          <h2 className="font-semibold text-lg truncate pr-2" title={task.title}>{task.title}</h2>
        )}
        <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded text-slate-500">
          <X size={20} />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 font-semibold uppercase">Status</label>
            <div className="mt-1 flex items-center">
              {isEditing ? (
                <select
                  className="border rounded px-2 py-1 w-full text-sm"
                  value={editedTask.status}
                  onChange={(e) => setEditedTask({ ...editedTask, status: e.target.value as TaskStatus })}
                >
                  <option value="Offen">Offen</option>
                  <option value="In Bearbeitung">In Bearbeitung</option>
                  <option value="Erledigt">Erledigt</option>
                  <option value="Zur Prüfung">Zur Prüfung</option>
                </select>
              ) : (
                <span className={`px-2 py-1 text-xs rounded-full font-medium
                  ${task.status === 'Offen' ? 'bg-red-100 text-red-800' : ''}
                  ${task.status === 'In Bearbeitung' ? 'bg-yellow-100 text-yellow-800' : ''}
                  ${task.status === 'Erledigt' ? 'bg-green-100 text-green-800' : ''}
                  ${task.status === 'Zur Prüfung' ? 'bg-blue-100 text-blue-800' : ''}
                `}>
                  {task.status}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 font-semibold uppercase">Priorität</label>
            <div className="mt-1 flex items-center text-sm">
              {isEditing ? (
                <select
                  className="border rounded px-2 py-1 w-full"
                  value={editedTask.priority}
                  onChange={(e) => setEditedTask({ ...editedTask, priority: e.target.value as TaskPriority })}
                >
                  <option value="Niedrig">Niedrig</option>
                  <option value="Normal">Normal</option>
                  <option value="Hoch">Hoch</option>
                  <option value="Dringend">Dringend</option>
                </select>
              ) : (
                <>
                  <AlertCircle size={16} className="mr-2 text-slate-400" />
                  {task.priority}
                </>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 font-semibold uppercase">Zugewiesen an</label>
            <div className="mt-1 flex items-center text-sm">
              <User size={16} className="mr-2 text-slate-400" />
              {task.assignee || 'Nicht zugewiesen'}
            </div>
          </div>

          <div>
             <label className="text-xs text-slate-500 font-semibold uppercase">Fällig am</label>
             <div className="mt-1 flex items-center text-sm">
               {isEditing ? (
                 <input
                   type="date"
                   className="border rounded px-2 py-1 w-full"
                   value={editedTask.dueDate ? new Date(editedTask.dueDate).toISOString().split('T')[0] : ''}
                   onChange={(e) => setEditedTask({ ...editedTask, dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                 />
               ) : (
                 <>
                   <Calendar size={16} className="mr-2 text-slate-400" />
                   {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Kein Datum gesetzt'}
                 </>
               )}
             </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 font-semibold uppercase">Erstellt am</label>
            <div className="mt-1 flex items-center text-sm">
              <Clock size={16} className="mr-2 text-slate-400" />
              {new Date(task.createdAt).toLocaleDateString()}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <label className="text-xs text-slate-500 font-semibold uppercase">Beschreibung</label>
            {isEditing ? (
               <textarea
                 className="mt-2 border rounded px-2 py-1 w-full text-sm h-32"
                 value={editedTask.description}
                 onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
                 placeholder="Beschreibung hinzufügen..."
               />
            ) : (
              <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                {task.description || 'Keine Beschreibung vorhanden.'}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-50">
        {isEditing ? (
          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center space-x-2 bg-green-600 text-white py-2 rounded font-medium hover:bg-green-700 transition-colors shadow-sm"
          >
            <Save size={18} />
            <span>Speichern</span>
          </button>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            Bearbeiten
          </button>
        )}
      </div>
    </div>
  );
}
