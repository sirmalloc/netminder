import {
    t,
    type Context,
    type Static
} from 'elysia';

import {
    getStationDetail,
    renameStation,
    updateStationProfile
} from '@netminder/dal';

import type { AuthUser } from '../auth/middleware';
import {
    errorResponse,
    type ErrorResponse
} from '../common/errors';

import { stationDetailSchema } from './schema';
import {
    decodeCallsignParam,
    mapStationDetail,
    normalizeCallsignValue
} from './utils';

export const updateContract = {
    params: t.Object({
        callsign: t.String({
            description: 'Current callsign of the station being updated',
            examples: ['K1ABC']
        })
    }, { description: 'Route parameters identifying the station to update' }),
    body: t.Object({
        preferred_name: t.Optional(t.Union([t.String({ description: 'Preferred operator name to display' }), t.Null()], { description: 'Set to a string to update the preferred name or null to clear' })),
        location: t.Optional(t.Union([t.String({ description: 'Free-form description of the station location' }), t.Null()], { description: 'Set to a string to update the location or null to clear' })),
        notes: t.Optional(t.Union([t.String({ description: 'Internal notes regarding the station' }), t.Null()], { description: 'Set to a string to update station notes or null to clear' })),
        new_callsign: t.Optional(t.String({
            description: 'New callsign to assign to this station',
            examples: ['K1XYZ']
        }))
    }, { description: 'Fields that can be modified on the station record' }),
    detail: {
        summary: 'Update station',
        description: 'Updates station metadata and optionally renames the station to a new callsign. Changing the callsign is restricted to administrators.',
        tags: ['Stations'] as string[]
    },
    response: {
        200: t.Object({ station: stationDetailSchema }, { description: 'Station detail after applying updates' }),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        500: errorResponse
    }
} as const;

export type UpdateParams = Static<typeof updateContract.params>;
export type UpdateBody = Static<typeof updateContract.body>;
export type UpdateResponse = Static<typeof updateContract.response[200]>;
interface UpdateContext {
    params: UpdateParams;
    body: UpdateBody;
    set: Context['set'];
    user?: AuthUser | null;
}

function hasProfileUpdates(body: UpdateBody): boolean {
    return (
        body.preferred_name !== undefined
        || body.location !== undefined
        || body.notes !== undefined
    );
}

export const updateHandler = async ({
    params,
    body,
    set,
    user
}: UpdateContext): Promise<UpdateResponse | ErrorResponse> => {
    const decoded = decodeCallsignParam(params.callsign);
    if (!decoded) {
        set.status = 400;
        return {
            error: {
                code: 'INVALID_CALLSIGN',
                message: 'Callsign parameter is required'
            }
        };
    }

    if (
        body.new_callsign === undefined
        && !hasProfileUpdates(body)
    ) {
        set.status = 400;
        return {
            error: {
                code: 'INVALID_REQUEST',
                message: 'Request body must contain at least one field to update'
            }
        };
    }

    if (body.new_callsign !== undefined && !user?.isAdmin) {
        set.status = 403;
        return {
            error: {
                code: 'FORBIDDEN',
                message: 'Only administrators can change a station\'s callsign'
            }
        };
    }

    try {
        const normalized = normalizeCallsignValue(decoded);
        let effectiveCallsign = normalized;

        if (body.new_callsign !== undefined) {
            const trimmedNew = body.new_callsign.trim();

            if (trimmedNew.length === 0) {
                set.status = 400;
                return {
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'New callsign cannot be empty'
                    }
                };
            }

            const renameResult = await renameStation(normalized, trimmedNew, user?.userId ?? null);
            if (renameResult.status === 'not_found') {
                set.status = 404;
                return {
                    error: {
                        code: 'STATION_NOT_FOUND',
                        message: `Station ${normalized} not found`
                    }
                };
            }

            if (renameResult.status === 'conflict') {
                set.status = 409;
                return {
                    error: {
                        code: 'CALLSIGN_CONFLICT',
                        message: `Station ${renameResult.conflictingCallsign} already exists`
                    }
                };
            }

            effectiveCallsign = renameResult.station.callsign;
        }

        if (hasProfileUpdates(body)) {
            const updated = updateStationProfile(effectiveCallsign, {
                preferred_name: body.preferred_name === undefined ? undefined : body.preferred_name,
                location: body.location === undefined ? undefined : body.location,
                notes: body.notes === undefined ? undefined : body.notes
            });

            if (!updated) {
                set.status = 404;
                return {
                    error: {
                        code: 'STATION_NOT_FOUND',
                        message: `Station ${effectiveCallsign} not found`
                    }
                };
            }
        }

        const detail = getStationDetail(effectiveCallsign);
        if (!detail) {
            set.status = 500;
            return {
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to load updated station'
                }
            };
        }

        return { station: mapStationDetail(detail) };
    } catch (error) {
        console.error('Error updating station:', error);
        set.status = 500;
        return {
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to update station'
            }
        };
    }
};