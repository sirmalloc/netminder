import {
    useEffect,
    useRef,
    useState
} from 'react';
import {
    FaCar,
    FaHome,
    FaSuitcase
} from 'react-icons/fa';
import { PiKeyReturnThin } from 'react-icons/pi';

import type {
    MobilityType,
    Station,
    StationFieldSource,
    StationListItem,
    StationLookupResponse
} from '../api';
import {
    fetchStationLookup,
    fetchStations
} from '../api';
import { useAppConfig } from '../contexts/AppConfigContext';
import { parseDisplayName } from '../utils/displayName';

interface CallsignInputProps {
    onSubmit: (payload: {
        callsign: string;
        mobility: MobilityType;
        staying: boolean;
        topicAnswer?: string;
        preferredName?: string;
        location?: string;
    }) => Promise<void>;
    disabled?: boolean;
    autoFocus?: boolean;
}

interface StationSuggestion extends StationListItem {
    prior_count?: number;
}

interface FieldState {
    value: string;
    source: StationFieldSource;
    qrzBaseline: string | null;
    dirty: boolean;
}

const createEmptyFieldState = (): FieldState => ({
    value: '',
    source: 'none',
    qrzBaseline: null,
    dirty: false
});

const toFieldState = (
    value: string | null | undefined,
    source: StationFieldSource,
    qrzBaseline: string | null
): FieldState => {
    const normalizedValue = value ?? '';
    const trimmed = normalizedValue.trim();
    const effectiveSource: StationFieldSource = trimmed.length === 0 ? 'none' : source;
    return {
        value: normalizedValue,
        source: effectiveSource,
        qrzBaseline,
        dirty: false
    };
};

const needsLookup = (station: StationListItem): boolean => {
    const hasName = Boolean((station.display_name ?? '').trim() || (station.preferred_name ?? '').trim());
    const hasLocation = Boolean((station.location_display ?? '').trim() || (station.location ?? '').trim());
    return !hasName || !hasLocation;
};

export function CallsignInput({ onSubmit, disabled, autoFocus }: CallsignInputProps) {
    const [value, setValue] = useState('');
    const [preferredNameField, setPreferredNameField] = useState<FieldState>(createEmptyFieldState);
    const [locationField, setLocationField] = useState<FieldState>(createEmptyFieldState);
    const [topicAnswer, setTopicAnswer] = useState('');
    const [suggestions, setSuggestions] = useState<StationSuggestion[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);
    const [isLookupInFlight, setIsLookupInFlight] = useState(false);
    const { mobilityEnabled } = useAppConfig();
    const [mobility, setMobility] = useState<MobilityType>('neither');
    const [staying, setStaying] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const suppressSearchRef = useRef(false);
    const selectionInProgressRef = useRef(false);
    const lastLookupCallsignRef = useRef<string | null>(null);
    const appliedStationCallsignRef = useRef<string | null>(null);
    const currentCallsignRef = useRef('');
    currentCallsignRef.current = value.trim().toUpperCase();

    useEffect(() => {
        if (autoFocus) {
            inputRef.current?.focus();
        }
    }, [autoFocus]);

    // Debounced search
    useEffect(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        if (suppressSearchRef.current) {
            suppressSearchRef.current = false;
            return;
        }

        if (value.length < 2) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        timeoutRef.current = setTimeout(() => {
            void (async () => {
                try {
                    setIsLoading(true);
                    const response = await fetchStations({
                        query: value,
                        limit: 10
                    });
                    setSuggestions(response.stations);
                    const shouldShow = response.stations.length > 0
                        && document.activeElement === inputRef.current;
                    setShowDropdown(shouldShow);
                } catch (error) {
                    console.error('Error fetching suggestions:', error);
                    setSuggestions([]);
                    setShowDropdown(false);
                } finally {
                    setIsLoading(false);
                }
            })();
        }, 300);

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [value]);

    // Click outside to close dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                dropdownRef.current
                && !dropdownRef.current.contains(event.target as Node)
                && inputRef.current
                && !inputRef.current.contains(event.target as Node)
            ) {
                setShowDropdown(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => { document.removeEventListener('mousedown', handleClickOutside); };
    }, []);

    useEffect(() => {
        function handleShortcuts(event: KeyboardEvent) {
            if (disabled)
                return;

            if (!(event.ctrlKey || event.metaKey))
                return;

            const key = event.key.toLowerCase();

            if (key === 's') {
                event.preventDefault();
                setStaying(prev => !prev);
                inputRef.current?.focus();
            } else if (key === 'm') {
                event.preventDefault();
                if (!mobilityEnabled)
                    return;
                setMobility((prev) => {
                    const order: MobilityType[] = ['neither', 'mobile', 'portable'];
                    const currentIndex = order.indexOf(prev);
                    const nextIndex = (currentIndex + 1) % order.length;
                    return order[nextIndex];
                });
                inputRef.current?.focus();
            } else if (key === 'n') {
                event.preventDefault();
                suppressSearchRef.current = true;
                setValue('');
                setPreferredNameField(createEmptyFieldState());
                setLocationField(createEmptyFieldState());
                lastLookupCallsignRef.current = null;
                appliedStationCallsignRef.current = null;
                setTopicAnswer('');
                setStaying(true);
                setMobility('neither');
                setSuggestions([]);
                setShowDropdown(false);
                setSelectedIndex(-1);
                inputRef.current?.focus();
            }
        }

        window.addEventListener('keydown', handleShortcuts);
        return () => { window.removeEventListener('keydown', handleShortcuts); };
    }, [disabled, mobilityEnabled]);

    const applyStationDetails = (station: Station | StationListItem) => {
        const { text: stationName, fromQrz: stationNameFromQrz } = parseDisplayName(
            station.display_name ?? station.preferred_name ?? ''
        );
        const parsedLocationInfo = parseDisplayName(station.location_display ?? null);
        const parsedLocation = parsedLocationInfo.text.trim();
        const fallbackLocation = station.location?.trim() ?? '';
        const locationValue = parsedLocation.length > 0 ? parsedLocation : fallbackLocation;
        const locationFromQrz = parsedLocation.length > 0 ? parsedLocationInfo.fromQrz : false;

        const trimmedName = stationName.trim();
        setPreferredNameField(
            toFieldState(
                trimmedName,
                stationNameFromQrz ? 'qrz' : 'manual',
                stationNameFromQrz ? trimmedName : null
            )
        );
        setLocationField(
            toFieldState(
                locationValue,
                locationFromQrz ? 'qrz' : 'manual',
                locationFromQrz ? locationValue : null
            )
        );

        appliedStationCallsignRef.current = station.callsign.toUpperCase();
    };

    const applyLookupResult = (details: StationLookupResponse) => {
        setPreferredNameField((previous) => {
            const baseline = details.preferred_name.qrz ?? null;
            if (previous.dirty) {
                return {
                    ...previous,
                    qrzBaseline: baseline ?? previous.qrzBaseline
                };
            }
            return toFieldState(
                details.preferred_name.value ?? '',
                details.preferred_name.source,
                baseline
            );
        });

        setLocationField((previous) => {
            const baseline = details.location.qrz ?? null;
            if (previous.dirty) {
                return {
                    ...previous,
                    qrzBaseline: baseline ?? previous.qrzBaseline
                };
            }
            return toFieldState(
                details.location.value ?? '',
                details.location.source,
                baseline
            );
        });

        appliedStationCallsignRef.current = details.callsign.toUpperCase();
    };

    const performLookup = async (callsign: string) => {
        try {
            setIsLookupInFlight(true);
            const lookup = await fetchStationLookup(callsign);
            if (currentCallsignRef.current !== callsign.trim().toUpperCase()) {
                return;
            }
            applyLookupResult(lookup);
        } catch (error) {
            console.error('Error performing callsign lookup:', error);
        } finally {
            setIsLookupInFlight(false);
            lastLookupCallsignRef.current = callsign;
        }
    };

    const handleSubmit = async (callsign: string) => {
        const upperCallsign = callsign.trim().toUpperCase();
        if (!upperCallsign)
            return;

        try {
            const trimmedTopic = topicAnswer.trim() || undefined;
            const trimmedPreferredName = preferredNameField.value.trim();
            const preferredNamePayload = preferredNameField.source === 'manual'
                && trimmedPreferredName.length > 0
                ? trimmedPreferredName
                : undefined;
            const trimmedLocation = locationField.value.trim();
            const locationPayload = locationField.source === 'manual'
                && trimmedLocation.length > 0
                ? trimmedLocation
                : undefined;
            await onSubmit({
                callsign: upperCallsign,
                mobility: mobilityEnabled ? mobility : 'neither',
                staying,
                topicAnswer: trimmedTopic,
                preferredName: preferredNamePayload,
                location: locationPayload
            });
            // Only clear the inputs if submission was successful
            setValue('');
            setPreferredNameField(createEmptyFieldState());
            setLocationField(createEmptyFieldState());
            setTopicAnswer('');
            setMobility('neither');
            setStaying(true);
            setSuggestions([]);
            setShowDropdown(false);
            setSelectedIndex(-1);
            lastLookupCallsignRef.current = null;
            appliedStationCallsignRef.current = null;
            inputRef.current?.focus();
        } catch (error) {
            // Keep the input value and focus on error so user can correct it
            console.error('Error submitting callsign:', error);
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    };

    const submitCurrent = (override?: string) => {
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
            const suggestion = suggestions[selectedIndex];
            const selected = suggestion.callsign;
            selectionInProgressRef.current = true;
            applyStationDetails(suggestion);
            if (needsLookup(suggestion)) {
                void performLookup(selected.toUpperCase());
            }
            suppressSearchRef.current = true;
            setValue(selected.toUpperCase());
            setSuggestions([]);
            setShowDropdown(false);
            setSelectedIndex(-1);
            lastLookupCallsignRef.current = selected.toUpperCase();
            inputRef.current?.focus();
        } else {
            void handleSubmit(override ?? value);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitCurrent();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === 'Escape') {
            setShowDropdown(false);
            setSelectedIndex(-1);
            setSuggestions([]);
            setValue('');
            setPreferredNameField(createEmptyFieldState());
            setLocationField(createEmptyFieldState());
            appliedStationCallsignRef.current = null;
        }
    };

    const handlePreferredNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (value.trim()) {
                submitCurrent(value);
            }
        }
    };

    const handleLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (value.trim()) {
                submitCurrent(value);
            }
        }
    };

    const handleTopicAnswerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (value.trim()) {
                submitCurrent(value);
            }
        }
    };

    const renderDropdown = () => {
        if (!showDropdown || suggestions.length === 0) {
            return null;
        }

        return (
            <div
                ref={dropdownRef}
                className='absolute z-50 mt-2 max-h-80 min-w-[18rem] sm:min-w-[24rem] overflow-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl'
                role='listbox'
            >
                {suggestions.map((station, index) => {
                    const { text: suggestionName, fromQrz: suggestionFromQrz } = parseDisplayName(station.display_name ?? station.preferred_name ?? '');
                    const { text: suggestionLocationText, fromQrz: suggestionLocationFromQrz } = parseDisplayName(station.location_display ?? null);
                    const normalizedLocation = suggestionLocationText.trim() || (station.location?.trim() ?? '');
                    const showPlaceholder = suggestionName.length === 0;

                    return (
                        <button
                            key={station.callsign}
                            type='button'
                            onClick={() => {
                                suppressSearchRef.current = true;
                                selectionInProgressRef.current = true;
                                setValue(station.callsign.toUpperCase());
                                applyStationDetails(station);
                                if (needsLookup(station)) {
                                    void performLookup(station.callsign.toUpperCase());
                                }
                                setSuggestions([]);
                                setShowDropdown(false);
                                setSelectedIndex(-1);
                                lastLookupCallsignRef.current = station.callsign.toUpperCase();
                                inputRef.current?.focus();
                            }}
                            className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                                index === selectedIndex
                                    ? 'bg-sky-500/20 text-sky-100'
                                    : 'text-slate-300 hover:bg-slate-800'
                            }`}
                            role='option'
                            aria-selected={index === selectedIndex}
                        >
                            <div>
                                <div className='font-mono text-sm font-semibold text-slate-100'>
                                    {station.callsign}
                                </div>
                                <div className='flex items-center gap-2 text-xs text-slate-400'>
                                    {showPlaceholder ? (
                                        <span className='italic text-slate-500'>Name not set</span>
                                    ) : (
                                        <span>{suggestionName}</span>
                                    )}
                                    {suggestionFromQrz && (
                                        <span className='rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-sky-100/55'>
                                            QRZ
                                        </span>
                                    )}
                                </div>
                                {normalizedLocation && (
                                    <div className='mt-1 flex items-center gap-2 text-[11px] text-slate-500'>
                                        <span>{normalizedLocation}</span>
                                        {suggestionLocationFromQrz && (
                                            <span className='rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[7px] font-medium uppercase tracking-wide text-sky-100/50'>
                                                QRZ
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            {station.total_checkins > 0 && (
                                <div className='rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400'>
                                    {station.total_checkins}
                                    {' '}
                                    check-in
                                    {station.total_checkins !== 1 ? 's' : ''}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        );
    };

    return (
        <div className='space-y-3 w-full'>
            <div className='flex w-full flex-wrap items-center gap-3'>
                <div className='relative flex-shrink-0'>
                    <label htmlFor='callsign-input' className='sr-only'>Callsign</label>
                    <input
                        ref={inputRef}
                        id='callsign-input'
                        type='text'
                        value={value}
                        onChange={(e) => {
                            const next = e.target.value.toUpperCase();
                            setValue(next);
                            lastLookupCallsignRef.current = null;
                            selectionInProgressRef.current = false;
                            const trimmedNext = next.trim();
                            if (
                                appliedStationCallsignRef.current
                                && appliedStationCallsignRef.current !== trimmedNext
                            ) {
                                setPreferredNameField(createEmptyFieldState());
                                setLocationField(createEmptyFieldState());
                                appliedStationCallsignRef.current = null;
                            }
                        }}
                        onKeyDown={handleKeyDown}
                        onFocus={() => {
                            if (suggestions.length > 0) {
                                setShowDropdown(true);
                            }
                        }}
                        onBlur={() => {
                            const trimmed = value.trim().toUpperCase();
                            // Delay to allow click handlers (like dropdown selection) to run
                            setTimeout(() => {
                                setShowDropdown(false);
                                setSelectedIndex(-1);
                                if (!trimmed) {
                                    lastLookupCallsignRef.current = null;
                                    selectionInProgressRef.current = false;
                                    appliedStationCallsignRef.current = null;
                                    return;
                                }

                                if (selectionInProgressRef.current) {
                                    selectionInProgressRef.current = false;
                                    lastLookupCallsignRef.current = trimmed;
                                    appliedStationCallsignRef.current = trimmed;
                                    return;
                                }

                                if (lastLookupCallsignRef.current === trimmed) {
                                    return;
                                }

                                const suggestionMatch = suggestions.find(
                                    suggestion => suggestion.callsign.toUpperCase() === trimmed
                                );

                                if (suggestionMatch) {
                                    applyStationDetails(suggestionMatch);
                                    lastLookupCallsignRef.current = trimmed;
                                    if (needsLookup(suggestionMatch)) {
                                        void performLookup(trimmed);
                                    }
                                    return;
                                }

                                void performLookup(trimmed);
                            }, 100);
                        }}
                        maxLength={6}
                        disabled={disabled}
                        placeholder='Callsign'
                        className='w-[96px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-mono uppercase tracking-wide text-slate-100 placeholder-slate-500 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:cursor-not-allowed disabled:opacity-50 h-10'
                        aria-label='Callsign input'
                        aria-autocomplete='list'
                        aria-expanded={showDropdown}
                        tabIndex={1}
                    />
                    {(isLoading || isLookupInFlight) && (
                        <div className='pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2'>
                            <svg
                                className='h-4 w-4 animate-spin text-slate-400'
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
                    {renderDropdown()}
                </div>
                <div className='relative flex-shrink-0'>
                    <label htmlFor='preferred-name-input' className='sr-only'>Name</label>
                    <input
                        id='preferred-name-input'
                        type='text'
                        value={preferredNameField.value}
                        onChange={(e) => {
                            const next = e.target.value;
                            setPreferredNameField(prev => ({
                                value: next,
                                source: next.trim().length > 0 ? 'manual' : 'none',
                                qrzBaseline: prev.qrzBaseline,
                                dirty: true
                            }));
                        }}
                        onKeyDown={handlePreferredNameKeyDown}
                        disabled={disabled}
                        maxLength={120}
                        placeholder='Name (optional)'
                        className='w-40 sm:w-56 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:cursor-not-allowed disabled:opacity-50 h-10'
                        aria-label='Operator name input'
                        tabIndex={2}
                    />
                </div>
                <div className='relative flex-shrink-0'>
                    <label htmlFor='location-input' className='sr-only'>Location</label>
                    <input
                        id='location-input'
                        type='text'
                        value={locationField.value}
                        onChange={(e) => {
                            const next = e.target.value;
                            setLocationField(prev => ({
                                value: next,
                                source: next.trim().length > 0 ? 'manual' : 'none',
                                qrzBaseline: prev.qrzBaseline,
                                dirty: true
                            }));
                        }}
                        onKeyDown={handleLocationKeyDown}
                        disabled={disabled}
                        maxLength={120}
                        placeholder='Location (optional)'
                        className='w-40 sm:w-56 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:cursor-not-allowed disabled:opacity-50 h-10'
                        aria-label='Operator location input'
                        tabIndex={3}
                    />
                </div>
                <div className='flex-1 min-w-[200px]'>
                    <input
                        id='topic-answer-input'
                        type='text'
                        value={topicAnswer}
                        onChange={(e) => { setTopicAnswer(e.target.value); }}
                        onKeyDown={handleTopicAnswerKeyDown}
                        disabled={disabled}
                        maxLength={120}
                        placeholder='Comments (optional)'
                        className='w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:cursor-not-allowed disabled:opacity-50 h-10'
                        tabIndex={4}
                    />
                </div>
                <button
                    type='button'
                    onClick={() => { setStaying(prev => !prev); }}
                    disabled={disabled}
                    className={`flex h-10 flex-shrink-0 items-center rounded-md border border-slate-700/70 px-3 text-xs font-semibold uppercase tracking-wide transition ${
                        staying ? 'bg-emerald-500/20 text-emerald-300' : 'bg-orange-500/20 text-orange-300'
                    } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:opacity-90'}`}
                    aria-label='Toggle staying status'
                    aria-pressed={staying}
                    title={staying ? 'Mark as staying' : 'Mark as in and out'}
                    tabIndex={5}
                >
                    {staying ? 'Staying' : 'In & Out'}
                </button>
                {mobilityEnabled && (
                    <div className='flex h-10 flex-shrink-0 items-center gap-1 rounded-md border border-slate-700/70 bg-slate-800/70 px-1 py-1'>
                        <button
                            type='button'
                            onClick={() => { setMobility('neither'); }}
                            disabled={disabled}
                            className={`flex h-8 w-8 items-center justify-center rounded-md border border-transparent transition ${
                                mobility === 'neither'
                                    ? 'bg-sky-500/20 text-sky-300'
                                    : 'text-slate-400 hover:text-slate-200'
                            } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                            aria-label='Set mobility to fixed'
                            aria-pressed={mobility === 'neither'}
                            title='Fixed station'
                            tabIndex={5}
                        >
                            <FaHome size={12} />
                        </button>
                        <button
                            type='button'
                            onClick={() => { setMobility('mobile'); }}
                            disabled={disabled}
                            className={`flex h-8 w-8 items-center justify-center rounded-md border border-transparent transition ${
                                mobility === 'mobile'
                                    ? 'bg-sky-500/20 text-sky-300'
                                    : 'text-slate-400 hover:text-slate-200'
                            } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                            aria-label='Set mobility to mobile'
                            aria-pressed={mobility === 'mobile'}
                            title='Mobile'
                            tabIndex={6}
                        >
                            <FaCar size={12} />
                        </button>
                        <button
                            type='button'
                            onClick={() => { setMobility('portable'); }}
                            disabled={disabled}
                            className={`flex h-8 w-8 items-center justify-center rounded-md border border-transparent transition ${
                                mobility === 'portable'
                                    ? 'bg-sky-500/20 text-sky-300'
                                    : 'text-slate-400 hover:text-slate-200'
                            } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                            aria-label='Set mobility to portable'
                            aria-pressed={mobility === 'portable'}
                            title='Portable'
                            tabIndex={7}
                        >
                            <FaSuitcase size={12} />
                        </button>
                    </div>
                )}
                <button
                    type='button'
                    onClick={() => { submitCurrent(value.trim() ? value : undefined); }}
                    disabled={disabled ?? (!value.trim() && selectedIndex === -1)}
                    className={`flex h-10 flex-shrink-0 items-center rounded-md border border-slate-700/70 px-4 text-xs font-semibold uppercase tracking-wide transition ${
                        disabled || (!value.trim() && selectedIndex === -1)
                            ? 'cursor-not-allowed opacity-50 text-slate-500'
                            : 'cursor-pointer bg-sky-500/20 text-sky-300 hover:border-sky-500 hover:text-sky-200'
                    }`}
                    aria-label='Submit callsign'
                    tabIndex={8}
                >
                    Submit
                </button>
            </div>
            <div className='flex items-center gap-1 text-xs text-slate-500'>
                <PiKeyReturnThin size={14} className='text-slate-400' />
                <span>
                    {mobilityEnabled
                        ? 'Enter to submit. Ctrl+S toggles status, Ctrl+M cycles mobility, Ctrl+N clears entry.'
                        : 'Enter to submit. Ctrl+S toggles status, Ctrl+N clears entry.'}
                </span>
            </div>
        </div>
    );
}