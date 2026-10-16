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

  // We use absolute positioning inside the PDF container.
  // We use CSS transform to scale the marker down if the user zooms in,
  // OR we can just let it scale with the canvas. For now, letting it scale
  // natively with the map is often desired in architectural plans.
  // To prevent the marker from getting HUGE, we give it a fixed small base size.
  // Since the base PDF is rendered at scale=2, a 12px marker looks good.

  return (
    <div
      className={`absolute flex items-center justify-center text-white font-bold rounded-full shadow-lg cursor-pointer transition-all ${bgColor} ${isActive ? 'ring-2 ring-white z-20' : 'hover:opacity-80 z-10'}`}
      style={{
        left: `${task.position.x * 100}%`,
        top: `${task.position.y * 100}%`,
        width: '16px',
        height: '16px',
        marginLeft: '-8px', // center on point
        marginTop: '-8px',
        fontSize: '10px'
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
