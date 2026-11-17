import type {
    FocusEvent,
    InputHTMLAttributes,
    ReactNode
} from 'react';
import {
    useEffect,
    useRef,
    useState
} from 'react';
import {
    FaCheck,
    FaTimes
} from 'react-icons/fa';

import { parseDisplayName } from '../utils/displayName';
import { resolveErrorMessage } from '../utils/errors';

export interface EditableTextProps {
    value: string | null;
    placeholder?: string;
    onSave: (newValue: string) => Promise<void>;
    className?: string;
    textClassName?: string;
    disabled?: boolean;
    displayValue?: string;
    renderDisplayContent?: (args: {
        value: string | null;
        displayValue: string;
        placeholder: string;
        disabled: boolean;
        beginEdit: () => void;
    }) => ReactNode;
    transformDraft?: (draft: string) => string;
    formatSubmittedValue?: (draft: string) => string;
    inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'ref'>;
}

export function EditableText({
    value,
    displayValue,
    placeholder = 'Add name',
    onSave,
    className,
    textClassName = 'text-sm text-slate-300 hover:text-slate-100',
    disabled = false,
    renderDisplayContent,
    transformDraft,
    formatSubmittedValue,
    inputProps
}: EditableTextProps) {
    const resolvedDisplayValue = displayValue ?? (value ?? '');
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(resolvedDisplayValue);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const editingContainerRef = useRef<HTMLDivElement | null>(null);
    const {
        className: inputClassNameProp,
        ...restInputProps
    } = inputProps ?? {};
    const combinedInputClassName = [
        'w-full rounded border border-sky-500 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:cursor-not-allowed disabled:opacity-50',
        inputClassNameProp
    ].filter(Boolean).join(' ');

    useEffect(() => {
        if (!isEditing) {
            setDraft(resolvedDisplayValue);
        }
    }, [resolvedDisplayValue, isEditing]);

    const beginEdit = () => {
        if (disabled || isSaving)
            return;
        setIsEditing(true);
        setError(null);
    };

    const handleCancel = () => {
        setDraft(resolvedDisplayValue);
        setError(null);
        setIsEditing(false);
    };

    const handleSubmit = async () => {
        const trimmed = draft.trim();

        const formatted = formatSubmittedValue ? formatSubmittedValue(trimmed) : trimmed;

        if (formatted === resolvedDisplayValue) {
            setIsEditing(false);
            return;
        }

        try {
            setIsSaving(true);
            setError(null);
            await onSave(formatted);
            setIsEditing(false);
        } catch (err) {
            const message = resolveErrorMessage(err, 'Failed to save changes');
            setError(message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputBlur = (event: FocusEvent<HTMLInputElement>) => {
        const nextElement = event.relatedTarget as HTMLElement | null;
        if (nextElement && editingContainerRef.current?.contains(nextElement))
            return;
        handleCancel();
    };

    const renderContent = () => {
        if (renderDisplayContent) {
            return renderDisplayContent({
                value,
                displayValue: resolvedDisplayValue,
                placeholder,
                disabled,
                beginEdit
            });
        }

        if (resolvedDisplayValue) {
            return <span>{resolvedDisplayValue}</span>;
        }

        return (
            <span className='italic text-slate-500'>{placeholder}</span>
        );
    };

    return (
        <div className={className}>
            {isEditing ? (
                <>
                    <div
                        ref={editingContainerRef}
                        className='flex items-center gap-2'
                    >
                        <input
                            type='text'
                            value={draft}
                            onChange={(e) => {
                                const next = transformDraft ? transformDraft(e.target.value) : e.target.value;
                                setDraft(next);
                            }}
                            onBlur={handleInputBlur}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleSubmit();
                                }
                                if (e.key === 'Escape') {
                                    e.preventDefault();
                                    handleCancel();
                                }
                            }}
                            disabled={isSaving}
                            autoFocus
                            className={combinedInputClassName}
                            {...restInputProps}
                        />
                        <div className='flex items-center gap-2'>
                            <button
                                type='button'
                                onClick={() => { void handleSubmit(); }}
                                disabled={isSaving}
                                className='rounded bg-emerald-500/20 p-1.5 text-emerald-300 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50'
                                title='Save name'
                            >
                                <FaCheck size={12} />
                            </button>
                            <button
                                type='button'
                                onClick={handleCancel}
                                disabled={isSaving}
                                className='rounded bg-slate-800/70 p-1.5 text-slate-400 transition hover:bg-slate-700/60 disabled:cursor-not-allowed disabled:opacity-50'
                                title='Cancel'
                            >
                                <FaTimes size={12} />
                            </button>
                        </div>
                    </div>
                    {error && (
                        <p className='mt-1 text-xs text-red-400'>{error}</p>
                    )}
                </>
            ) : (
                <button
                    type='button'
                    onClick={beginEdit}
                    className={`flex w-full items-center gap-2 text-left transition ${textClassName} ${disabled ? 'cursor-default' : ''}`}
                    disabled={disabled}
                >
                    {renderContent()}
                </button>
            )}
        </div>
    );
}

interface EditableNameProps extends Omit<EditableTextProps, 'displayValue' | 'renderDisplayContent' | 'placeholder'> {
    badgeLabel?: string;
    placeholder?: string;
}

export function EditableName({
    value,
    onSave,
    badgeLabel = 'QRZ',
    placeholder = 'Add name',
    ...rest
}: EditableNameProps) {
    const { text, fromQrz } = parseDisplayName(value);

    return (
        <EditableText
            value={value}
            displayValue={text}
            onSave={onSave}
            placeholder={placeholder}
            renderDisplayContent={({ displayValue }) => (
                <>
                    {displayValue ? (
                        <span>{displayValue}</span>
                    ) : (
                        <span className='italic text-slate-500'>{placeholder}</span>
                    )}
                    {fromQrz && text && (
                        <span className='rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-sky-100/60'>
                            {badgeLabel}
                        </span>
                    )}
                </>
            )}
            {...rest}
        />
    );
}