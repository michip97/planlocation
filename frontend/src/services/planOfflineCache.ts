import { PMTiles, FetchSource, FileSource, type Source, type RangeResponse } from 'pmtiles';

export interface PlanTileMetadata {
  width: number;
  height: number;
  aspectRatio?: number;
  tileSize: number;
  maxZoom: number;
}

export interface CachedPlanRecord {
  documentId: string;
  pmtilesBlob: Blob;
  metadata: PlanTileMetadata;
  updatedAt: number;
}

const DB_NAME = 'PlanSyncPmtilesCacheDB';
const DB_VERSION = 2;
const STORE_NAME = 'plan_pmtiles';
const DEFAULT_MAX_CACHED_PLANS = 25;

// In-memory fallback for non-browser / test environments and instant hot-access in RAM
const memoryCache = new Map<string, CachedPlanRecord>();
const activePrefetches = new Map<string, Promise<CachedPlanRecord | null>>();

function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'documentId' });
      store.createIndex('updatedAt', 'updatedAt', { unique: false });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function toBlob(data: Blob | ArrayBuffer): Blob {
  if (data instanceof Blob) {
    return data;
  }
  return new Blob([data], { type: 'application/vnd.pmtiles' });
}

/**
 * Retrieve a cached plan (.pmtiles Blob + metadata.json) from RAM or IndexedDB.
 * Updates `updatedAt` timestamp on access for LRU tracking.
 */
export async function getCachedPlan(documentId: string): Promise<CachedPlanRecord | null> {
  const memHit = memoryCache.get(documentId);
  if (memHit) {
    memHit.updatedAt = Date.now();
    return memHit;
  }

  if (!isIndexedDBAvailable()) {
    return null;
  }

  try {
    const db = await openCacheDB();
    const record = await new Promise<CachedPlanRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(documentId);
      req.onsuccess = () => resolve(req.result as CachedPlanRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();

    if (!record || !record.pmtilesBlob || !record.metadata) {
      return null;
    }

    const hydrated: CachedPlanRecord = {
      documentId: record.documentId,
      pmtilesBlob: toBlob(record.pmtilesBlob),
      metadata: record.metadata,
      updatedAt: Date.now()
    };
    memoryCache.set(documentId, hydrated);
    return hydrated;
  } catch (err) {
    console.warn('IndexedDB read failed in planOfflineCache:', err);
    return null;
  }
}

/**
 * Store a complete .pmtiles Blob and its metadata permanently in IndexedDB (and RAM).
 */
export async function savePlanToCache(
  documentId: string,
  pmtilesData: Blob | ArrayBuffer,
  metadata: PlanTileMetadata
): Promise<CachedPlanRecord> {
  const pmtilesBlob = toBlob(pmtilesData);
  const record: CachedPlanRecord = {
    documentId,
    pmtilesBlob,
    metadata,
    updatedAt: Date.now()
  };

  memoryCache.set(documentId, record);

  if (isIndexedDBAvailable()) {
    try {
      const db = await openCacheDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      await pruneOldCachedPlans(DEFAULT_MAX_CACHED_PLANS);
    } catch (err) {
      console.warn('IndexedDB write failed in planOfflineCache:', err);
    }
  }

  return record;
}

/**
 * Delete a specific document's cached .pmtiles and metadata from IndexedDB and RAM.
 */
export async function deleteCachedPlan(documentId: string): Promise<void> {
  memoryCache.delete(documentId);

  if (!isIndexedDBAvailable()) {
    return;
  }

  try {
    const db = await openCacheDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(documentId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('IndexedDB delete failed in planOfflineCache:', err);
  }
}

/**
 * LRU cleanup: keep at most `maxEntries` most recently used plans in IndexedDB.
 */
export async function pruneOldCachedPlans(maxEntries = DEFAULT_MAX_CACHED_PLANS): Promise<void> {
  if (!isIndexedDBAvailable()) {
    return;
  }

  try {
    const db = await openCacheDB();
    const allRecords = await new Promise<CachedPlanRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as CachedPlanRecord[]) || []);
      req.onerror = () => reject(req.error);
    });

    if (allRecords.length > maxEntries) {
      allRecords.sort((a, b) => b.updatedAt - a.updatedAt);
      const toRemove = allRecords.slice(maxEntries);

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const item of toRemove) {
          store.delete(item.documentId);
          memoryCache.delete(item.documentId);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    db.close();
  } catch (err) {
    console.warn('IndexedDB LRU prune failed:', err);
  }
}

/**
 * Hybrid PMTiles Source that seamlessly switches between:
 * - `FileSource` (100% local in-memory/IndexedDB Blob, 0 network requests)
 * - `FetchSource` (HTTP 206 Partial Content Range requests when not yet cached locally)
 */
export class HybridPmtilesSource implements Source {
  private pmtilesUrl: string;
  private fetchSource: FetchSource;
  private fileSource: FileSource | null = null;

  constructor(
    pmtilesUrl: string,
    token?: string | null,
    initialLocalBlob?: Blob | ArrayBuffer | null
  ) {
    this.pmtilesUrl = pmtilesUrl;
    this.fetchSource = new FetchSource(
      pmtilesUrl,
      new Headers(token ? { Authorization: `Bearer ${token}` } : undefined)
    );

    if (initialLocalBlob) {
      this.upgradeToLocalBlob(initialLocalBlob);
    }
  }

  /**
   * Must return the canonical URL key so `pmtilesProtocol.add(new PMTiles(source))`
   * matches `pmtiles://<pmtilesUrl>/{z}/{x}/{y}` requests from MapLibre GL.
   */
  getKey(): string {
    return this.pmtilesUrl;
  }

  /**
   * Upgrades this source in-place to read all subsequent tile requests from the local Blob/File
   * via `FileSource` without any network traffic.
   */
  upgradeToLocalBlob(blobData: Blob | ArrayBuffer): void {
    const blob = toBlob(blobData);
    const file = new File([blob], this.pmtilesUrl, { type: 'application/vnd.pmtiles' });
    this.fileSource = new FileSource(file);
  }

  isUsingLocalBlob(): boolean {
    return this.fileSource !== null;
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
    etag?: string
  ): Promise<RangeResponse> {
    if (this.fileSource) {
      return await this.fileSource.getBytes(offset, length);
    }
    return await this.fetchSource.getBytes(offset, length, signal, etag);
  }
}

/**
 * Helper to create a `PMTiles` instance backed by `HybridPmtilesSource`.
 */
export function createHybridPmtilesInstance(
  pmtilesUrl: string,
  token?: string | null,
  initialLocalBlob?: Blob | ArrayBuffer | null
): { pmtiles: PMTiles; hybridSource: HybridPmtilesSource } {
  const hybridSource = new HybridPmtilesSource(pmtilesUrl, token, initialLocalBlob);
  const pmtiles = new PMTiles(hybridSource);
  return { pmtiles, hybridSource };
}

/**
 * Schedules a non-blocking background download of the complete `<documentId>.pmtiles` file
 * using `requestIdleCallback` (or `setTimeout` fallback), persists it alongside `metadata`
 * in IndexedDB, and upgrades the active `HybridPmtilesSource` to `FileSource` immediately.
 */
export function schedulePlanBackgroundPrefetch(options: {
  documentId: string;
  pmtilesUrl: string;
  token?: string | null;
  metadata: PlanTileMetadata;
  hybridSource?: HybridPmtilesSource;
  onStatusChange?: (status: 'prefetching' | 'offline-ready' | 'error') => void;
}): () => void {
  const { documentId, pmtilesUrl, token, metadata, hybridSource, onStatusChange } = options;
  let cancelled = false;
  let idleHandle: number | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const startDownload = async () => {
    if (cancelled) return;

    // Check if already cached
    const existing = await getCachedPlan(documentId);
    if (existing) {
      if (hybridSource && !hybridSource.isUsingLocalBlob()) {
        hybridSource.upgradeToLocalBlob(existing.pmtilesBlob);
      }
      onStatusChange?.('offline-ready');
      return;
    }

    onStatusChange?.('prefetching');

    let prefetchPromise = activePrefetches.get(documentId);
    if (!prefetchPromise) {
      prefetchPromise = (async () => {
        try {
          const res = await fetch(pmtilesUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (!res.ok) {
            throw new Error(`Failed to prefetch PMTiles (${res.status})`);
          }
          const blob = await res.blob();
          if (blob.size === 0) {
            throw new Error('Prefetched PMTiles blob is empty');
          }
          return await savePlanToCache(documentId, blob, metadata);
        } catch (err) {
          console.warn(`Background prefetch for plan ${documentId} failed:`, err);
          return null;
        } finally {
          activePrefetches.delete(documentId);
        }
      })();
      activePrefetches.set(documentId, prefetchPromise);
    }

    const record = await prefetchPromise;
    if (cancelled) return;

    if (record) {
      if (hybridSource) {
        hybridSource.upgradeToLocalBlob(record.pmtilesBlob);
      }
      onStatusChange?.('offline-ready');
    } else {
      onStatusChange?.('error');
    }
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    idleHandle = window.requestIdleCallback(() => {
      void startDownload();
    }, { timeout: 1500 });
  } else {
    timeoutHandle = setTimeout(() => {
      void startDownload();
    }, 300);
  }

  return () => {
    cancelled = true;
    if (idleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(idleHandle);
    }
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  };
}
