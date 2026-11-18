import {
    t,
    type Context,
    type Static
} from 'elysia';

import { getStationLookupDetails } from '@netminder/dal';

import type { AuthUser } from '../auth/middleware';
import {
    errorResponse,
    type ErrorResponse
} from '../common/errors';

import { lookupSchema } from './schema';
import {
    decodeCallsignParam,
    normalizeCallsignValue
} from './utils';

export const lookupContract = {
    params: t.Object({
        callsign: t.String({
            description: 'Callsign to lookup using cached station data and QRZ integration',
            examples: ['K1ABC']
        })
    }, { description: 'Route parameters identifying the station lookup target' }),
    detail: {
        summary: 'Lookup station details',
        description: 'Performs a station lookup, combining stored data with QRZ information when available. Freshly fetched QRZ data is saved to existing stations; lookups never create stations.',
        tags: ['Stations'] as string[]
    },
    response: {
        200: t.Object({ lookup: lookupSchema }, { description: 'Lookup results for the requested callsign' }),
        400: errorResponse,
        500: errorResponse
    }
} as const;

export type LookupParams = Static<typeof lookupContract.params>;
export type LookupResponse = Static<typeof lookupContract.response[200]>;
interface LookupContext {
    params: LookupParams;
    set: Context['set'];
    user?: AuthUser | null;
}

export const lookupHandler = async ({
    params,
    set,
    user
}: LookupContext): Promise<LookupResponse | ErrorResponse> => {
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

    try {
        const normalized = normalizeCallsignValue(decoded);
        const lookup = await getStationLookupDetails(normalized, user?.userId ?? null);

        return { lookup };
    } catch (error) {
        console.error('Error performing station lookup:', error);
        set.status = 500;
        return {
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to lookup station'
            }
        };
    }
};