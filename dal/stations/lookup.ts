import {
    isQRZConfigured,
    lookupCallsign,
    shouldRefreshQRZ
} from '@netminder/core';

import type { ParsedQrzData } from '../utils/qrzDisplay';
import {
    parseQrzData,
    resolveDisplayNameInfo,
    resolveLocationInfo
} from '../utils/qrzDisplay';

import {
    findStationByCallsign,
    normalizeCallsign
} from './get';
import { createOrUpdateStationRecord } from './mutations';

export type FieldSource = 'manual' | 'qrz' | 'none';

export interface StationLookupFieldInfo {
    value: string | null;
    source: FieldSource;
    manual: string | null;
    qrz: string | null;
}

export interface StationLookupDetails {
    callsign: string;
    station: {
        preferred_name: string | null;
        location: string | null;
        qrz_last_fetched_at: string | null;
        qrz_data_present: boolean;
    } | null;
    preferred_name: StationLookupFieldInfo;
    location: StationLookupFieldInfo;
    qrz: {
        enabled: boolean;
        fetched_now: boolean;
        last_fetched_at: string | null;
    };
    source: FieldSource;
}

export async function getStationLookupDetails(callsign: string, userId: number | null): Promise<StationLookupDetails> {
    const normalizedCallsign = normalizeCallsign(callsign);
    let station = findStationByCallsign(normalizedCallsign);

    const qrzEnabled = isQRZConfigured(userId);

    const manualPreferred = station?.preferred_name?.trim() ?? null;
    const manualLocation = station?.location?.trim() ?? null;

    let qrzDataRaw = station?.qrz_data ?? null;
    let qrzLastFetchedAt = station?.qrz_last_fetched_at ?? null;
    let fetchedNow = false;

    const handleParseError = (error: unknown): void => {
        console.warn('Invalid QRZ JSON data', error);
    };

    let qrzParsed: ParsedQrzData | null = parseQrzData(qrzDataRaw, { onError: handleParseError });

    const qrzedInfo = resolveDisplayNameInfo(undefined, qrzParsed);
    let qrzPreferred = qrzedInfo.fromQrz ? qrzedInfo.value : null;
    const qrzLocationInfo = resolveLocationInfo(undefined, qrzParsed);
    let qrzLocation = qrzLocationInfo.fromQrz ? qrzLocationInfo.value : null;

    const shouldAttemptLookup = (
        !station
        || !qrzDataRaw
        || shouldRefreshQRZ(qrzLastFetchedAt ?? null)
        || (!manualPreferred && !qrzPreferred)
        || (!manualLocation && !qrzLocation)
    );

    if (shouldAttemptLookup && qrzEnabled) {
        const lookupResult = await lookupCallsign(normalizedCallsign, userId);
        if (lookupResult) {
            fetchedNow = true;
            qrzDataRaw = JSON.stringify(lookupResult);
            qrzLastFetchedAt = new Date().toISOString();

            if (station) {
                try {
                    station = createOrUpdateStationRecord(normalizedCallsign, {
                        qrz_data: qrzDataRaw,
                        qrz_last_fetched_at: qrzLastFetchedAt
                    });
                } catch (error) {
                    console.error('Failed to save QRZ data from lookup', error);
                }
            }

            qrzParsed = lookupResult as ParsedQrzData;

            const freshDisplayInfo = resolveDisplayNameInfo(undefined, qrzParsed);
            qrzPreferred = freshDisplayInfo.fromQrz ? freshDisplayInfo.value : null;
            const freshLocationInfo = resolveLocationInfo(undefined, qrzParsed);
            qrzLocation = freshLocationInfo.fromQrz ? freshLocationInfo.value : null;
        }
    }

    const preferredDisplay = resolveDisplayNameInfo(manualPreferred, qrzParsed);
    const locationDisplay = resolveLocationInfo(manualLocation, qrzParsed);

    const preferredSource: FieldSource = manualPreferred
        ? 'manual'
        : (qrzPreferred ? 'qrz' : 'none');
    const locationSource: FieldSource = manualLocation
        ? 'manual'
        : (qrzLocation ? 'qrz' : 'none');

    const preferredField: StationLookupFieldInfo = {
        value: preferredDisplay.value,
        source: preferredSource,
        manual: manualPreferred,
        qrz: qrzPreferred
    };

    const locationField: StationLookupFieldInfo = {
        value: locationDisplay.value,
        source: locationSource,
        manual: manualLocation,
        qrz: qrzLocation
    };

    const compositeSource: FieldSource = (
        preferredSource === 'manual' || locationSource === 'manual'
    )
        ? 'manual'
        : (
            (preferredSource === 'qrz' || locationSource === 'qrz')
                ? 'qrz'
                : 'none'
        );

    return {
        callsign: normalizedCallsign,
        station: station
            ? {
                preferred_name: station.preferred_name,
                location: station.location,
                qrz_last_fetched_at: station.qrz_last_fetched_at,
                qrz_data_present: Boolean(station.qrz_data)
            }
            : null,
        preferred_name: preferredField,
        location: locationField,
        qrz: {
            enabled: qrzEnabled,
            fetched_now: fetchedNow,
            last_fetched_at: qrzLastFetchedAt ?? null
        },
        source: compositeSource
    };
}