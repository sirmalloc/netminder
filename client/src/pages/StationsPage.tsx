import {
    useCallback,
    useEffect,
    useRef,
    useState
} from 'react';
import {
    FaSearch,
    FaTrash
} from 'react-icons/fa';

import type { StationListItem } from '../api';
import {
    deleteStation as deleteStationApi,
    fetchStations as fetchStationsList,
    updateStation as updateStationApi
} from '../api';
import { EditableName } from '../components/EditableName';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { StationHistoryPanel } from '../components/StationHistoryPanel';
import { useAuth } from '../contexts/AuthContext';
import { resolveErrorMessage } from '../utils/errors';

export function StationsPage() {
    const { user } = useAuth();
    const isAdmin = Boolean(user?.is_admin);
    const [stations, setStations] = useState<StationListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(0);
    const pageSize = 10;
    const isFetchingRef = useRef(false);
    const [totalStations, setTotalStations] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [hasExactTotal, setHasExactTotal] = useState(false);

    // Station history panel
    const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
    const [historyCallsign, setHistoryCallsign] = useState('');

    // Delete confirmation modal
    const [stationToDelete, setStationToDelete] = useState<StationListItem | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchStations = useCallback(async () => {
        if (isFetchingRef.current) {
            return;
        }

        try {
            isFetchingRef.current = true;
            setLoading(true);
            setError(null);
            const trimmedQuery = searchQuery.trim();
            const response = await fetchStationsList({
                limit: pageSize,
                offset: currentPage * pageSize,
                ...(trimmedQuery ? { query: trimmedQuery } : {})
            });

            const {
                stations: fetchedStations,
                meta
            } = response;

            if (fetchedStations.length === 0 && currentPage > 0) {
                isFetchingRef.current = false;
                setLoading(false);
                setCurrentPage(page => Math.max(0, page - 1));
                return;
            }

            const metaHasTotal = Number.isFinite(meta.total);
            const total = metaHasTotal ? meta.total : (currentPage * pageSize + fetchedStations.length);
            const nextPageAvailable = metaHasTotal
                ? meta.hasMore
                : ((currentPage * pageSize) + fetchedStations.length < total);

            setStations(fetchedStations);
            setTotalStations(total);
            setHasNextPage(nextPageAvailable);
            setHasExactTotal(metaHasTotal);
        } catch (err) {
            console.error('Error fetching stations:', err);
            setError(resolveErrorMessage(err, 'Failed to fetch stations'));
        } finally {
            setLoading(false);
            isFetchingRef.current = false;
        }
    }, [currentPage, pageSize, searchQuery]);

    useEffect(() => {
        void fetchStations();
    }, [fetchStations]);

    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString)
            return 'Never';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const handleStationClick = (callsign: string) => {
        setHistoryCallsign(callsign);
        setHistoryPanelOpen(true);
    };

    const handleDeleteStation = async () => {
        if (!stationToDelete)
            return;

        try {
            setIsDeleting(true);
            await deleteStationApi(stationToDelete.callsign);

            // Refresh the stations list
            await fetchStations();
            setStationToDelete(null);
        } catch (err) {
            console.error('Error deleting station:', err);
            setError(resolveErrorMessage(err, 'Failed to delete station'));
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSaveStationName = useCallback(async (callsign: string, nextValue: string) => {
        const trimmed = nextValue.trim();
        await updateStationApi(callsign, { preferred_name: trimmed || null });
        await fetchStations();
    }, [fetchStations]);

    const handleSaveStationLocation = useCallback(async (callsign: string, nextValue: string) => {
        const trimmed = nextValue.trim();
        await updateStationApi(callsign, { location: trimmed || null });
        await fetchStations();
    }, [fetchStations]);

    const handleCallsignRenamed = useCallback((previousCallsign: string, newCallsign: string) => {
        void fetchStations();
        setHistoryCallsign(newCallsign);
    }, [fetchStations]);

    const pageStart = stations.length > 0 ? currentPage * pageSize + 1 : 0;
    const pageEnd = stations.length > 0 ? currentPage * pageSize + stations.length : 0;
    const totalDisplay = hasExactTotal ? totalStations : (hasNextPage ? `${pageEnd}+` : totalStations);

    // Reset to first page when search query changes
    useEffect(() => {
        setCurrentPage(0);
    }, [searchQuery]);

    return (
        <div className='min-h-screen bg-slate-950'>
            <PageHeader />

            <main className='mx-auto px-6 py-8'>
                <div className='mb-8'>
                    <h1 className='text-3xl font-semibold tracking-tight text-slate-100'>Stations</h1>
                    <p className='mt-2 text-slate-400'>View and manage station records</p>
                </div>

                {/* Search bar */}
                <div className='mb-6'>
                    <div className='relative'>
                        <div className='pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3'>
                            <FaSearch className='h-4 w-4 text-slate-400' />
                        </div>
                        <input
                            type='text'
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); }}
                            placeholder='Search by callsign or name...'
                            className='block w-full rounded-lg border border-slate-700 bg-slate-900 py-3 pl-10 pr-3 text-sm text-slate-100 placeholder-slate-500 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50'
                        />
                    </div>
                </div>

                {/* Error Display */}
                {error && (
                    <div className='mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4'>
                        <p className='text-sm text-red-300'>{error}</p>
                    </div>
                )}

                {/* Stations table */}
                {loading ? (
                    <div className='flex items-center justify-center rounded-2xl border border-slate-800/70 bg-slate-900/70 p-12'>
                        <div className='text-center'>
                            <div className='mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-sky-400' />
                            <p className='mt-4 text-sm text-slate-400'>Loading stations...</p>
                        </div>
                    </div>
                ) : stations.length === 0 ? (
                    <div className='rounded-2xl border border-slate-800/70 bg-slate-900/70 p-12 text-center'>
                        <h3 className='text-lg font-medium text-slate-300'>
                            {searchQuery ? 'No stations found' : 'No stations yet'}
                        </h3>
                        <p className='mt-2 text-sm text-slate-400'>
                            {searchQuery
                                ? 'Try a different search term'
                                : 'Stations will appear here after check-ins'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className='overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80'>
                            <table className='w-full'>
                                <thead className='border-b border-slate-800 bg-slate-950/50'>
                                    <tr>
                                        <th className='px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400'>
                                            Callsign
                                        </th>
                                        <th className='px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400'>
                                            Name
                                        </th>
                                        <th className='px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400'>
                                            Total Check-ins
                                        </th>
                                        <th className='px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400'>
                                            Last Seen
                                        </th>
                                        <th className='px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400'>
                                            First Seen
                                        </th>
                                        <th className='px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400'>
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stations.map((station) => {
                                        const isActiveRow = historyPanelOpen
                                            && historyCallsign.trim().toUpperCase() === station.callsign.trim().toUpperCase();

                                        return (
                                            <tr
                                                key={station.callsign}
                                                className={`border-t border-slate-800 transition ${
                                                    isActiveRow
                                                        ? 'bg-sky-500/10 ring-1 ring-inset ring-sky-500/40'
                                                        : 'hover:bg-slate-800/30'
                                                }`}
                                            >
                                                <td
                                                    onClick={() => { handleStationClick(station.callsign); }}
                                                    className='cursor-pointer whitespace-nowrap px-4 py-3 font-mono text-sm font-semibold text-sky-400'
                                                >
                                                    {station.callsign}
                                                </td>
                                                <td className='px-4 py-3 text-sm'>
                                                    <div className='flex flex-col gap-1'>
                                                        <EditableName
                                                            value={station.display_name ?? station.preferred_name ?? null}
                                                            onSave={newValue => handleSaveStationName(station.callsign, newValue)}
                                                            placeholder='Not set'
                                                        />
                                                        <EditableName
                                                            value={station.location_display ?? station.location ?? null}
                                                            onSave={newValue => handleSaveStationLocation(station.callsign, newValue)}
                                                            placeholder='Add location'
                                                            textClassName='text-xs text-slate-400 hover:text-slate-100'
                                                        />
                                                    </div>
                                                </td>
                                                <td
                                                    onClick={() => { handleStationClick(station.callsign); }}
                                                    className='cursor-pointer whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-300'
                                                >
                                                    {station.total_checkins}
                                                </td>
                                                <td
                                                    onClick={() => { handleStationClick(station.callsign); }}
                                                    className='cursor-pointer whitespace-nowrap px-4 py-3 text-sm text-slate-400'
                                                >
                                                    {formatDate(station.last_seen_at)}
                                                </td>
                                                <td
                                                    onClick={() => { handleStationClick(station.callsign); }}
                                                    className='cursor-pointer whitespace-nowrap px-4 py-3 text-sm text-slate-400'
                                                >
                                                    {formatDate(station.first_seen_at)}
                                                </td>
                                                <td className='whitespace-nowrap px-4 py-3 text-sm'>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (isAdmin)
                                                                setStationToDelete(station);
                                                        }}
                                                        className={isAdmin
                                                            ? 'rounded p-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/30 transition'
                                                            : 'rounded p-1.5 text-slate-600 opacity-50 cursor-not-allowed'}
                                                        title={isAdmin ? 'Delete station' : 'Only administrators can delete stations'}
                                                        aria-label={isAdmin ? 'Delete station' : 'Delete station (only administrators can delete stations)'}
                                                        aria-disabled={!isAdmin}
                                                    >
                                                        <FaTrash size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div className='mt-4 flex items-center justify-between'>
                            <div className='text-sm text-slate-400'>
                                Showing
                                {' '}
                                {pageStart}
                                {' '}
                                to
                                {' '}
                                {pageEnd}
                                {' '}
                                of
                                {' '}
                                {totalDisplay}
                            </div>
                            <div className='flex gap-2'>
                                <button
                                    onClick={() => { setCurrentPage(p => Math.max(0, p - 1)); }}
                                    disabled={currentPage === 0}
                                    className='rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50'
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => { setCurrentPage(p => (hasNextPage ? p + 1 : p)); }}
                                    disabled={!hasNextPage}
                                    className='rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50'
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </main>

            {/* Station history panel */}
            <StationHistoryPanel
                callsign={historyCallsign}
                isOpen={historyPanelOpen}
                onClose={() => { setHistoryPanelOpen(false); }}
                onCallsignRenamed={handleCallsignRenamed}
                onStationUpdated={fetchStations}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={stationToDelete !== null}
                onClose={() => { setStationToDelete(null); }}
                title='Delete Station'
            >
                <div className='space-y-4'>
                    <p className='text-sm text-slate-300'>
                        Are you sure you want to delete the station
                        {' '}
                        <strong className='font-mono text-sky-400'>{stationToDelete?.callsign}</strong>
                        {stationToDelete?.preferred_name && (
                            <>
                                {' '}
                                (
                                {stationToDelete.preferred_name}
                                )
                            </>
                        )}
                        ? This will also delete all
                        {' '}
                        <strong>{stationToDelete?.total_checkins ?? 0}</strong>
                        {' '}
                        check-in
                        {(stationToDelete?.total_checkins ?? 0) !== 1 ? 's' : ''}
                        {' '}
                        associated with this station.
                    </p>
                    <div className='rounded-lg border border-amber-900/50 bg-amber-950/30 p-3'>
                        <div className='flex gap-2'>
                            <svg
                                className='h-5 w-5 flex-shrink-0 text-amber-500'
                                fill='none'
                                stroke='currentColor'
                                viewBox='0 0 24 24'
                            >
                                <path
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                    strokeWidth={2}
                                    d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
                                />
                            </svg>
                            <div className='text-xs text-amber-200'>
                                <strong>Warning:</strong>
                                {' '}
                                This action cannot be undone.
                            </div>
                        </div>
                    </div>
                    <div className='flex gap-3'>
                        <button
                            onClick={() => { void handleDeleteStation(); }}
                            disabled={isDeleting}
                            className='flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50'
                        >
                            {isDeleting ? 'Deleting...' : 'Delete Station'}
                        </button>
                        <button
                            onClick={() => { setStationToDelete(null); }}
                            disabled={isDeleting}
                            className='flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50'
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}