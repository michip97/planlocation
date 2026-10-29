import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ZoomIn, ZoomOut, Maximize, MousePointer2, Hand, Loader2 } from 'lucide-react';
import type { Task } from '../types';

interface MapLibrePlanViewerProps {
  url: string; // Used to derive the tile metadata URL
  onPlanClick?: (coords: { x: number; y: number }) => void;
  onPinClick?: (task: Task) => void;
  tasks?: Task[];
  activeTaskId?: string | null;
}

export default function MapLibrePlanViewer({ url, onPlanClick, onPinClick, tasks = [], activeTaskId }: MapLibrePlanViewerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isPanningMode, setIsPanningMode] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<{width: number, height: number, aspectRatio: number, tileSize: number, maxZoom: number} | null>(null);

  // Parse Document ID from URL: e.g. /api/documents/123/file
  const match = url.match(/\/api\/documents\/([^/]+)\/file/);
  const documentId = match ? match[1] : null;

  useEffect(() => {
    if (!documentId) {
      setErrorMsg('Ungültige Dokumenten-URL');
      setIsLoading(false);
      return;
    }

    const fetchMetadata = async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/tiles/metadata.json`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!res.ok) throw new Error('Metadaten konnten nicht geladen werden.');
        const data = await res.json();
        setMetadata(data);
      } catch (err: any) {
        console.error(err);
        setErrorMsg('Fehler beim Laden der Kacheln. (Evtl. werden diese gerade generiert)');
        setIsLoading(false);
      }
    };

    fetchMetadata();
  }, [documentId]);

  useEffect(() => {
    if (!mapContainer.current || !metadata || map.current) return;

    const { aspectRatio, tileSize, maxZoom } = metadata;

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
              'background-color': '#f4f4f5'
            }
          }
        ]
      },
      center: [0.5, 1 - (aspectRatio / 2)], // center of the plan
      zoom: 0,
      pitchWithRotate: false,
      dragRotate: true,
      maxBounds: [
        [-0.5, 1 - aspectRatio - 0.5], // South-west
        [1.5, 1.5] // North-east
      ]
    });

    mapInstance.on('load', () => {
      // Add raster source for the plan
      mapInstance.addSource('plan-tiles', {
        type: 'raster',
        tiles: [`/api/documents/${documentId}/tiles/{z}/{x}/{y}.webp`],
        tileSize: tileSize,
        maxzoom: maxZoom,
        bounds: [0, 0, 1, aspectRatio] // Limits where tiles are requested
      });

      mapInstance.addLayer({
        id: 'plan-layer',
        type: 'raster',
        source: 'plan-tiles',
        paint: {
          'raster-fade-duration': 0
        }
      });

      // Add source and layers for tasks
      mapInstance.addSource('tasks', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Base circles
      mapInstance.addLayer({
        id: 'tasks-layer',
        type: 'circle',
        source: 'tasks',
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'active'], false],
            10,
            8
          ],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'active'], false],
            2,
            0
          ],
          'circle-stroke-color': '#ffffff'
        }
      });

      // Text label (e.g. !)
      mapInstance.addLayer({
        id: 'tasks-label-layer',
        type: 'symbol',
        source: 'tasks',
        layout: {
          'text-field': '!',
          'text-size': 12,
          'text-rotation-alignment': 'viewport',
          'text-allow-overlap': true
        },
        paint: {
          'text-color': '#ffffff'
        }
      });

      // Hover interaction for cursor
      mapInstance.on('mouseenter', 'tasks-layer', () => {
        if (isPanningMode) {
           mapInstance.getCanvas().style.cursor = 'pointer';
        }
      });
      mapInstance.on('mouseleave', 'tasks-layer', () => {
        if (isPanningMode) {
           mapInstance.getCanvas().style.cursor = 'grab';
        }
      });

      // Map clicks
      mapInstance.on('click', (e: maplibregl.MapMouseEvent) => {
        // If clicking a pin
        const features = mapInstance.queryRenderedFeatures(e.point, { layers: ['tasks-layer'] });
        if (features.length > 0) {
          const clickedTaskId = features[0].properties.id;
          const task = tasks.find(t => t.id === clickedTaskId);
          if (task && onPinClick) {
             onPinClick(task);
          }
          return;
        }

        // If clicking the plan (and not panning mode)
        if (!isPanningMode && onPlanClick) {
          const lngLat = e.lngLat;

          // Re-calculate the position.
          const coords = lngLatToPlanCoords(lngLat.lng, lngLat.lat, aspectRatio);

          // Only trigger if click is inside the plan bounds
          if (coords.x >= 0 && coords.x <= 1 && coords.y >= 0 && coords.y <= 1) {
            onPlanClick(coords);
          }
        }
      });

      setIsLoading(false);
    });

    map.current = mapInstance;

    return () => {
      mapInstance.remove();
      map.current = null;
    };
  }, [metadata, documentId]);

  // Update tasks geojson when tasks or activeTaskId changes
  useEffect(() => {
    if (!map.current || !metadata || isLoading) return;

    const source = map.current.getSource('tasks') as maplibregl.GeoJSONSource;
    if (source) {
      const features = tasks.map(task => {
        let color = '#3b82f6'; // bg-blue-500
        if (task.status === 'Offen') color = '#ef4444'; // bg-red-500
        else if (task.status === 'In Bearbeitung') color = '#eab308'; // bg-yellow-500
        else if (task.status === 'Erledigt') color = '#22c55e'; // bg-green-500

        const lngLat = planCoordsToLngLat(task.position.x, task.position.y, metadata.aspectRatio);

        return {
          type: 'Feature' as const,
          id: task.id,
          properties: {
            id: task.id,
            title: task.title,
            color
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

      // Update feature states for active pin
      tasks.forEach(task => {
        map.current?.setFeatureState(
          { source: 'tasks', id: task.id },
          { active: task.id === activeTaskId }
        );
      });
    }
  }, [tasks, activeTaskId, metadata, isLoading]);

  // Handle cursor mode
  useEffect(() => {
    if (!map.current) return;
    const canvas = map.current.getCanvas();
    if (isPanningMode) {
      map.current.dragPan.enable();
      canvas.style.cursor = 'grab';
    } else {
      map.current.dragPan.disable();
      canvas.style.cursor = 'crosshair';
    }
  }, [isPanningMode]);


  const zoomIn = () => map.current?.zoomIn();
  const zoomOut = () => map.current?.zoomOut();
  const resetTransform = () => {
     if (metadata && map.current) {
        map.current.flyTo({ center: [0.5, 1 - (metadata.aspectRatio / 2)], zoom: 0, bearing: 0, pitch: 0 });
     }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 w-full overflow-hidden relative select-none">

      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 p-2 bg-white rounded-lg shadow-lg z-20">
        <div className="flex items-center border-r pr-4 space-x-2">
           <button
            onClick={() => setIsPanningMode(true)}
            className={`p-2 rounded flex items-center ${isPanningMode ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}
            title="Verschieben (Pan)"
          >
            <Hand size={20} />
          </button>
          <button
            onClick={() => setIsPanningMode(false)}
            className={`p-2 rounded flex items-center ${!isPanningMode ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}
            title="Markieren (Klick für Pendenz)"
          >
            <MousePointer2 size={20} />
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => zoomOut()}
            className="p-2 rounded hover:bg-gray-100 text-gray-600"
            title="Verkleinern"
          >
            <ZoomOut size={20} />
          </button>
          <button
            onClick={() => resetTransform()}
            className="p-2 rounded hover:bg-gray-100 text-gray-600"
            title="Ansicht zentrieren"
          >
            <Maximize size={20} />
          </button>
          <button
            onClick={() => zoomIn()}
            className="p-2 rounded hover:bg-gray-100 text-gray-600"
            title="Vergrößern"
          >
            <ZoomIn size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 w-full h-full relative" ref={mapContainer}>
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

export const planCoordsToLngLat = (x: number, y: number, aspectRatio: number) => {
    const lng = x;
    const lat = 1 - (y * aspectRatio);
    return { lng, lat };
};

export const lngLatToPlanCoords = (lng: number, lat: number, aspectRatio: number) => {
    const x = lng;
    const y = (1 - lat) / aspectRatio;
    return { x, y };
};
