import localforage from 'localforage';
import axios from 'axios';
import type { Task } from '../types';

localforage.config({
  name: 'PlanSync',
  storeName: 'offline_queue'
});

export interface SyncAction {
  id: string;
  type: 'CREATE_TASK' | 'UPDATE_TASK' | 'DELETE_TASK';
  payload: any;
  timestamp: number;
}

export const addToSyncQueue = async (action: SyncAction) => {
  const queue: SyncAction[] = await localforage.getItem('syncQueue') || [];
  queue.push(action);
  await localforage.setItem('syncQueue', queue);
};

export const getSyncQueue = async (): Promise<SyncAction[]> => {
  return await localforage.getItem('syncQueue') || [];
};

export const clearSyncQueue = async () => {
  await localforage.setItem('syncQueue', []);
};

export const processSyncQueue = async () => {
  if (!navigator.onLine) return;

  const queue = await getSyncQueue();
  if (queue.length === 0) return;

  const token = localStorage.getItem('token');
  if (!token) return;

  const newQueue: SyncAction[] = [];

  for (const action of queue) {
    try {
      if (action.type === 'CREATE_TASK') {
        const payload: Task = action.payload;
        await axios.post(
          `http://localhost:3000/api/tasks/${payload.projectId}/${payload.documentId}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else if (action.type === 'UPDATE_TASK') {
        const payload = action.payload;
        await axios.put(
          `http://localhost:3000/api/tasks/${payload.id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else if (action.type === 'DELETE_TASK') {
        await axios.delete(
          `http://localhost:3000/api/tasks/${action.payload.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
    } catch (error) {
      console.error('Failed to sync action', action, error);
      // Keep in queue if it failed (e.g. network error during processing)
      newQueue.push(action);
    }
  }

  await localforage.setItem('syncQueue', newQueue);
};

// Listen to online events to trigger sync
window.addEventListener('online', processSyncQueue);
