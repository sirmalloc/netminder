import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
    useCallback,
    useEffect,
    useRef
} from 'react';
import { FaExpand } from 'react-icons/fa';

import type { Checkin } from '../api';

interface CheckinMapProps {
    checkins: Checkin[];
    radarEnabled: boolean;
}

interface LocatedCheckin {
    checkin: Checkin;
    lat: number;
    lon: number;
}

const RADAR_URL = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png';
const RADAR_REFRESH_MS = 5 * 60 * 1000;
const RADAR_ATTRIBUTION = 'NEXRAD radar: NWS via Iowa Environmental Mesonet (US only)';
const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const RING_RADIUS_PX = 26;
const RING_BASE_CAPACITY = 8;
const MARKER_COLOR = '#4338ca';
const MARKER_FILL = '#818cf8';
const LEADER_COLOR = '#475569';

function radarTileUrl(): string {
    const bucket = Math.floor(Date.now() / RADAR_REFRESH_MS);
    return `${RADAR_URL}?_=${bucket}`;
}

function groupByLocation(located: LocatedCheckin[]): LocatedCheckin[][] {
    const groups = new Map<string, LocatedCheckin[]>();
    for (const item of located) {
        const key = `${item.lat.toFixed(5)},${item.lon.toFixed(5)}`;
        const group = groups.get(key);
        if (group) {
            group.push(item);
        } else {
            groups.set(key, [item]);
        }
    }
    return [...groups.values()];
}

function ringOffset(index: number, count: number): L.Point {
    let ring = 0;
    let start = 0;
    let capacity = RING_BASE_CAPACITY;
    while (index >= start + capacity) {
        start += capacity;
        ring += 1;
        capacity = RING_BASE_CAPACITY * (ring + 1);
    }
    const inRing = Math.min(capacity, count - start);
    const angle = -Math.PI / 2 + (2 * Math.PI * (index - start)) / inRing;
    const radius = RING_RADIUS_PX * (ring + 1);
    return L.point(Math.cos(angle) * radius, Math.sin(angle) * radius);
}

const PRECISION_NOTES: Record<string, string | null> = {
    address: null,
    zip: 'Approximate: ZIP code center',
    grid: 'Approximate: grid square center',
    state: 'Approximate: state center',
    country: 'Approximate: country center',
    unknown: 'Location precision not reported by QRZ'
};

const APPROXIMATE_PRECISIONS = ['zip', 'grid', 'state', 'country'];

function buildPopup(item: LocatedCheckin): HTMLElement {
    const { checkin } = item;
    const root = document.createElement('div');

    const title = document.createElement('strong');
    title.textContent = checkin.callsign;
    root.appendChild(title);

    const lines = [
        checkin.display_name,
        checkin.location_display,
        `Location: ${item.lat.toFixed(4)}, ${item.lon.toFixed(4)}`,
        PRECISION_NOTES[checkin.location_precision ?? 'address'] ?? null
    ];
    for (const line of lines) {
        if (!line)
            continue;
        const el = document.createElement('div');
        el.textContent = line;
        root.appendChild(el);
    }
    return root;
}

function labelDirection(offset: L.Point): L.Direction {
    if (Math.abs(offset.x) >= Math.abs(offset.y) / 2)
        return offset.x < 0 ? 'left' : 'right';
    return offset.y < 0 ? 'top' : 'bottom';
}

const LABEL_OFFSETS: Record<string, L.PointExpression> = {
    left: [-8, 0],
    right: [8, 0],
    top: [0, -8],
    bottom: [0, 8]
};

function buildMarker(item: LocatedCheckin, latLng: L.LatLng, direction: L.Direction = 'right'): L.CircleMarker {
    const approximate = APPROXIMATE_PRECISIONS.includes(item.checkin.location_precision ?? '');
    const marker = L.circleMarker(latLng, {
        radius: 7,
        color: MARKER_COLOR,
        weight: 2,
        dashArray: approximate ? '3 3' : undefined,
        fillColor: MARKER_FILL,
        fillOpacity: approximate ? 0.05 : 0.85
    });
    marker.bindTooltip(item.checkin.callsign, {
        permanent: true,
        direction,
        offset: LABEL_OFFSETS[direction]
    });
    marker.bindPopup(buildPopup(item));
    return marker;
}

export function CheckinMap({ checkins, radarEnabled }: CheckinMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markerLayerRef = useRef<L.LayerGroup | null>(null);
    const renderRef = useRef<() => void>(() => undefined);
    const hasFitRef = useRef(false);
    const renderKeyRef = useRef<string | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container)
            return;

        const map = L.map(container, { zoomControl: true }).setView([39, -98], 4);
        L.tileLayer(OSM_URL, {
            maxZoom: 19,
            attribution: OSM_ATTRIBUTION,
            referrerPolicy: 'strict-origin-when-cross-origin'
        }).addTo(map);

        markerLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;

        const handleZoomEnd = () => {
            renderRef.current();
        };
        map.on('zoomend', handleZoomEnd);

        const observer = new ResizeObserver(() => map.invalidateSize());
        observer.observe(container);
        map.invalidateSize();

        return () => {
            observer.disconnect();
            map.off('zoomend', handleZoomEnd);
            map.remove();
            mapRef.current = null;
            markerLayerRef.current = null;
            hasFitRef.current = false;
            renderKeyRef.current = null;
        };
    }, []);

    const fitAll = useCallback(() => {
        const map = mapRef.current;
        if (!map)
            return;
        const points: L.LatLng[] = [];
        for (const c of checkins) {
            if (c.latitude !== null && c.longitude !== null) {
                points.push(L.latLng(c.latitude, c.longitude));
            }
        }
        if (points.length === 0)
            return;
        map.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 12 });
    }, [checkins]);

    useEffect(() => {
        const map = mapRef.current;
        const layer = markerLayerRef.current;
        if (!map || !layer)
            return;

        // Polling hands us a new array every few seconds; skip rebuilding (and closing open popups) unless something shown changed
        const renderKey = checkins
            .map(c => [c.id, c.callsign, c.display_name, c.location_display, c.latitude, c.longitude, c.location_source, c.location_precision].join('|'))
            .join('\n');
        if (renderKey === renderKeyRef.current)
            return;
        renderKeyRef.current = renderKey;

        const located: LocatedCheckin[] = [];
        for (const checkin of checkins) {
            if (checkin.latitude !== null && checkin.longitude !== null) {
                located.push({
                    checkin,
                    lat: checkin.latitude,
                    lon: checkin.longitude
                });
            }
        }
        const groups = groupByLocation(located);

        const render = () => {
            layer.clearLayers();
            for (const group of groups) {
                const first = group[0];
                const trueLatLng = L.latLng(first.lat, first.lon);

                if (group.length === 1) {
                    buildMarker(first, trueLatLng).addTo(layer);
                    continue;
                }

                const truePoint = map.latLngToLayerPoint(trueLatLng);
                L.circleMarker(trueLatLng, {
                    radius: 2.5,
                    color: LEADER_COLOR,
                    weight: 1,
                    fillColor: LEADER_COLOR,
                    fillOpacity: 1,
                    interactive: false
                }).addTo(layer);

                group.forEach((item, index) => {
                    const offset = ringOffset(index, group.length);
                    const spread = map.layerPointToLatLng(truePoint.add(offset));
                    L.polyline([trueLatLng, spread], {
                        color: LEADER_COLOR,
                        weight: 1.5,
                        opacity: 0.8,
                        interactive: false
                    }).addTo(layer);
                    buildMarker(item, spread, labelDirection(offset)).addTo(layer);
                });
            }
        };

        renderRef.current = render;
        render();

        if (!hasFitRef.current && located.length > 0) {
            hasFitRef.current = true;
            fitAll();
        }
    }, [checkins, fitAll]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !radarEnabled)
            return;

        const radar = L.tileLayer(radarTileUrl(), {
            opacity: 0.6,
            attribution: RADAR_ATTRIBUTION
        }).addTo(map);
        const interval = setInterval(() => radar.setUrl(radarTileUrl()), RADAR_REFRESH_MS);

        return () => {
            clearInterval(interval);
            radar.remove();
        };
    }, [radarEnabled]);

    return (
        <div className='relative isolate h-full w-full'>
            <div ref={containerRef} className='h-full w-full' />
            <button
                type='button'
                onClick={fitAll}
                className='absolute right-3 top-3 z-[1000] flex items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 shadow-md shadow-black/30 transition-colors hover:border-slate-600 hover:bg-slate-800'
            >
                <FaExpand />
                Fit all
            </button>
        </div>
    );
}