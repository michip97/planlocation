import localforage from 'localforage';
import axios from 'axios';
import type { Task, Project } from '../types';
import {
  savePlanToCache,
  deleteCachedPlan,
  type PlanTileMetadata
} from '../services/planOfflineCache';

// Registry of explicitly downloaded projects
export const getOfflineProjectsRegistry = async (): Promise<string[]> => {
  return await localforage.getItem('offline_projects_registry') || [];
};

export const addProjectToRegistry = async (projectId: string) => {
  const registry = await getOfflineProjectsRegistry();
  if (!registry.includes(projectId)) {
    registry.push(projectId);
    await localforage.setItem('offline_projects_registry', registry);
  }
};

export const removeProjectFromRegistry = async (projectId: string) => {
  const registry = await getOfflineProjectsRegistry();
  const updated = registry.filter(id => id !== projectId);
  await localforage.setItem('offline_projects_registry', updated);
};

export const isProjectOffline = async (projectId: string): Promise<boolean> => {
  const registry = await getOfflineProjectsRegistry();
  return registry.includes(projectId);
};

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

// Remove a project completely from cache
export const removeProjectData = async (project: Project) => {
  await localforage.removeItem(`project_${project.id}`);
  for (const doc of project.documents) {
    await localforage.removeItem(`tasks_${project.id}_${doc.id}`);
    await deleteCachedPlan(doc.id);
  }
  await removeProjectFromRegistry(project.id);
};

// Download logic with progress
export const downloadProjectForOffline = async (
  project: Project,
  token: string,
  onProgress: (progress: number) => void
) => {
  try {
    onProgress(10); // Start

    // 1. Save project metadata
    await cacheProjectDetails(project.id, project);

    const documents = project.documents;

    if (documents.length === 0) {
      onProgress(100);
      await addProjectToRegistry(project.id);
      return;
    }

    const progressPerDoc = 90 / documents.length;

    // 2. Fetch Tasks and persist .pmtiles + metadata.json in IndexedDB for each document
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const baseProgress = 10 + (i * progressPerDoc);

      // Fetch Tasks
      const tasksRes = await axios.get(`/api/tasks/${project.id}/${doc.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await cacheTasks(project.id, doc.id, tasksRes.data);
      onProgress(baseProgress + (progressPerDoc * 0.4));

      // Fetch tile metadata and single-file .pmtiles archive and store in IndexedDB
      const [metaRes, pmtilesRes] = await Promise.all([
        axios.get<PlanTileMetadata>(`/api/documents/${doc.id}/tiles/metadata.json`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get<ArrayBuffer>(`/api/documents/${doc.id}/tiles.pmtiles`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'arraybuffer'
        })
      ]);

      await savePlanToCache(doc.id, pmtilesRes.data, metaRes.data);
      onProgress(baseProgress + progressPerDoc);
    }

    onProgress(100);
    await addProjectToRegistry(project.id);
  } catch (error) {
    console.error("Failed to download project", error);
    throw error;
  }
};
