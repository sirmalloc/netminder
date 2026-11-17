import {
    useEffect,
    useState
} from 'react';
import { useParams } from 'react-router-dom';

import type {
    Checkin,
    Net
} from '../api';
import {
    fetchCheckins,
    fetchNet,
    isNotFoundError
} from '../api';
import { NetMapView } from '../components/NetMapView';

export function NetMapPage() {
    const { id } = useParams<{ id: string }>();
    const [net, setNet] = useState<Net | null>(null);
    const [checkins, setCheckins] = useState<Checkin[]>([]);
    const [isUnavailable, setIsUnavailable] = useState(false);

    const netId = Number(id);
    const isValidId = Boolean(id) && !Number.isNaN(netId);
    const netEnded = Boolean(net?.ended_at);

    useEffect(() => {
        if (!isValidId)
            return;

        const polling = { stopped: false };

        async function refresh() {
            const [netResult, checkinsResult] = await Promise.allSettled([
                fetchNet(netId),
                fetchCheckins(netId)
            ]);

            if (polling.stopped)
                return;

            const notFound = [netResult, checkinsResult].some(
                result => result.status === 'rejected' && isNotFoundError(result.reason)
            );
            if (notFound) {
                polling.stopped = true;
                setIsUnavailable(true);
                setNet(null);
                setCheckins([]);
                return;
            }

            if (netResult.status === 'fulfilled') {
                setNet(netResult.value);
            } else {
                console.error('Error fetching net:', netResult.reason);
            }

            if (checkinsResult.status === 'fulfilled') {
                setCheckins(checkinsResult.value);
            } else {
                console.error('Error fetching checkins:', checkinsResult.reason);
            }
        }

        void refresh();

        if (netEnded) {
            return () => { polling.stopped = true; };
        }

        const interval = setInterval(() => void refresh(), 10000);
        return () => {
            polling.stopped = true;
            clearInterval(interval);
        };
    }, [isValidId, netId, netEnded]);

    if (!isValidId || isUnavailable) {
        return (
            <div className='flex min-h-screen items-center justify-center text-slate-400'>
                Net not found
            </div>
        );
    }

    const located = checkins.filter(c => c.latitude !== null && c.longitude !== null).length;

    return (
        <div className='flex h-screen flex-col'>
            <header className='flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/50 bg-slate-900/80 px-4 py-2'>
                <h1 className='truncate text-base font-semibold text-slate-100'>
                    {net?.topic ?? 'Net map'}
                    {net && (
                        <span className='ml-3 text-sm font-normal text-slate-400'>
                            {new Date(net.started_at ?? net.created_at).toLocaleDateString()}
                        </span>
                    )}
                </h1>
                <span className='text-sm text-slate-400'>
                    {located}
                    {' of '}
                    {checkins.length}
                    {' stations shown'}
                </span>
            </header>
            <div className='min-h-0 flex-1'>
                <NetMapView checkins={checkins} />
            </div>
        </div>
    );
}