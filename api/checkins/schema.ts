import { t } from 'elysia';

import type { CheckinRow } from '@netminder/dal';

export const mobilitySchema = t.Union([
    t.Literal('neither', { description: 'Station is not operating mobile or portable' }),
    t.Literal('mobile', { description: 'Station is operating mobile from a vehicle' }),
    t.Literal('portable', { description: 'Station is operating portable from a temporary location' })
], { description: 'Mobility status reported for the checkin' });

export type MobilitySchema = typeof mobilitySchema.static;

const allowedMobility = new Set<MobilitySchema>(['neither', 'mobile', 'portable']);

export function normalizeMobility(value?: string | null): MobilitySchema {
    if (!value)
        return 'neither';
    const normalized = value.trim().toLowerCase();
    return allowedMobility.has(normalized as MobilitySchema) ? normalized as MobilitySchema : 'neither';
}

export const checkinSchema = t.Object({
    id: t.Number({ description: 'Unique identifier for the checkin' }),
    net_id: t.Number({ description: 'Identifier of the net the checkin belongs to' }),
    station_id: t.Number({ description: 'Identifier of the station record associated with the checkin' }),
    callsign: t.String({ description: 'Callsign reported for the checkin' }),
    display_name: t.Nullable(t.String({ description: 'Display name rendered for the station, if available' })),
    location_display: t.Nullable(t.String({ description: 'Formatted location text displayed to operators' })),
    latitude: t.Nullable(t.Number({ description: 'Latitude of the station in decimal degrees, from QRZ or the grid square center' })),
    longitude: t.Nullable(t.Number({ description: 'Longitude of the station in decimal degrees, from QRZ or the grid square center' })),
    location_source: t.Nullable(t.Union([
        t.Literal('qrz', { description: 'Coordinates registered with QRZ' }),
        t.Literal('grid', { description: 'Approximate: center of the Maidenhead grid square' })
    ], { description: 'Where the coordinates came from; null when the station has no known location' })),
    location_precision: t.Nullable(t.Union([
        t.Literal('address', { description: 'Address-level: set by the operator or geocoded from a street address' }),
        t.Literal('zip', { description: 'Approximate: ZIP code center' }),
        t.Literal('grid', { description: 'Approximate: grid square center' }),
        t.Literal('state', { description: 'Approximate: state center' }),
        t.Literal('country', { description: 'Approximate: country center' }),
        t.Literal('unknown', { description: 'QRZ did not report how the coordinates were determined' })
    ], { description: 'How precise the coordinates are; null when the station has no known location' })),
    time_entered: t.String({ description: 'ISO-8601 timestamp when the checkin was recorded' }),
    mobility: mobilitySchema,
    staying: t.Boolean({ description: 'True when the station is staying for the remainder of the net' }),
    called_back: t.Boolean({ description: 'Indicates whether the station has been called back by net control' }),
    topic_answer: t.Nullable(t.String({ description: 'Comments recorded for the station check-in' })),
    operator_notes: t.Nullable(t.String({ description: 'Internal notes added by operators for this checkin' }))
}, { description: 'Checkin details associated with a net participant' });

export type CheckinSchema = typeof checkinSchema.static;

export function toCheckinPayload(row: CheckinRow): CheckinSchema {
    return {
        id: row.id,
        net_id: row.net_id,
        station_id: row.station_id,
        callsign: row.callsign,
        display_name: row.display_name ?? null,
        location_display: row.location_display ?? null,
        latitude: row.latitude,
        longitude: row.longitude,
        location_source: row.location_source,
        location_precision: row.location_precision,
        time_entered: row.time_entered,
        mobility: normalizeMobility(row.mobility),
        staying: row.staying,
        called_back: row.called_back,
        topic_answer: row.topic_answer ?? null,
        operator_notes: row.operator_notes ?? null
    };
}

export const checkinMetaSchema = t.Object({
    prior_checkins: t.Number({ description: 'Number of previous checkins recorded for this station' }),
    is_new: t.Boolean({ description: 'True if this is the first checkin for the station' }),
    last_seen_at: t.Nullable(t.String({ description: 'Timestamp of the station’s most recent prior checkin' })),
    first_seen_at: t.Nullable(t.String({ description: 'Timestamp of the station’s first ever checkin' }))
}, { description: 'Metadata about the station’s prior participation' });

export type CheckinMetaSchema = typeof checkinMetaSchema.static;