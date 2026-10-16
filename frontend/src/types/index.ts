export type TaskStatus = 'Offen' | 'In Bearbeitung' | 'Erledigt' | 'Zur Prüfung';
export type TaskPriority = 'Niedrig' | 'Normal' | 'Hoch' | 'Dringend';

export interface Position {
  x: number; // normalized coordinate (0-1)
  y: number; // normalized coordinate (0-1)
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  documentId: string;
  page: number;
  position: Position;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  dueDate?: string;
  createdAt: string;
}
