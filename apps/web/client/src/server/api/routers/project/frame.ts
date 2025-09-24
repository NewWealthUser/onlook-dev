import { frameInsertSchema, frameUpdateSchema } from '@onlook/db';
import { localStorage, type LocalFrame } from '@onlook/db/src/local-storage';
import type { Frame } from '@onlook/models';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const toFrame = (frame: LocalFrame): Frame => ({
    id: frame.id,
    branchId: frame.branchId,
    canvasId: frame.canvasId,
    url: frame.url,
    position: {
        x: frame.position.x,
        y: frame.position.y,
    },
    dimension: {
        width: frame.dimension.width,
        height: frame.dimension.height,
    },
});

const toNumber = (value: string | number | undefined, fallback: number): number => {
    if (value === undefined) {
        return fallback;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export const frameRouter = createTRPCRouter({
    get: protectedProcedure
        .input(
            z.object({
                frameId: z.string(),
            }),
        )
        .query(async ({ input }) => {
            const record = await localStorage.findFrame(input.frameId);
            if (!record) {
                return null;
            }
            return toFrame(record.frame);
        }),
    getByCanvas: protectedProcedure
        .input(
            z.object({
                canvasId: z.string(),
            }),
        )
        .query(async ({ input }) => {
            const record = await localStorage.findCanvasById(input.canvasId);
            if (!record) {
                return [];
            }

            return record.canvas.frames
                .slice()
                .sort((a, b) => {
                    if (a.position.x === b.position.x) {
                        return a.position.y - b.position.y;
                    }
                    return a.position.x - b.position.x;
                })
                .map(toFrame);
        }),
    create: protectedProcedure
        .input(frameInsertSchema)
        .mutation(async ({ input }) => {
            try {
                const canvasRecord = await localStorage.findCanvasById(input.canvasId);
                if (!canvasRecord) {
                    throw new Error(`Canvas ${input.canvasId} not found`);
                }

                if (!input.branchId) {
                    throw new Error('Branch ID is required to create a frame');
                }

                await localStorage.createFrame({
                    projectId: canvasRecord.projectId,
                    canvasId: input.canvasId,
                    branchId: input.branchId,
                    name: 'Frame',
                    position: {
                        x: toNumber(input.x, 0),
                        y: toNumber(input.y, 0),
                    },
                    dimension: {
                        width: toNumber(input.width, 0),
                        height: toNumber(input.height, 0),
                    },
                    url: input.url,
                });
                return true;
            } catch (error) {
                console.error('Error creating frame', error);
                return false;
            }
        }),
    update: protectedProcedure
        .input(frameUpdateSchema)
        .mutation(async ({ input }) => {
            try {
                const existing = await localStorage.findFrame(input.id);
                if (!existing) {
                    throw new Error(`Frame ${input.id} not found`);
                }

                const updates: Partial<LocalFrame> = {};

                if (input.branchId) {
                    updates.branchId = input.branchId;
                }

                if (input.canvasId) {
                    updates.canvasId = input.canvasId;
                }

                if (input.url) {
                    updates.url = input.url;
                }

                if (input.x !== undefined || input.y !== undefined) {
                    updates.position = {
                        x: toNumber(input.x, existing.frame.position.x),
                        y: toNumber(input.y, existing.frame.position.y),
                    };
                }

                if (input.width !== undefined || input.height !== undefined) {
                    updates.dimension = {
                        width: toNumber(input.width, existing.frame.dimension.width),
                        height: toNumber(input.height, existing.frame.dimension.height),
                    };
                }

                const updated = await localStorage.updateFrame(
                    existing.projectId,
                    input.id,
                    updates,
                );

                return updated !== null;
            } catch (error) {
                console.error('Error updating frame', error);
                return false;
            }
        }),
    delete: protectedProcedure
        .input(
            z.object({
                frameId: z.string(),
            }),
        )
        .mutation(async ({ input }) => {
            try {
                const record = await localStorage.findFrame(input.frameId);
                if (!record) {
                    throw new Error('Frame not found');
                }

                return await localStorage.deleteFrame(
                    record.projectId,
                    input.frameId,
                );
            } catch (error) {
                console.error('Error deleting frame', error);
                return false;
            }
        }),
});
