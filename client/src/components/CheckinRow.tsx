import type {
    KeyboardEvent,
    MouseEvent
} from 'react';
import {
    FaCar,
    FaHome,
    FaSuitcase,
    FaTrash
} from 'react-icons/fa';
import { VscInfo } from 'react-icons/vsc';

import type {
    Checkin,
    MobilityType
} from '../api';
import {
    deleteCheckin as deleteCheckinApi,
    updateCheckin as updateCheckinApi,
    updateStation
} from '../api';
import { useAppConfig } from '../contexts/AppConfigContext';

import {
    EditableName,
    EditableText
} from './EditableName';

interface CheckinRowProps {
    checkin: Checkin;
    orderNumber: number;
    isNew?: boolean;
    isReturning?: boolean;
    onUpdate: (updated: Checkin) => void;
    onDelete: (checkinId: number) => void;
    onCallsignClick?: (callsign: string) => void;
    onCallsignRenamed?: (previousCallsign: string, updatedCallsign: string) => void;
    isActive?: boolean;
    onSelect?: (checkinId: number) => void;
    isSelected?: boolean;
}

export function CheckinRow({
    checkin,
    orderNumber,
    isNew,
    isReturning,
    onUpdate,
    onDelete,
    onCallsignClick,
    onCallsignRenamed,
    isActive,
    onSelect,
    isSelected
}: CheckinRowProps) {
    const { mobilityEnabled } = useAppConfig();
    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };

    const handleNameSave = async (nextValue: string) => {
        const trimmedValue = nextValue.trim();

        try {
            const updatedStation = await updateStation(checkin.callsign, { preferred_name: trimmedValue || null });
            const fallbackDisplay = trimmedValue.length > 0 ? trimmedValue : null;
            onUpdate({
                ...checkin,
                display_name: updatedStation.display_name ?? fallbackDisplay
            });
        } catch (error) {
            console.error('Error updating station name:', error);
            throw error instanceof Error ? error : new Error('Failed to update station name');
        }
    };

    const handleLocationSave = async (nextValue: string) => {
        const trimmedValue = nextValue.trim();

        try {
            const updatedStation = await updateStation(checkin.callsign, { location: trimmedValue || null });
            const fallbackLocation = trimmedValue.length > 0 ? trimmedValue : null;
            onUpdate({
                ...checkin,
                location_display: updatedStation.location_display ?? fallbackLocation
            });
        } catch (error) {
            console.error('Error updating station location:', error);
            throw error instanceof Error ? error : new Error('Failed to update station location');
        }
    };

    const handleCallsignSave = async (nextValue: string) => {
        const normalizedValue = nextValue.trim().toUpperCase();

        if (!normalizedValue) {
            throw new Error('Callsign is required');
        }

        if (normalizedValue === checkin.callsign.toUpperCase())
            return;

        const previousCallsign = checkin.callsign;

        try {
            const updated = await updateCheckinApi(checkin.id, { callsign: normalizedValue });
            onUpdate(updated);
            onCallsignRenamed?.(previousCallsign, updated.callsign);
        } catch (error) {
            console.error('Error correcting check-in callsign:', error);
            throw error instanceof Error ? error : new Error('Failed to correct callsign');
        }
    };

    const handleTopicSave = async (nextValue: string) => {
        const trimmedValue = nextValue.trim();
        const normalizedValue = trimmedValue || null;

        if (normalizedValue === (checkin.topic_answer ?? null))
            return;

        try {
            const updated = await updateCheckinApi(checkin.id, { topic_answer: normalizedValue });
            onUpdate(updated);
        } catch (error) {
            console.error('Error updating comments:', error);
            throw error instanceof Error ? error : new Error('Failed to update comments');
        }
    };

    const handleMobilityChange = async (mobility: MobilityType) => {
        if (mobility === checkin.mobility)
            return;

        try {
            const updated = await updateCheckinApi(checkin.id, { mobility });
            onUpdate(updated);
        } catch (error) {
            console.error('Error updating mobility:', error);
        }
    };

    const handleStayingToggle = async () => {
        try {
            const newStaying = !checkin.staying;
            const updated = await updateCheckinApi(checkin.id, { staying: newStaying });
            onUpdate(updated);
        } catch (error) {
            console.error('Error updating staying:', error);
        }
    };

    const handleCalledBackToggle = async () => {
        try {
            const newCalledBack = !checkin.called_back;
            const updated = await updateCheckinApi(checkin.id, { called_back: newCalledBack });
            onUpdate(updated);
        } catch (error) {
            console.error('Error updating called back:', error);
        }
    };

    const handleDelete = async () => {
        if (!confirm(`Delete check-in for ${checkin.callsign}?`))
            return;

        try {
            await deleteCheckinApi(checkin.id);
            onDelete(checkin.id);
        } catch (error) {
            console.error('Error deleting checkin:', error);
        }
    };

    const handleRowClick = (event: MouseEvent<HTMLTableRowElement>) => {
        if (event.defaultPrevented || !onSelect)
            return;

        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, textarea, select, [role="button"]'))
            return;

        onSelect(checkin.id);
    };

    const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
        if (!onSelect)
            return;

        if (event.defaultPrevented)
            return;

        const target = event.target as HTMLElement | null;
        if (target?.closest('input, textarea, button, [role="button"]'))
            return;

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(checkin.id);
        }
    };

    const rowClasses = isSelected
        ? 'border-t border-b border-fuchsia-500/40 bg-fuchsia-600/20 ring-2 ring-inset ring-fuchsia-400/70 shadow-[0_0_0_1px_rgba(192,38,211,0.45)]'
        : isActive
            ? 'border-t border-slate-800 bg-sky-500/10 ring-1 ring-inset ring-sky-500/40'
            : checkin.called_back
                ? 'border-t border-slate-800 bg-amber-500/5 ring-2 ring-inset ring-amber-500/30'
                : 'border-t border-slate-800 hover:bg-slate-800/30';

    return (
        <tr
            onClick={handleRowClick}
            onKeyDown={handleRowKeyDown}
            className={`transition ${
                onSelect
                    ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/40'
                    : ''
            } ${rowClasses}`}
            tabIndex={onSelect ? 0 : undefined}
            aria-selected={onSelect ? !!isSelected : undefined}
        >
            {/* Order */}
            <td className='whitespace-nowrap px-4 py-3 text-sm font-mono font-semibold text-slate-400'>
                #
                {orderNumber}
            </td>

            {/* Time */}
            <td className='whitespace-nowrap px-4 py-3 text-sm text-slate-400'>
                {formatTime(checkin.time_entered)}
            </td>

            {/* Callsign with badge */}
            <td className='whitespace-nowrap px-4 py-3'>
                <div className='flex items-center justify-between gap-3'>
                    <div className='flex items-center gap-2'>
                        <EditableText
                            value={checkin.callsign}
                            onSave={handleCallsignSave}
                            placeholder='Edit callsign'
                            className='min-w-[6ch]'
                            textClassName='font-mono text-sm font-semibold uppercase tracking-wide text-slate-100 hover:text-sky-200'
                            transformDraft={draft => draft.toUpperCase()}
                            formatSubmittedValue={draft => draft.toUpperCase()}
                            inputProps={{
                                maxLength: 6,
                                className: 'font-mono uppercase tracking-wide text-sky-200',
                                style: { width: '9ch' }
                            }}
                            renderDisplayContent={({ displayValue, placeholder }) => (
                                displayValue ? (
                                    <span className='font-mono uppercase tracking-wide'>{displayValue}</span>
                                ) : (
                                    <span className='font-mono italic text-slate-500'>{placeholder}</span>
                                )
                            )}
                        />
                        {isNew && (
                            <span className='rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400'>
                                New
                            </span>
                        )}
                        {isReturning && !isNew && (
                            <span className='rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-medium text-sky-400'>
                                Returning
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => { onCallsignClick?.(checkin.callsign); }}
                        className='inline-flex items-center text-slate-400 transition hover:text-sky-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-sky-500/40'
                        title='View station history'
                        aria-label={`View history for ${checkin.callsign}`}
                    >
                        <VscInfo size={24} />
                    </button>
                </div>
            </td>

            {/* Name & Location (editable) */}
            <td className='px-4 py-3'>
                <div className='flex flex-col gap-1'>
                    <EditableName
                        value={checkin.display_name}
                        onSave={handleNameSave}
                    />
                    <EditableName
                        value={checkin.location_display}
                        onSave={handleLocationSave}
                        placeholder='Add location'
                        textClassName='text-xs text-slate-400 hover:text-slate-100'
                    />
                </div>
            </td>

            {/* Mobility */}
            {mobilityEnabled && (
                <td className='px-4 py-3'>
                    <div className='flex gap-1'>
                        <button
                            onClick={() => { void handleMobilityChange('neither'); }}
                            className={`rounded-lg p-2 transition ${
                                checkin.mobility === 'neither'
                                    ? 'bg-sky-500/20 text-sky-400'
                                    : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                            }`}
                            title='Fixed station'
                        >
                            <FaHome size={16} />
                        </button>
                        <button
                            onClick={() => { void handleMobilityChange('mobile'); }}
                            className={`rounded-lg p-2 transition ${
                                checkin.mobility === 'mobile'
                                    ? 'bg-sky-500/20 text-sky-400'
                                    : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                            }`}
                            title='Mobile'
                        >
                            <FaCar size={16} />
                        </button>
                        <button
                            onClick={() => { void handleMobilityChange('portable'); }}
                            className={`rounded-lg p-2 transition ${
                                checkin.mobility === 'portable'
                                    ? 'bg-sky-500/20 text-sky-400'
                                    : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                            }`}
                            title='Portable'
                        >
                            <FaSuitcase size={16} />
                        </button>
                    </div>
                </td>
            )}

            {/* Staying */}
            <td className='px-4 py-3'>
                <button
                    onClick={() => { void handleStayingToggle(); }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        checkin.staying
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-orange-500/20 text-orange-400'
                    }`}
                >
                    {checkin.staying ? 'Staying' : 'In & Out'}
                </button>
            </td>

            {/* Comments (editable) */}
            <td className='px-4 py-3'>
                <EditableText
                    value={checkin.topic_answer ?? null}
                    onSave={handleTopicSave}
                    placeholder='Add comment'
                    className='w-full'
                    textClassName='w-full text-left text-sm text-slate-300 hover:text-slate-100'
                />
            </td>

            {/* Called Back */}
            <td className='px-4 py-3'>
                <button
                    onClick={() => { void handleCalledBackToggle(); }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        checkin.called_back
                            ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                >
                    {checkin.called_back ? 'Called Back' : 'Not Called'}
                </button>
            </td>

            {/* Actions */}
            <td className='px-4 py-3'>
                <button
                    onClick={() => { void handleDelete(); }}
                    className='rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400'
                    title='Delete check-in'
                >
                    <FaTrash size={14} />
                </button>
            </td>
        </tr>
    );
}