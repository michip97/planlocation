import localforage from 'localforage';
import axios from 'axios';
import type { Task, Project } from '../types';

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

export const cachePdfBlob = async (documentId: string, blob: Blob) => {
  await localforage.setItem(`pdf_${documentId}`, blob);
};

export const getCachedPdfBlob = async (documentId: string): Promise<Blob | null> => {
  return await localforage.getItem(`pdf_${documentId}`);
};

// Remove a project completely from cache
export const removeProjectData = async (project: Project) => {
  await localforage.removeItem(`project_${project.id}`);
  for (const doc of project.documents) {
    await localforage.removeItem(`pdf_${doc.id}`);
    await localforage.removeItem(`tasks_${project.id}_${doc.id}`);
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

    // 2. Fetch Tasks and PDFs for each document
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const baseProgress = 10 + (i * progressPerDoc);

      // Fetch Tasks
      const tasksRes = await axios.get(`http://localhost:3000/api/tasks/${project.id}/${doc.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await cacheTasks(project.id, doc.id, tasksRes.data);
      onProgress(baseProgress + (progressPerDoc * 0.2)); // Tasks downloaded

      // Fetch PDF Blob with onDownloadProgress for accurate tracking of large files
      const pdfRes = await axios.get(`http://localhost:3000/api/documents/${doc.id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = progressEvent.loaded / progressEvent.total;
            const docPdfProgress = progressPerDoc * 0.8 * percentCompleted; // PDF is 80% of the document work
            onProgress(baseProgress + (progressPerDoc * 0.2) + docPdfProgress);
          }
        }
      });

      await cachePdfBlob(doc.id, pdfRes.data);
    }

    onProgress(100);
    await addProjectToRegistry(project.id);
  } catch (error) {
    console.error("Failed to download project", error);
    throw error;
  }
};
