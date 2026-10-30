import { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { ZoomIn, ZoomOut, Maximize, RotateCcw, Loader2, CheckCircle2, CloudDownload } from 'lucide-react';
import type { Task } from '../types';
import {
  getCachedPlan,
  createHybridPmtilesInstance,
  schedulePlanBackgroundPrefetch,
  type PlanTileMetadata
} from '../services/planOfflineCache';

export type { PlanTileMetadata };

/**
 * Uniform workspace background color (`#111827` / Tailwind `bg-gray-900`).
 * Must be identical across:
 * 1. The outer HTML container `<div>`,
 * 2. The MapLibre `background` layer, and
 * 3. The `plan-padding-mask-layer` that covers the unused right/bottom `vips` square-grid area.
 *
 * Because MapLibre's `background` layer only renders inside the Web Mercator world square
 * `[-180..180, -85.051129..85.051129]`, using the exact same color inside and outside
 * ensures that non-square plans (like A4 portrait or A0 landscape) never show a visible square
 * padding box at the bottom or right when zoomed out or rotated.
 */
const CANVAS_BG_COLOR = '#111827';

/**
 * Web Mercator world bounds constants.
 * Note: We use `179.9999` instead of `180` for GeoJSON polygon vertices so MapLibre's
 * antimeridian clipper never treats world-edge vertices as crossing the dateline.
 */
const WEB_MERCATOR_MAX_LAT = 85.05112877980659;
const SAFE_MAX_LNG = 179.9999;

/**
 * Minimum zoom level (`-2` allows zooming out until the entire plan is ~110px wide,
 * giving a playful, unconstrained overview even on large monitors).
 */
const MIN_VIEW_ZOOM = -2;

// Configure MapLibre GL v6 Web Worker URL for Vite so GeoJSON sources (pins/footprints) render reliably
if (typeof maplibregl.setWorkerUrl === 'function') {
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
}

// Register single-file PMTiles protocol handler for HTTP Range requests (206 Partial Content) & Local Blob
const pmtilesProtocol = new Protocol();
if (typeof maplibregl.addProtocol === 'function') {
  maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
}

interface MapLibrePlanViewerProps {
  /** Optional document file URL used as fallback to extract `documentId` */
  url?: string;
  /** UUID of the document whose `.pmtiles` and `.metadata.json` should be loaded */
  documentId?: string;
  /** Fired when the user clicks (without dragging) on a free spot inside the plan `(0..1, 0..1)` */
  onPlanClick?: (coords: { x: number; y: number }) => void;
  /** Fired when the user clicks on an existing task pin */
  onPinClick?: (task: Task) => void;
  /** List of tasks (pins) for the current document page */
  tasks?: Task[];
  /** Currently active task ID */
  activeTaskId?: string | null;
  /** Alias for `activeTaskId` */
  selectedTaskId?: string | null;
}

/**
 * Converts normalized plan coordinates `(x: 0..1, y: 0..1)` into Web Mercator `(lng, lat)`.
 *
 * Background on `vips dzsave --layout google`:
 * `libvips` places the rendered PDF (`width x height` pixels) into the top-left corner
 * of a square power-of-two pixel grid of size `(2^maxZoom * tileSize) x (2^maxZoom * tileSize)`.
 * Therefore:
 * - `(x = 0, y = 0)` maps to the top-left of the Web Mercator square `(-180°, +85.051129°)`.
 * - `(x = 1, y = 1)` maps to `(width / gridPixelSize, height / gridPixelSize)` within that square,
 *   NOT to `(+180°, -85.051129°)`.
 */
export const planCoordsToLngLat = (
  x: number,
  y: number,
  metadata: PlanTileMetadata
): { lng: number; lat: number } => {
  const tilesPerSide = Math.pow(2, metadata.maxZoom);
  const gridPixelSize = tilesPerSide * metadata.tileSize;

  const widthRatio = metadata.width / gridPixelSize;
  const heightRatio = metadata.height / gridPixelSize;

  const mercX = x * widthRatio;
  const mercY = y * heightRatio;

  const lng = mercX * 360 - 180;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * mercY)));

  return { lng, lat };
};

/**
 * Inverse of `planCoordsToLngLat`: converts a Web Mercator `(lng, lat)` click coordinate
 * back into normalized plan coordinates `(x: 0..1, y: 0..1)`, accounting for `vips` grid padding
 * and working accurately at any map zoom or rotation angle.
 */
export const lngLatToPlanCoords = (
  lng: number,
  lat: number,
  metadata: PlanTileMetadata
): { x: number; y: number } => {
  const tilesPerSide = Math.pow(2, metadata.maxZoom);
  const gridPixelSize = tilesPerSide * metadata.tileSize;

  const widthRatio = metadata.width / gridPixelSize;
  const heightRatio = metadata.height / gridPixelSize;

  const mercX = (lng + 180) / 360;
  const latRad = (lat * Math.PI) / 180;
  const mercY = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2;

  const x = mercX / widthRatio;
  const y = mercY / heightRatio;

  return { x, y };
};

/**
 * Builds a closed GeoJSON polygon ring `[lng, lat][]` for an axis-aligned rectangle
 * with intermediate vertices along each edge.
 *
 * Why subdivide?
 * When a rectangle spans more than 180° of longitude (e.g. `-180°` to `+128.5°`),
 * a single segment from `west` to `east` has `|Δlng| > 180°`, which causes spherical/antimeridian
 * polygon clippers to wrap the edge the short way across `±180°`, producing visual artifacts when rotating.
 * Subdividing each edge into small steps (`<= 22.5°`) prevents any antimeridian wrapping.
 */
function buildSubdividedRectRing(
  west: number,
  north: number,
  east: number,
  south: number,
  steps = 16
): [number, number][] {
  const safeWest = Math.max(-SAFE_MAX_LNG, Math.min(SAFE_MAX_LNG, west));
  const safeEast = Math.max(-SAFE_MAX_LNG, Math.min(SAFE_MAX_LNG, east));
  const safeNorth = Math.max(-WEB_MERCATOR_MAX_LAT, Math.min(WEB_MERCATOR_MAX_LAT, north));
  const safeSouth = Math.max(-WEB_MERCATOR_MAX_LAT, Math.min(WEB_MERCATOR_MAX_LAT, south));

  const ring: [number, number][] = [];

  // Top edge: west -> east
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ring.push([safeWest + (safeEast - safeWest) * t, safeNorth]);
  }
  // Right edge: north -> south
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    ring.push([safeEast, safeNorth + (safeSouth - safeNorth) * t]);
  }
  // Bottom edge: east -> west
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    ring.push([safeEast - (safeEast - safeWest) * t, safeSouth]);
  }
  // Left edge: south -> north
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    ring.push([safeWest, safeSouth + (safeNorth - safeSouth) * t]);
  }

  return ring;
}

const getTaskStatusColor = (status: string): string => {
  if (status === 'Offen') return '#ef4444'; // red-500
  if (status === 'In Bearbeitung') return '#eab308'; // yellow-500
  if (status === 'Erledigt') return '#22c55e'; // green-500
  return '#3b82f6'; // blue-500
};

/**
 * Generates an offline-capable HTML5 Canvas sprite for a numbered task pin.
 * Avoids any dependency on an external MapLibre `glyphs` PBF font server.
 */
const createPinCanvasImage = (
  pinNumber: number,
  color: string,
  isActive: boolean
): { width: number; height: number; data: Uint8ClampedArray } => {
  const size = 64;
  const center = size / 2;
  const radius = isActive ? 24 : 20;

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, size, size);

      if (isActive) {
        ctx.beginPath();
        ctx.arc(center, center, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
        ctx.fill();
      }

      // Main pin circle
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Crisp white border
      ctx.lineWidth = isActive ? 5 : 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Pin number label
      ctx.font = `bold ${pinNumber >= 100 ? 18 : 22}px sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(pinNumber), center, center + 1);

      const imgData = ctx.getImageData(0, 0, size, size);
      return { width: size, height: size, data: imgData.data };
    }
  }

  return { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
};

export default function MapLibrePlanViewer({
  url,
  documentId: propDocumentId,
  onPlanClick,
  onPinClick,
  tasks = [],
  activeTaskId,
  selectedTaskId
}: MapLibrePlanViewerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<PlanTileMetadata | null>(null);
  const [bearing, setBearing] = useState(0);
  const [cacheStatus, setCacheStatus] = useState<'offline-ready' | 'prefetching' | 'range-streaming'>('range-streaming');
  const localPmtilesBlobRef = useRef<Blob | null>(null);

  const effectiveActiveTaskId = selectedTaskId !== undefined ? selectedTaskId : (activeTaskId ?? null);

  // Refs to avoid stale closures inside MapLibre event listeners
  const tasksRef = useRef(tasks);
  const onPlanClickRef = useRef(onPlanClick);
  const onPinClickRef = useRef(onPinClick);
  const activeTaskIdRef = useRef(effectiveActiveTaskId);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    onPlanClickRef.current = onPlanClick;
  }, [onPlanClick]);

  useEffect(() => {
    onPinClickRef.current = onPinClick;
  }, [onPinClick]);

  useEffect(() => {
    activeTaskIdRef.current = effectiveActiveTaskId;
  }, [effectiveActiveTaskId]);

  // Parse Document ID from prop or URL (e.g. /api/documents/123/file)
  const match = url ? url.match(/\/api\/documents\/([^/]+)/) : null;
  const resolvedDocumentId = propDocumentId || (match ? match[1] : null);

  useEffect(() => {
    if (!resolvedDocumentId) {
      setErrorMsg('Ungültige Dokumenten-URL');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMsg(null);
    localPmtilesBlobRef.current = null;

    const loadMetadataOfflineFirst = async () => {
      try {
        // 1. Offline-First: Check if plan (.pmtiles Blob + metadata.json) is already cached in IndexedDB
        const cachedPlan = await getCachedPlan(resolvedDocumentId);
        if (cachedPlan) {
          if (!cancelled) {
            localPmtilesBlobRef.current = cachedPlan.pmtilesBlob;
            setCacheStatus('offline-ready');
            setMetadata(cachedPlan.metadata);
          }
          return;
        }

        // 2. Not cached yet: Fetch metadata.json from server and stream visible tiles via HTTP Range requests
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/documents/${resolvedDocumentId}/tiles/metadata.json`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) throw new Error('Metadaten konnten nicht geladen werden.');
        const data: PlanTileMetadata = await res.json();
        if (!cancelled) {
          setCacheStatus('range-streaming');
          setMetadata(data);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setErrorMsg('Fehler beim Laden der Kacheln. (Evtl. werden diese gerade generiert)');
          setIsLoading(false);
        }
      }
    };

    void loadMetadataOfflineFirst();

    return () => {
      cancelled = true;
    };
  }, [resolvedDocumentId]);

  const syncTasksToMap = useCallback(
    (mapInstance: maplibregl.Map, currentTasks: Task[], currentActiveId: string | null, currentMeta: PlanTileMetadata) => {
      const source = mapInstance.getSource('tasks') as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      const features = currentTasks.map((task, index) => {
        const pinNumber = index + 1;
        const color = getTaskStatusColor(task.status);
        const isActive = task.id === currentActiveId;
        const iconId = `pin-${pinNumber}-${task.status}-${isActive ? 'active' : 'normal'}`;

        if (!mapInstance.hasImage(iconId)) {
          const pinImage = createPinCanvasImage(pinNumber, color, isActive);
          mapInstance.addImage(iconId, pinImage, { pixelRatio: 2 });
        }

        const lngLat = planCoordsToLngLat(task.position.x, task.position.y, currentMeta);

        return {
          type: 'Feature' as const,
          id: index + 1,
          properties: {
            id: task.id,
            title: task.title,
            status: task.status,
            pinNumber,
            color,
            active: isActive,
            icon: iconId
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [lngLat.lng, lngLat.lat]
          }
        };
      });

      source.setData({
        type: 'FeatureCollection',
        features
      });
    },
    []
  );

  useEffect(() => {
    if (!mapContainer.current || !metadata || !resolvedDocumentId) return;

    const topLeft = planCoordsToLngLat(0, 0, metadata);
    const bottomRight = planCoordsToLngLat(1, 1, metadata);
    const center = planCoordsToLngLat(0.5, 0.5, metadata);
    const maxViewZoom = metadata.maxZoom + 3;

    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const token = localStorage.getItem('token');
    const pmtilesUrl = `${origin}/api/documents/${resolvedDocumentId}/tiles.pmtiles`;

    // Hybrid PMTiles Source: uses local FileSource immediately if cached in IndexedDB,
    // otherwise starts with remote FetchSource (HTTP 206 Range requests) and upgrades in background.
    const { pmtiles, hybridSource } = createHybridPmtilesInstance(
      pmtilesUrl,
      token,
      localPmtilesBlobRef.current
    );
    pmtilesProtocol.add(pmtiles);
    let cancelBackgroundPrefetch: (() => void) | null = null;

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': CANVAS_BG_COLOR
            }
          }
        ]
      },
      center: [center.lng, center.lat],
      zoom: 0,
      minZoom: MIN_VIEW_ZOOM,
      maxZoom: maxViewZoom,
      renderWorldCopies: false, // Never repeat the plan horizontally
      pitchWithRotate: false,
      dragRotate: true,
      touchPitch: false,
      /**
       * Custom camera constraint override:
       * MapLibre's defaultMercatorConstrain prevents zooming out once the world square is smaller
       * than the viewport width (`worldSize < screenWidth`). Overriding `transformConstrain`
       * allows smooth, playful zooming out down to `MIN_VIEW_ZOOM (-2)` and free rotation,
       * while keeping the camera center within the plan's coordinate range.
       */
      transformConstrain: (lngLat, zoom) => {
        const clampedZoom = Math.min(Math.max(zoom ?? 0, MIN_VIEW_ZOOM), maxViewZoom);
        const clampedLng = Math.min(Math.max(lngLat.lng, topLeft.lng), bottomRight.lng);
        const clampedLat = Math.min(Math.max(lngLat.lat, bottomRight.lat), topLeft.lat);
        return {
          center: new maplibregl.LngLat(clampedLng, clampedLat),
          zoom: clampedZoom
        };
      },
      transformRequest: (reqUrl) => {
        if (reqUrl.startsWith('pmtiles://')) {
          return { url: reqUrl };
        }
        const currentToken = localStorage.getItem('token');
        const fullUrl = reqUrl.startsWith('/') ? `${origin}${reqUrl}` : reqUrl;
        if (currentToken && fullUrl.includes('/api/')) {
          return {
            url: fullUrl,
            headers: {
              Authorization: `Bearer ${currentToken}`
            }
          };
        }
        return { url: fullUrl };
      }
    });

    mapInstance.on('rotate', () => {
      setBearing(Math.round(mapInstance.getBearing()));
    });

    mapInstance.on('load', () => {
      // 1. Exact plan paper footprint (subdivided so edges never wrap across the ±180° antimeridian)
      const planRing = buildSubdividedRectRing(
        topLeft.lng,
        topLeft.lat,
        bottomRight.lng,
        bottomRight.lat,
        16
      );

      mapInstance.addSource('plan-footprint', {
        type: 'geojson',
        maxzoom: 0,
        buffer: 0,
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [planRing]
          }
        }
      });

      mapInstance.addLayer({
        id: 'plan-paper-fill',
        type: 'fill',
        source: 'plan-footprint',
        paint: {
          'fill-color': '#ffffff'
        }
      });

      // 2. Raster tiles source from single-file PMTiles archive (HTTP Range requests or local IndexedDB Blob)
      mapInstance.addSource('plan-tiles', {
        type: 'raster',
        tiles: [`pmtiles://${pmtilesUrl}/{z}/{x}/{y}`],
        tileSize: metadata.tileSize || 512,
        minzoom: 0,
        maxzoom: metadata.maxZoom,
        bounds: [topLeft.lng, bottomRight.lat, bottomRight.lng, topLeft.lat]
      });

      mapInstance.addLayer({
        id: 'plan-layer',
        type: 'raster',
        source: 'plan-tiles',
        paint: {
          'raster-fade-duration': 0
        }
      });

      // 3. Vector mask over the unused right & bottom `vips` square-grid padding:
      // Low-zoom tiles (like `0/0/0.webp`) and right/bottom edge tiles contain white padding pixels
      // outside `(x: 1, y: 1)`. Masking that outer region with `CANVAS_BG_COLOR` guarantees that
      // rotating or zooming out never reveals white padding outside the plan sheet.
      const maskPolygons: [number, number][][][] = [];
      if (bottomRight.lng < SAFE_MAX_LNG) {
        maskPolygons.push([
          buildSubdividedRectRing(
            bottomRight.lng,
            WEB_MERCATOR_MAX_LAT,
            SAFE_MAX_LNG,
            -WEB_MERCATOR_MAX_LAT,
            12
          )
        ]);
      }
      if (bottomRight.lat > -WEB_MERCATOR_MAX_LAT) {
        maskPolygons.push([
          buildSubdividedRectRing(
            -SAFE_MAX_LNG,
            bottomRight.lat,
            SAFE_MAX_LNG,
            -WEB_MERCATOR_MAX_LAT,
            16
          )
        ]);
      }

      mapInstance.addSource('plan-padding-mask', {
        type: 'geojson',
        maxzoom: 0,
        buffer: 0,
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'MultiPolygon',
            coordinates: maskPolygons
          }
        }
      });

      mapInstance.addLayer({
        id: 'plan-padding-mask-layer',
        type: 'fill',
        source: 'plan-padding-mask',
        paint: {
          'fill-color': CANVAS_BG_COLOR,
          'fill-opacity': 1,
          'fill-antialias': false
        }
      });

      // 4. Crisp border around the exact architectural plan sheet
      mapInstance.addLayer({
        id: 'plan-paper-border',
        type: 'line',
        source: 'plan-footprint',
        paint: {
          'line-color': '#64748b',
          'line-width': 2
        }
      });

      // Fit initial viewport cleanly to the actual architectural plan bounds with comfortable margin
      mapInstance.fitBounds(
        [
          [topLeft.lng, bottomRight.lat],
          [bottomRight.lng, topLeft.lat]
        ],
        { padding: 56, duration: 0 }
      );

      // 5. Tasks GeoJSON source and layers
      mapInstance.addSource('tasks', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Underlying hit/circle layer
      mapInstance.addLayer({
        id: 'tasks-circle-layer',
        type: 'circle',
        source: 'tasks',
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'active'], false], 14, 11],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': ['case', ['boolean', ['get', 'active'], false], 3, 2],
          'circle-stroke-color': '#ffffff'
        }
      });

      // Canvas-generated numbered pin sprite layer (100% offline, no remote glyph server needed)
      mapInstance.addLayer({
        id: 'tasks-layer',
        type: 'symbol',
        source: 'tasks',
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': 1,
          'icon-rotation-alignment': 'viewport',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });

      // Sync initial tasks
      syncTasksToMap(mapInstance, tasksRef.current, activeTaskIdRef.current, metadata);

      // Hover & drag cursor feedback
      mapInstance.getCanvas().style.cursor = 'crosshair';

      const handleMouseEnter = () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      };
      const handleMouseLeave = () => {
        mapInstance.getCanvas().style.cursor = 'crosshair';
      };

      mapInstance.on('mouseenter', 'tasks-layer', handleMouseEnter);
      mapInstance.on('mouseleave', 'tasks-layer', handleMouseLeave);
      mapInstance.on('mouseenter', 'tasks-circle-layer', handleMouseEnter);
      mapInstance.on('mouseleave', 'tasks-circle-layer', handleMouseLeave);

      mapInstance.on('dragstart', () => {
        mapInstance.getCanvas().style.cursor = 'grabbing';
      });
      mapInstance.on('dragend', () => {
        mapInstance.getCanvas().style.cursor = 'crosshair';
      });

      // Track pointer down position so dragging/panning never triggers pin creation
      let downPoint: { x: number; y: number } | null = null;
      mapInstance.on('mousedown', (e) => {
        downPoint = { x: e.point.x, y: e.point.y };
      });
      mapInstance.on('touchstart', (e) => {
        if (e.points && e.points.length === 1) {
          downPoint = { x: e.point.x, y: e.point.y };
        } else {
          downPoint = null;
        }
      });

      // Natural click interaction:
      // - Dragging moves the plan (handled natively by MapLibre dragPan)
      // - Clicking without moving selects an existing pin (if within ±15px) or places a new pin
      mapInstance.on('click', (e: maplibregl.MapMouseEvent) => {
        if (downPoint) {
          const dist = Math.hypot(e.point.x - downPoint.x, e.point.y - downPoint.y);
          if (dist > 6) {
            return; // Ignore if pointer moved during drag
          }
        }

        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 15, e.point.y - 15],
          [e.point.x + 15, e.point.y + 15]
        ];
        const features = mapInstance.queryRenderedFeatures(bbox, {
          layers: ['tasks-layer', 'tasks-circle-layer']
        });

        if (features.length > 0) {
          const clickedTaskId = features[0].properties?.id;
          const task = tasksRef.current.find(t => t.id === clickedTaskId);
          if (task && onPinClickRef.current) {
            onPinClickRef.current(task);
          }
          return;
        }

        // Click on free spot on the plan creates a pin immediately
        if (onPlanClickRef.current) {
          const coords = lngLatToPlanCoords(e.lngLat.lng, e.lngLat.lat, metadata);
          if (coords.x >= 0 && coords.x <= 1 && coords.y >= 0 && coords.y <= 1) {
            onPlanClickRef.current(coords);
          }
        }
      });

      setIsLoading(false);

      // Start smart background prefetch of the complete .pmtiles archive into IndexedDB
      // if it is not already served from a local Blob.
      if (!hybridSource.isUsingLocalBlob()) {
        cancelBackgroundPrefetch = schedulePlanBackgroundPrefetch({
          documentId: resolvedDocumentId,
          pmtilesUrl,
          token,
          metadata,
          hybridSource,
          onStatusChange: (status) => {
            if (status === 'prefetching') {
              setCacheStatus('prefetching');
            } else if (status === 'offline-ready') {
              setCacheStatus('offline-ready');
            }
          }
        });
      }
    });

    map.current = mapInstance;

    return () => {
      cancelBackgroundPrefetch?.();
      mapInstance.remove();
      map.current = null;
    };
  }, [metadata, resolvedDocumentId, syncTasksToMap]);

  // Update tasks GeoJSON immediately whenever tasks or active/selected task changes
  useEffect(() => {
    if (!map.current || !metadata || isLoading) return;
    syncTasksToMap(map.current, tasks, effectiveActiveTaskId, metadata);
  }, [tasks, effectiveActiveTaskId, metadata, isLoading, syncTasksToMap]);

  const zoomIn = () => map.current?.zoomIn();
  const zoomOut = () => map.current?.zoomOut();
  const resetBearing = () => {
    map.current?.resetNorthPitch({ duration: 250 });
  };
  const resetTransform = () => {
    if (metadata && map.current) {
      const topLeft = planCoordsToLngLat(0, 0, metadata);
      const bottomRight = planCoordsToLngLat(1, 1, metadata);
      map.current.resetNorthPitch({ duration: 250 });
      map.current.fitBounds(
        [
          [topLeft.lng, bottomRight.lat],
          [bottomRight.lng, topLeft.lat]
        ],
        { padding: 56, duration: 300 }
      );
    }
  };

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden relative select-none"
      style={{ backgroundColor: CANVAS_BG_COLOR }}
    >
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 p-2 bg-white rounded-lg shadow-lg z-20">
        <button
          onClick={zoomOut}
          className="p-2 rounded hover:bg-gray-100 text-gray-600"
          title="Verkleinern"
        >
          <ZoomOut size={20} />
        </button>
        <button
          onClick={resetTransform}
          className="p-2 rounded hover:bg-gray-100 text-gray-600"
          title="Ansicht zentrieren"
        >
          <Maximize size={20} />
        </button>
        <button
          onClick={zoomIn}
          className="p-2 rounded hover:bg-gray-100 text-gray-600"
          title="Vergrößern"
        >
          <ZoomIn size={20} />
        </button>

        {bearing !== 0 && (
          <button
            onClick={resetBearing}
            className="flex items-center space-x-1 px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium"
            title="Drehung zurücksetzen (Nordausrichtung)"
          >
            <RotateCcw size={14} />
            <span>{bearing}°</span>
          </button>
        )}

        <div className="h-5 w-px bg-gray-200 mx-1" />

        {cacheStatus === 'offline-ready' ? (
          <span
            className="flex items-center space-x-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md"
            title="Plan ist lokal in IndexedDB gecacht – 0 Netzwerk-Requests beim Zoomen/Verschieben"
          >
            <CheckCircle2 size={14} />
            <span>Offline bereit</span>
          </span>
        ) : (
          <span
            className="flex items-center space-x-1 text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md"
            title="Kacheln werden per HTTP Range-Request gestreamt und im Hintergrund für Offline gecacht"
          >
            <CloudDownload size={14} className={cacheStatus === 'prefetching' ? 'animate-pulse' : ''} />
            <span>{cacheStatus === 'prefetching' ? 'Cache im Hintergrund...' : 'Range-Stream'}</span>
          </span>
        )}
      </div>

      <div className="flex-1 w-full h-full relative" style={{ backgroundColor: CANVAS_BG_COLOR }}>
        <div className="w-full h-full" style={{ backgroundColor: CANVAS_BG_COLOR }} ref={mapContainer} />
        {(isLoading || errorMsg) && (
          <div className="absolute inset-0 z-10 bg-slate-50 flex flex-col items-center justify-center text-slate-400">
            {errorMsg ? (
              <div className="text-red-500 font-bold p-8 bg-white rounded shadow-lg text-center">
                <div className="text-xl mb-2">Fehler beim Laden</div>
                <div>{errorMsg}</div>
              </div>
            ) : (
              <>
                <Loader2 size={48} className="animate-spin text-blue-500 mb-4" />
                <div className="text-lg font-medium tracking-wide">
                  Plan wird geladen...
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
