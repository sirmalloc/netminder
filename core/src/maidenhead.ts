export interface LatLon {
    lat: number;
    lon: number;
}

const LOCATOR_PATTERN = /^[A-R]{2}(?:\d{2}(?:[A-X]{2}(?:\d{2})?)?)?$/;

export function gridToLatLon(grid: string | null | undefined): LatLon | null {
    const value = grid?.trim().toUpperCase();
    if (!value || value.length < 4 || !LOCATOR_PATTERN.test(value)) {
        return null;
    }

    let lon = (value.charCodeAt(0) - 65) * 20 - 180;
    let lat = (value.charCodeAt(1) - 65) * 10 - 90;
    let lonSize = 20;
    let latSize = 10;

    lon += Number(value[2]) * 2;
    lat += Number(value[3]);
    lonSize = 2;
    latSize = 1;

    if (value.length >= 6) {
        lonSize = 2 / 24;
        latSize = 1 / 24;
        lon += (value.charCodeAt(4) - 65) * lonSize;
        lat += (value.charCodeAt(5) - 65) * latSize;
    }

    if (value.length === 8) {
        lonSize /= 10;
        latSize /= 10;
        lon += Number(value[6]) * lonSize;
        lat += Number(value[7]) * latSize;
    }

    return {
        lat: lat + latSize / 2,
        lon: lon + lonSize / 2
    };
}