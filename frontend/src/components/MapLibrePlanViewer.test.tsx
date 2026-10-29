import { describe, it, expect } from 'vitest';
import { planCoordsToLngLat, lngLatToPlanCoords } from './MapLibrePlanViewer';

describe('MapLibrePlanViewer Coordinate Transformations', () => {
    const aspectRatio = 1.5;

    it('should map origin (0,0) correctly (top-left)', () => {
        const { lng, lat } = planCoordsToLngLat(0, 0, aspectRatio);
        expect(lng).toBeCloseTo(0);
        expect(lat).toBeCloseTo(1);

        const { x, y } = lngLatToPlanCoords(lng, lat, aspectRatio);
        expect(x).toBeCloseTo(0);
        expect(y).toBeCloseTo(0);
    });

    it('should map bottom-right (1,1) correctly', () => {
        const { lng, lat } = planCoordsToLngLat(1, 1, aspectRatio);
        expect(lng).toBeCloseTo(1);
        expect(lat).toBeCloseTo(1 - aspectRatio);

        const { x, y } = lngLatToPlanCoords(lng, lat, aspectRatio);
        expect(x).toBeCloseTo(1);
        expect(y).toBeCloseTo(1);
    });

    it('should map center (0.5, 0.5) correctly', () => {
        const { lng, lat } = planCoordsToLngLat(0.5, 0.5, aspectRatio);
        expect(lng).toBeCloseTo(0.5);
        expect(lat).toBeCloseTo(1 - (aspectRatio / 2));

        const { x, y } = lngLatToPlanCoords(lng, lat, aspectRatio);
        expect(x).toBeCloseTo(0.5);
        expect(y).toBeCloseTo(0.5);
    });

    it('should map arbitrary point correctly', () => {
        const testX = 0.234;
        const testY = 0.876;

        const { lng, lat } = planCoordsToLngLat(testX, testY, aspectRatio);
        const { x, y } = lngLatToPlanCoords(lng, lat, aspectRatio);

        expect(x).toBeCloseTo(testX);
        expect(y).toBeCloseTo(testY);
    });
});
