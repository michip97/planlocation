import { useState } from 'react';
import PDFViewer from '../components/PDFViewer';
import TaskMarker from '../components/TaskMarker';
import TaskSidebar from '../components/TaskSidebar';
import { mockTasks } from '../data/mockData';
import type { Task } from '../types';

export default function DocumentView() {
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Hardcoded to 1 since we only show the first page for architectural plans
  const currentPage = 1;

  const handlePdfClick = (e: React.MouseEvent, pageNumber: number) => {
    // Determine the position clicked within the PDF page container
    // Because of react-zoom-pan-pinch, the event currentTarget is the inner transformed div
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    // We calculate normalized coordinates based on the bounding rect
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Create a new mock task at this position
    const newTask: Task = {
      id: `task-temp-${Date.now()}`,
      title: 'Neue Pendenz',
      description: 'Bitte Details ergänzen...',
      projectId: 'proj-1',
      documentId: 'doc-1',
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
          <h1 className="font-bold text-xl">Plan: Erdgeschoss Architektur</h1>
          <div className="text-sm bg-slate-700 px-3 py-1 rounded border border-slate-600">
            eg_plan_v2.pdf
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          <PDFViewer
            url="/sample.pdf"
            onClick={handlePdfClick}
          >
            {/* Render tasks for the current page */}
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
