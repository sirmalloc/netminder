import {
    t,
    type Context,
    type Static
} from 'elysia';

import {
    findVisibleNetForCheckin,
    getMobilityEnabled,
    reassignCheckinCallsign,
    updateCheckinRecord
} from '@netminder/dal';

import type { AuthUser } from '../auth/middleware';
import {
    errorResponse,
    unauthorizedResponse,
    type ErrorResponse
} from '../common/errors';
import { parsePositiveInt } from '../common/validation';
import { normalizeCallsignValue } from '../stations/utils';

import {
    checkinSchema,
    mobilitySchema,
    normalizeMobility,
    toCheckinPayload
} from './schema';

export const updateContract = {
    params: t.Object({
        id: t.String({
            description: 'Identifier of the checkin to update',
            examples: ['123']
        })
    }, { description: 'Route parameters identifying the checkin being modified' }),
    body: t.Object({
        callsign: t.Optional(t.String({
            description: 'Corrects this check-in\'s callsign by moving it to that station; other nets are unaffected',
            examples: ['K1ABC']
        })),
        mobility: t.Optional(mobilitySchema),
        staying: t.Optional(t.Boolean({ description: 'Update whether the station is staying for the remainder of the net' })),
        called_back: t.Optional(t.Boolean({ description: 'Flag indicating if net control has completed a callback with the station' })),
        topic_answer: t.Optional(t.Union([t.String({ description: 'Updated comments for the check-in' }), t.Null()], { description: 'Provide a string to set comments or null to clear them' })),
        operator_notes: t.Optional(t.Union([t.String({ description: 'Notes for operators managing the net' }), t.Null()], { description: 'Provide a string to set operator notes or null to clear them' }))
    }, { description: 'Fields that can be adjusted on an existing checkin' }),
    detail: {
        summary: 'Update checkin',
        description: 'Updates checkin status or operator notes for a station, or corrects its callsign by moving it to another station.',
        tags: ['Checkins'] as string[]
    },
    response: {
        200: t.Object({ checkin: checkinSchema }, { description: 'Updated checkin returned after changes are applied' }),
        400: errorResponse,
        404: errorResponse,
        409: errorResponse
    }
} as const;

export type UpdateParams = Static<typeof updateContract.params>;
export type UpdateBody = Static<typeof updateContract.body>;
export type UpdateResponse = Static<typeof updateContract.response[200]>;

interface UpdateContext {
    params: UpdateParams;
    body: UpdateBody;
    user?: AuthUser | null;
    set: Context['set'];
}

function parseId(params: UpdateParams): number | null {
    return parsePositiveInt(params.id);
}

export const updateHandler = async ({ params, body, user, set }: UpdateContext): Promise<UpdateResponse | ErrorResponse> => {
    if (!user) {
        set.status = 401;
        return unauthorizedResponse();
    }

    const id = parseId(params);
    if (id === null) {
        set.status = 400;
        return {
            error: {
                code: 'INVALID_ID',
                message: 'Invalid checkin ID'
            }
        };
    }

    if (!findVisibleNetForCheckin(id, user.userId)) {
        set.status = 404;
        return {
            error: {
                code: 'CHECKIN_NOT_FOUND',
                message: 'Checkin not found'
            }
        };
    }

    const newCallsign = body.callsign === undefined ? undefined : normalizeCallsignValue(body.callsign);
    if (newCallsign !== undefined && newCallsign.length === 0) {
        set.status = 400;
        return {
            error: {
                code: 'INVALID_REQUEST',
                message: 'Callsign cannot be empty'
            }
        };
    }

    try {
        if (newCallsign !== undefined) {
            const result = await reassignCheckinCallsign(id, newCallsign, user.userId);
            if (result.status === 'not_found') {
                set.status = 404;
                return {
                    error: {
                        code: 'CHECKIN_NOT_FOUND',
                        message: 'Checkin not found'
                    }
                };
            }

            if (result.status === 'conflict') {
                set.status = 409;
                return {
                    error: {
                        code: 'DUPLICATE_CHECKIN',
                        message: `${result.callsign} is already checked into this net`
                    }
                };
            }
        }

        const mobilityValue = body.mobility && getMobilityEnabled() ? normalizeMobility(body.mobility) : undefined;

        const updated = updateCheckinRecord(id, {
            mobility: mobilityValue,
            staying: body.staying,
            called_back: body.called_back,
            topic_answer: body.topic_answer ?? undefined,
            operator_notes: body.operator_notes ?? undefined
        });

        return { checkin: toCheckinPayload(updated) };
    } catch (error) {
        if (error instanceof Error && error.message === 'Checkin not found') {
            set.status = 404;
            return {
                error: {
                    code: 'CHECKIN_NOT_FOUND',
                    message: 'Checkin not found'
                }
            };
        }

        console.error('Error updating checkin:', error);
        set.status = 500;
        return {
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to update checkin'
            }
        };
    }
};