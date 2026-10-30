import { describe, it, expect, vi } from 'vitest';
import { planCoordsToLngLat, lngLatToPlanCoords, type PlanTileMetadata } from './MapLibrePlanViewer';
import {
  HybridPmtilesSource,
  savePlanToCache,
  getCachedPlan,
  deleteCachedPlan
} from '../services/planOfflineCache';

describe('MapLibrePlanViewer Coordinate Transformations (vips Google Layout)', () => {
  // Real A0 Landscape @ 300 DPI: 14042 x 9933 px, tileSize 512, maxZoom 5 (grid = 16384 x 16384)
  const a0Metadata: PlanTileMetadata = {
    width: 14042,
    height: 9933,
    aspectRatio: 14042 / 9933,
    tileSize: 512,
    maxZoom: 5
  };

  it('should map origin (0,0) to top-left of Web Mercator (-180, ~85.051129)', () => {
    const { lng, lat } = planCoordsToLngLat(0, 0, a0Metadata);
    expect(lng).toBeCloseTo(-180, 6);
    expect(lat).toBeCloseTo(85.05112878, 5);

    const { x, y } = lngLatToPlanCoords(lng, lat, a0Metadata);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
  });

  it('should map bottom-right (1,1) to exact A0 plan corner accounting for vips grid padding', () => {
    const { lng, lat } = planCoordsToLngLat(1, 1, a0Metadata);

    // 14042 / 16384 = 0.8570556640625 -> lng = 0.8570556640625 * 360 - 180 = 128.5400390625
    expect(lng).toBeCloseTo(128.540039, 4);
    expect(lng).toBeLessThan(180); // Must NOT land in the right white vips padding
    expect(lat).toBeGreaterThan(-85.051128); // Must NOT land in the bottom white vips padding

    const { x, y } = lngLatToPlanCoords(lng, lat, a0Metadata);
    expect(x).toBeCloseTo(1, 6);
    expect(y).toBeCloseTo(1, 6);
  });

  it('should map center (0.5, 0.5) accurately and round-trip', () => {
    const { lng, lat } = planCoordsToLngLat(0.5, 0.5, a0Metadata);
    const { x, y } = lngLatToPlanCoords(lng, lat, a0Metadata);
    expect(x).toBeCloseTo(0.5, 6);
    expect(y).toBeCloseTo(0.5, 6);
  });

  it('should map arbitrary normalized coordinates and round-trip accurately', () => {
    const testX = 0.234;
    const testY = 0.876;

    const { lng, lat } = planCoordsToLngLat(testX, testY, a0Metadata);
    const { x, y } = lngLatToPlanCoords(lng, lat, a0Metadata);

    expect(x).toBeCloseTo(testX, 6);
    expect(y).toBeCloseTo(testY, 6);
  });
});

describe('planOfflineCache & HybridPmtilesSource (Offline-First + Smart Background Upgrade)', () => {
  const sampleMeta: PlanTileMetadata = {
    width: 14042,
    height: 9933,
    aspectRatio: 1.413672,
    tileSize: 512,
    maxZoom: 5
  };

  it('stores, retrieves, and deletes a plan (.pmtiles Blob + metadata) in cache', async () => {
    const fakeBytes = new Uint8Array([80, 77, 84, 105, 108, 101, 115, 3]); // "PMTiles\x03"
    await savePlanToCache('doc-test-1', fakeBytes.buffer, sampleMeta);

    const cached = await getCachedPlan('doc-test-1');
    expect(cached).not.toBeNull();
    expect(cached?.documentId).toBe('doc-test-1');
    expect(cached?.metadata.width).toBe(14042);
    expect(cached?.pmtilesBlob.size).toBe(8);

    await deleteCachedPlan('doc-test-1');
    expect(await getCachedPlan('doc-test-1')).toBeNull();
  });

  it('serves bytes from local FileSource with 0 network fetch calls after upgradeToLocalBlob', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const url = 'http://localhost:3000/api/documents/doc-test-2/tiles.pmtiles';
    const payload = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);

    const hybrid = new HybridPmtilesSource(url, 'test-jwt');
    expect(hybrid.getKey()).toBe(url);
    expect(hybrid.isUsingLocalBlob()).toBe(false);

    hybrid.upgradeToLocalBlob(payload.buffer);
    expect(hybrid.isUsingLocalBlob()).toBe(true);

    const range = await hybrid.getBytes(2, 4);
    expect(Array.from(new Uint8Array(range.data))).toEqual([30, 40, 50, 60]);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
