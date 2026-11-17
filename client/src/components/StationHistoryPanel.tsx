import {
    useCallback,
    useEffect,
    useState
} from 'react';
import {
    FaCar,
    FaHome,
    FaSuitcase,
    FaTimes
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

import type { StationStats } from '../api';
import {
    fetchStationStats as fetchStationStatsApi,
    refreshStation,
    updateStation
} from '../api';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { parseDisplayName } from '../utils/displayName';
import { resolveErrorMessage } from '../utils/errors';

import { EditableText } from './EditableName';

interface StationHistoryPanelProps {
    callsign: string;
    isOpen: boolean;
    onClose: () => void;
    onCallsignRenamed?: (previousCallsign: string, newCallsign: string) => void;
    onStationUpdated?: (updatedCallsign?: string) => Promise<void> | void;
}

export function StationHistoryPanel({
    callsign,
    isOpen,
    onClose,
    onCallsignRenamed,
    onStationUpdated
}: StationHistoryPanelProps) {
    const navigate = useNavigate();
    const { mobilityEnabled } = useAppConfig();
    const { user } = useAuth();
    const isAdmin = Boolean(user?.is_admin);
    const [stats, setStats] = useState<StationStats | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSyncingQrz, setIsSyncingQrz] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const { text: headerName, fromQrz: headerNameFromQrz } = parseDisplayName(stats?.display_name ?? null);
    const { text: headerLocation, fromQrz: headerLocationFromQrz } = parseDisplayName(stats?.location_display ?? null);

    const fetchStats = useCallback(async (targetCallsign: string) => {
        try {
            setIsLoading(true);
            setError(null);
            setSyncError(null);
            const statsResponse = await fetchStationStatsApi(targetCallsign);
            setStats(statsResponse);
        } catch (err) {
            console.error('Error fetching station stats:', err);
            setError('Failed to load station history');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isOpen || !callsign) {
            return;
        }

        void fetchStats(callsign);
    }, [callsign, fetchStats, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setIsSyncingQrz(false);
            setSyncError(null);
        }
    }, [isOpen]);

    const formatDate = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };

    const formatDateTime = (timestamp: string) => `${formatDate(timestamp)} · ${formatTime(timestamp)}`;

    const getMobilityIcon = (mobility: string) => {
        switch (mobility) {
        case 'mobile':
            return <FaCar className='text-sky-400' size={14} />;
        case 'portable':
            return <FaSuitcase className='text-sky-400' size={14} />;
        default:
            return <FaHome className='text-sky-400' size={14} />;
        }
    };

    const handleCallsignSave = async (nextValue: string) => {
        const normalizedValue = nextValue.trim().toUpperCase();

        if (!normalizedValue) {
            throw new Error('Callsign is required');
        }

        if (normalizedValue === callsign.toUpperCase())
            return;

        try {
            const updated = await updateStation(callsign, { new_callsign: normalizedValue });

            setStats(prev => (prev
                ? {
                    ...prev,
                    callsign: updated.callsign,
                    preferred_name: updated.preferred_name ?? null,
                    location: updated.location ?? null,
                    display_name: updated.display_name ?? prev.display_name ?? null,
                    location_display: updated.location_display ?? prev.location_display ?? null
                }
                : prev));

            onCallsignRenamed?.(callsign, updated.callsign);
            await onStationUpdated?.(updated.callsign);
            void fetchStats(updated.callsign);
        } catch (err) {
            throw new Error(resolveErrorMessage(err, 'Failed to update callsign'));
        }
    };

    const handlePreferredNameSave = async (nextValue: string) => {
        const trimmedValue = nextValue.trim();

        try {
            const updated = await updateStation(callsign, { preferred_name: trimmedValue || null });

            setStats(prev => (prev
                ? {
                    ...prev,
                    preferred_name: updated.preferred_name ?? null,
                    display_name: updated.display_name ?? prev.display_name ?? null
                }
                : prev));

            await onStationUpdated?.(callsign);
        } catch (err) {
            throw new Error(resolveErrorMessage(err, 'Failed to update name'));
        }
    };

    const handleLocationSave = async (nextValue: string) => {
        const trimmedValue = nextValue.trim();

        try {
            const updated = await updateStation(callsign, { location: trimmedValue || null });

            setStats(prev => (prev
                ? {
                    ...prev,
                    location: updated.location ?? null,
                    location_display: updated.location_display ?? prev.location_display ?? null
                }
                : prev));

            await onStationUpdated?.(callsign);
        } catch (err) {
            throw new Error(resolveErrorMessage(err, 'Failed to update location'));
        }
    };

    const handleSyncQrz = async () => {
        if (!stats?.qrz_enabled || isSyncingQrz)
            return;

        try {
            setIsSyncingQrz(true);
            setSyncError(null);
            const refreshed = await refreshStation(callsign);
            setStats(prev => (prev
                ? {
                    ...prev,
                    preferred_name: refreshed.preferred_name ?? prev.preferred_name ?? null,
                    location: refreshed.location ?? prev.location ?? null,
                    display_name: refreshed.display_name ?? prev.display_name ?? null,
                    location_display: refreshed.location_display ?? prev.location_display ?? null
                }
                : prev));
            await fetchStats(callsign);
            await onStationUpdated?.();
        } catch (err) {
            setSyncError(resolveErrorMessage(err, 'Failed to refresh QRZ data'));
        } finally {
            setTimeout(() => { setIsSyncingQrz(false); }, 1000);
        }
    };

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className='fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm transition-opacity'
                    onClick={onClose}
                />
            )}

            {/* Panel */}
            <div
                className={`fixed right-0 top-0 z-50 h-full w-full max-w-md transform overflow-y-auto border-l border-slate-800 bg-slate-900 shadow-2xl transition-transform duration-300 ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Header */}
                <div className='sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur-xl'>
                    <div className='relative p-6'>
                        <div className='flex flex-col pr-12'>
                            <h2 className='flex flex-wrap items-center gap-2 text-xl font-semibold text-slate-100'>
                                Station History
                            </h2>
                            <div className='mt-3 w-full'>
                                <EditableText
                                    value={callsign}
                                    onSave={handleCallsignSave}
                                    placeholder='Edit callsign'
                                    className='w-full'
                                    disabled={!isAdmin}
                                    textClassName={`flex w-full items-center font-mono text-lg uppercase tracking-wide text-sky-400${isAdmin ? ' hover:text-sky-200' : ''}`}
                                    transformDraft={draft => draft.toUpperCase()}
                                    formatSubmittedValue={draft => draft.toUpperCase()}
                                    inputProps={{
                                        maxLength: 6,
                                        className: 'font-mono uppercase tracking-wide text-sky-400'
                                    }}
                                    renderDisplayContent={({ displayValue, placeholder }) => (
                                        <div className='w-full'>
                                            {displayValue ? (
                                                <span className='font-mono uppercase tracking-wide text-sky-400'>{displayValue}</span>
                                            ) : (
                                                <span className='font-mono uppercase tracking-wide italic text-slate-500'>{placeholder}</span>
                                            )}
                                        </div>
                                    )}
                                />
                            </div>
                            <div className='mt-3 w-full'>
                                <EditableText
                                    value={stats?.display_name ?? null}
                                    displayValue={headerName}
                                    onSave={handlePreferredNameSave}
                                    placeholder='Add name'
                                    className='w-full'
                                    textClassName='flex w-full items-center gap-2 text-left text-base text-slate-200 hover:text-slate-100'
                                    renderDisplayContent={({ displayValue, placeholder }) => (
                                        <div className='flex w-full items-center gap-2'>
                                            <div className='flex items-center gap-2'>
                                                <span className={`break-words ${displayValue ? '' : 'italic text-slate-500'}`}>
                                                    {displayValue || placeholder}
                                                </span>
                                                {headerNameFromQrz && displayValue && (
                                                    <span className='rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-sky-100/55'>
                                                        QRZ
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                />
                            </div>
                            <div className='mt-2 w-full'>
                                <EditableText
                                    value={stats?.location_display ?? null}
                                    displayValue={headerLocation}
                                    onSave={handleLocationSave}
                                    placeholder='Add location'
                                    className='w-full'
                                    textClassName='flex w-full items-center gap-2 text-left text-sm text-slate-400 hover:text-slate-200'
                                    renderDisplayContent={({ displayValue, placeholder }) => (
                                        <div className='flex w-full items-center gap-2'>
                                            <span className={`break-words ${displayValue ? 'text-slate-300' : 'italic text-slate-500'}`}>
                                                {displayValue || placeholder}
                                            </span>
                                            {headerLocationFromQrz && displayValue && (
                                                <span className='rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-sky-100/55'>
                                                    QRZ
                                                </span>
                                            )}
                                        </div>
                                    )}
                                />
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className='absolute right-6 top-6 rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100'
                            aria-label='Close panel'
                        >
                            <FaTimes size={20} />
                        </button>
                    </div>
                </div>

                {stats?.qrz_enabled && (
                    <div className='p-6 flex justify-center border-b border-slate-800'>
                        <button
                            onClick={() => { void handleSyncQrz(); }}
                            disabled={isSyncingQrz}
                            className='w-fit rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-60'
                        >
                            {isSyncingQrz ? 'Syncing…' : 'Sync QRZ'}
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className='p-6'>
                    {syncError && (
                        <div className='mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300'>
                            {syncError}
                        </div>
                    )}
                    {isLoading && (
                        <div className='flex items-center justify-center py-12'>
                            <svg
                                className='h-8 w-8 animate-spin text-sky-400'
                                xmlns='http://www.w3.org/2000/svg'
                                fill='none'
                                viewBox='0 0 24 24'
                            >
                                <circle
                                    className='opacity-25'
                                    cx='12'
                                    cy='12'
                                    r='10'
                                    stroke='currentColor'
                                    strokeWidth='4'
                                >
                                </circle>
                                <path
                                    className='opacity-75'
                                    fill='currentColor'
                                    d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                                >
                                </path>
                            </svg>
                        </div>
                    )}

                    {error && (
                        <div className='rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400'>
                            {error}
                        </div>
                    )}

                    {!isLoading && !error && stats && (
                        <>
                            {/* Summary Stats */}
                            <div className='grid grid-cols-2 gap-4'>
                                <div className='rounded-lg border border-slate-800 bg-slate-950/50 p-4'>
                                    <div className='text-2xl font-bold text-slate-100'>
                                        {stats.total_checkins}
                                    </div>
                                    <div className='mt-1 text-sm text-slate-400'>
                                        Total Check-ins
                                    </div>
                                </div>

                                <div className='rounded-lg border border-slate-800 bg-slate-950/50 p-4'>
                                    <div className='text-2xl font-bold text-slate-100'>
                                        {stats.recent.length}
                                    </div>
                                    <div className='mt-1 text-sm text-slate-400'>Recent Nets</div>
                                </div>
                            </div>

                            {/* First & Last Seen */}
                            <div className='mt-6 space-y-3'>
                                {stats.first_seen_at && (
                                    <div className='flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-4'>
                                        <div className='text-sm text-slate-400'>First Seen</div>
                                        <div className='font-mono text-sm text-slate-200'>
                                            {formatDateTime(stats.first_seen_at)}
                                        </div>
                                    </div>
                                )}

                                {stats.last_seen_at && (
                                    <div className='flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-4'>
                                        <div className='text-sm text-slate-400'>Last Seen</div>
                                        <div className='font-mono text-sm text-slate-200'>
                                            {formatDateTime(stats.last_seen_at)}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Recent Check-ins */}
                            {stats.recent.length > 0 && (
                                <div className='mt-6'>
                                    <h3 className='mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400'>
                                        Recent Check-ins
                                    </h3>
                                    <div className='space-y-2'>
                                        {stats.recent.map(checkin => (
                                            <div
                                                key={checkin.checkin_id}
                                                className='rounded-lg border border-slate-800 bg-slate-950/50 p-4'
                                            >
                                                <div className='flex items-center justify-between'>
                                                    <div className='flex items-center gap-3'>
                                                        {mobilityEnabled && getMobilityIcon(checkin.mobility)}
                                                        <button
                                                            onClick={() => {
                                                                onClose();
                                                                void navigate(`/nets/${checkin.net_id}`);
                                                            }}
                                                            className='font-mono text-sm text-slate-300 transition hover:text-sky-400 cursor-pointer underline decoration-transparent hover:decoration-sky-400'
                                                        >
                                                            Net #
                                                            {checkin.net_id}
                                                        </button>
                                                    </div>
                                                    <div className='flex items-center gap-2'>
                                                        {checkin.staying && (
                                                            <span className='rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400'>
                                                                Stayed
                                                            </span>
                                                        )}
                                                        <div className='font-mono text-sm text-slate-400'>
                                                            {formatTime(checkin.time_entered)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className='mt-2 text-xs text-slate-500'>
                                                    {formatDate(checkin.time_entered)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {stats.recent.length === 0 && (
                                <div className='mt-6 rounded-lg border border-slate-800 bg-slate-950/50 p-8 text-center text-sm text-slate-400'>
                                    No recent check-ins to display
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}