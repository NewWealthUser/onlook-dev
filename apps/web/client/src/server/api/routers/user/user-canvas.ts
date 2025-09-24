import { localStorage, type LocalCanvas, type LocalFrame } from '@onlook/db/src/local-storage';
import type { Canvas, Frame } from '@onlook/models';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const LOCAL_USER_ID = 'local-user';

const toCanvas = (canvas: LocalCanvas): Canvas => ({
    id: canvas.id,
    scale: canvas.state.scale,
    position: canvas.state.position,
    userId: LOCAL_USER_ID,
});

const toFrame = (frame: LocalFrame): Frame => ({
    id: frame.id,
    branchId: frame.branchId,
    canvasId: frame.canvasId,
    url: frame.url,
    position: frame.position,
    dimension: frame.dimension,
});

const canvasUpdateSchema = z.object({
    scale: z.union([z.string(), z.number()]),
    x: z.union([z.string(), z.number()]),
    y: z.union([z.string(), z.number()]),
});

const toNumber = (value: string | number): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid numeric value: ${value}`);
    }
    return parsed;
};

export const userCanvasRouter = createTRPCRouter({
    get: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
            }),
        )
        .query(async ({ input }) => {
            const canvases = await localStorage.listCanvases(input.projectId);
            const canvas = canvases[0];

            if (!canvas) {
                return null;
            }

            return toCanvas(canvas);
        }),
    getWithFrames: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
            }),
        )
        .query(async ({ input }) => {
            const canvases = await localStorage.listCanvases(input.projectId);
            const canvas = canvases[0];

            if (!canvas) {
                return null;
            }

            return {
                userCanvas: toCanvas(canvas),
                frames: canvas.frames.map(toFrame),
            };
        }),
    update: protectedProcedure.input(
        z.object({
            projectId: z.string(),
            canvasId: z.string(),
            canvas: canvasUpdateSchema,
        })).mutation(async ({ input }) => {
            try {
                const scale = toNumber(input.canvas.scale);
                const x = toNumber(input.canvas.x);
                const y = toNumber(input.canvas.y);

                const updated = await localStorage.updateCanvasState(input.projectId, input.canvasId, {
                    scale,
                    position: { x, y },
                });

                return updated !== null;
            } catch (error) {
                console.error('Error updating user canvas', error);
                return false;
            }
        }),
});
