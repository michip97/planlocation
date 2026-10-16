import type { Task } from '../types';

interface TaskMarkerProps {
  task: Task;
  onClick: (task: Task) => void;
  isActive: boolean;
}

export default function TaskMarker({ task, onClick, isActive }: TaskMarkerProps) {
  // Determine color based on status
  let bgColor = 'bg-blue-500';
  if (task.status === 'Offen') bgColor = 'bg-red-500';
  else if (task.status === 'In Bearbeitung') bgColor = 'bg-yellow-500';
  else if (task.status === 'Erledigt') bgColor = 'bg-green-500';

  return (
    <div
      className={`absolute w-6 h-6 -ml-3 -mt-3 rounded-full cursor-pointer shadow-md flex items-center justify-center text-white text-xs font-bold transition-transform ${bgColor} ${isActive ? 'ring-4 ring-white scale-125 z-20' : 'hover:scale-110 z-10'}`}
      style={{
        left: `${task.position.x * 100}%`,
        top: `${task.position.y * 100}%`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(task);
      }}
      title={task.title}
    >
      !
    </div>
  );
}
