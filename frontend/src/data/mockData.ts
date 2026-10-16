import type { Task } from '../types';

export const mockTasks: Task[] = [
  {
    id: 'task-1',
    title: 'Überschrift korrigieren',
    description: 'Die Überschrift auf dieser Seite ist abgeschnitten und muss angepasst werden.',
    projectId: 'proj-1',
    documentId: 'doc-1',
    page: 1,
    position: { x: 0.15, y: 0.2 },
    status: 'Offen',
    priority: 'Hoch',
    assignee: 'Max Muster',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'task-2',
    title: 'Logo austauschen',
    description: 'Bitte das neue Firmenlogo hier einfügen.',
    projectId: 'proj-1',
    documentId: 'doc-1',
    page: 1,
    position: { x: 0.8, y: 0.1 },
    status: 'In Bearbeitung',
    priority: 'Normal',
    createdAt: new Date().toISOString(),
  }
];
