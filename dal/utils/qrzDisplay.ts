export interface StationSource {
    preferred_name?: string | null;
    location?: string | null;
    qrz_data?: string | null;
}

export interface ParsedQrzData {
    raw?: {
        name_fmt?: string;
        fname?: string;
        name?: string;
        addr2?: string;
        state?: string;
        lat?: string | number;
        lon?: string | number;
        grid?: string;
        geoloc?: string;
    };
    name?: string;
    grid?: string;
}

export interface ParseQrzOptions {
    onError?: (error: unknown) => void;
}

export interface ResolvedFieldInfo {
    value: string | null;
    fromQrz: boolean;
}

function normalizeValue(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
}

function toParsedQrzData(
    qrzSource?: string | ParsedQrzData | null,
    options?: ParseQrzOptions
): ParsedQrzData | null {
    if (!qrzSource) {
        return null;
    }

    if (typeof qrzSource !== 'string') {
        return qrzSource;
    }

    try {
        return JSON.parse(qrzSource) as ParsedQrzData;
    } catch (error) {
        options?.onError?.(error);
        return null;
    }
}

export function parseQrzData(
    qrzDataRaw?: string | null,
    options?: ParseQrzOptions
): ParsedQrzData | null {
    return toParsedQrzData(qrzDataRaw ?? null, options);
}

export function resolveDisplayNameInfo(
    preferredName?: string | null,
    qrzData?: string | ParsedQrzData | null,
    options?: ParseQrzOptions
): ResolvedFieldInfo {
    const manual = normalizeValue(preferredName);
    if (manual) {
        return {
            value: manual,
            fromQrz: false
        };
    }

    const parsed = toParsedQrzData(qrzData, options);
    if (!parsed) {
        return {
            value: null,
            fromQrz: false
        };
    }

    const raw = parsed.raw ?? {};

    const formatted = normalizeValue(raw.name_fmt);
    if (formatted) {
        return {
            value: formatted,
            fromQrz: true
        };
    }

    const combinedName = [raw.fname, raw.name]
        .map(normalizeValue)
        .filter((part): part is string => Boolean(part))
        .join(' ')
        .trim();

    if (combinedName.length > 0) {
        return {
            value: combinedName,
            fromQrz: true
        };
    }

    const fallback = normalizeValue(parsed.name);
    if (fallback) {
        return {
            value: fallback,
            fromQrz: true
        };
    }

    return {
        value: null,
        fromQrz: false
    };
}

export function resolveLocationInfo(
    location?: string | null,
    qrzData?: string | ParsedQrzData | null,
    options?: ParseQrzOptions
): ResolvedFieldInfo {
    const manual = normalizeValue(location);
    if (manual) {
        return {
            value: manual,
            fromQrz: false
        };
    }

    const parsed = toParsedQrzData(qrzData, options);
    if (!parsed) {
        return {
            value: null,
            fromQrz: false
        };
    }

    const raw = parsed.raw ?? {};
    const city = normalizeValue(raw.addr2);
    const state = normalizeValue(raw.state);
    const parts = [city, state].filter((part): part is string => Boolean(part));

    if (parts.length === 0) {
        return {
            value: null,
            fromQrz: false
        };
    }

    return {
        value: parts.join(', '),
        fromQrz: true
    };
}

export function getDisplayNameFromSource(source: StationSource): string | null {
    return resolveDisplayNameInfo(source.preferred_name, source.qrz_data).value;
}

export function getDisplayNameWithSuffixFromSource(source: StationSource): string | null {
    const info = resolveDisplayNameInfo(source.preferred_name, source.qrz_data);
    if (!info.value) {
        return null;
    }

    return info.fromQrz ? `${info.value} (qrz)` : info.value;
}

export function getLocationFromSource(source: StationSource): string | null {
    return resolveLocationInfo(source.location, source.qrz_data).value;
}

export function getLocationWithSuffixFromSource(source: StationSource): string | null {
    const info = resolveLocationInfo(source.location, source.qrz_data);
    if (!info.value) {
        return null;
    }

    return info.fromQrz ? `${info.value} (qrz)` : info.value;
}