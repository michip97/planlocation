export type TaskStatus = 'Offen' | 'In Bearbeitung' | 'Erledigt' | 'Zur Prüfung';
export type TaskPriority = 'Niedrig' | 'Normal' | 'Hoch' | 'Dringend';

export interface Position {
  x: number; // normalized coordinate (0-1)
  y: number; // normalized coordinate (0-1)
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string;
}

export interface Document {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  createdAt: string;
  projectId: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  status: string;
  documents: Document[];
  tasks: any[];
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
