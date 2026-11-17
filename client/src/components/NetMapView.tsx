import {
    useEffect,
    useState
} from 'react';

import type { Checkin } from '../api';

import { CheckinMap } from './CheckinMap';

interface NetMapViewProps {
    checkins: Checkin[];
}

const RADAR_STORAGE_KEY = 'netminder.map.radar';

function readRadarPreference(): boolean {
    try {
        return localStorage.getItem(RADAR_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function NetMapView({ checkins }: NetMapViewProps) {
    const [radarEnabled, setRadarEnabled] = useState<boolean>(readRadarPreference);

    useEffect(() => {
        try {
            localStorage.setItem(RADAR_STORAGE_KEY, radarEnabled ? '1' : '0');
        } catch {
            // Preference is optional; ignore storage failures
        }
    }, [radarEnabled]);

    const unlocated = checkins.filter(c => c.latitude === null || c.longitude === null);

    return (
        <div className='flex h-full min-h-0 flex-col'>
            <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-700/50 bg-slate-900/60 px-4 py-2 text-sm'>
                <label className='flex cursor-pointer items-center gap-2 text-slate-300'>
                    <input
                        type='checkbox'
                        checked={radarEnabled}
                        onChange={(e) => {
                            setRadarEnabled(e.target.checked);
                        }}
                        className='h-4 w-4 accent-indigo-500'
                    />
                    Radar
                </label>
                <span className='text-xs text-slate-400'>
                    Locations come from QRZ registrations, not live positions; dashed markers are approximate
                </span>
            </div>
            <div className='min-h-0 flex-1'>
                <CheckinMap checkins={checkins} radarEnabled={radarEnabled} />
            </div>
            {unlocated.length > 0 && (
                <div className='border-t border-slate-700/50 bg-slate-900/60 px-4 py-2 text-xs text-slate-400'>
                    <span className='font-semibold text-slate-300'>
                        No location (
                        {unlocated.length}
                        ):
                    </span>
                    {' '}
                    {unlocated.map(c => c.callsign).join(', ')}
                </div>
            )}
        </div>
    );
}