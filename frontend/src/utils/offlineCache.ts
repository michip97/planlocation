import localforage from 'localforage';
import type { Task, Project } from '../types';

export const cacheTasks = async (projectId: string, documentId: string, tasks: Task[]) => {
  await localforage.setItem(`tasks_${projectId}_${documentId}`, tasks);
};

export const getCachedTasks = async (projectId: string, documentId: string): Promise<Task[]> => {
  return await localforage.getItem(`tasks_${projectId}_${documentId}`) || [];
};

export const cacheProjectDetails = async (projectId: string, project: Project) => {
  await localforage.setItem(`project_${projectId}`, project);
};

export const getCachedProjectDetails = async (projectId: string): Promise<Project | null> => {
  return await localforage.getItem(`project_${projectId}`);
};

export const cachePdfBlob = async (documentId: string, blob: Blob) => {
  await localforage.setItem(`pdf_${documentId}`, blob);
};

export const getCachedPdfBlob = async (documentId: string): Promise<Blob | null> => {
  return await localforage.getItem(`pdf_${documentId}`);
};
