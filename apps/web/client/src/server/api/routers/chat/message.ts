import { localStorage, type LocalConversationMessage } from '@onlook/db/src/local-storage';
import type { ChatMessage, MessageCheckpoint, MessageContext } from '@onlook/models';
import { MessageCheckpointType } from '@onlook/models';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const messagePayloadSchema = z.object({
    id: z.string(),
    conversationId: z.string(),
    content: z.string(),
    createdAt: z.union([z.string(), z.date()]),
    role: z.enum(['user', 'assistant', 'system']),
    context: z.array(z.unknown()).default([]),
    parts: z.array(z.unknown()).default([]),
    checkpoints: z.array(z.unknown()).default([]),
    applied: z.boolean().nullable().optional(),
    commitOid: z.string().nullable().optional(),
    snapshots: z.unknown().optional(),
});

const toChatMessage = (message: LocalConversationMessage): ChatMessage => ({
    id: message.id,
    role: message.role,
    parts: (message.parts ?? []) as ChatMessage['parts'],
    metadata: {
        conversationId: message.conversationId,
        createdAt: new Date(message.createdAt),
        context: (message.context ?? []) as MessageContext[],
        checkpoints: (message.checkpoints ?? []) as MessageCheckpoint[],
    },
});

const toLocalMessage = (payload: z.infer<typeof messagePayloadSchema>): LocalConversationMessage => {
    const createdAtValue = payload.createdAt instanceof Date
        ? payload.createdAt.toISOString()
        : new Date(payload.createdAt).toISOString();

    return {
        id: payload.id,
        conversationId: payload.conversationId,
        content: payload.content,
        role: payload.role,
        createdAt: createdAtValue,
        context: payload.context ?? [],
        parts: payload.parts ?? [],
        checkpoints: payload.checkpoints ?? [],
        applied: payload.applied ?? null,
        commitOid: payload.commitOid ?? null,
        snapshots: payload.snapshots,
    } satisfies LocalConversationMessage;
};

export const messageRouter = createTRPCRouter({
    getAll: protectedProcedure
        .input(z.object({ projectId: z.string(), conversationId: z.string() }))
        .query(async ({ input }) => {
            const messages = await localStorage.listConversationMessages(input.projectId, input.conversationId);
            return messages
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .map(toChatMessage);
        }),

    replaceConversationMessages: protectedProcedure
        .input(z.object({
            projectId: z.string(),
            conversationId: z.string(),
            messages: z.array(messagePayloadSchema),
        }))
        .mutation(async ({ input }) => {
            const normalized = input.messages.map((message) => toLocalMessage(message));
            await localStorage.replaceConversationMessages(input.projectId, input.conversationId, normalized);
        }),

    updateCheckpoints: protectedProcedure
        .input(z.object({
            projectId: z.string(),
            conversationId: z.string(),
            messageId: z.string(),
            checkpoints: z.array(z.object({
                type: z.nativeEnum(MessageCheckpointType),
                oid: z.string(),
                createdAt: z.union([z.date(), z.string()]),
            })),
        }))
        .mutation(async ({ input }) => {
            const checkpoints = input.checkpoints.map((checkpoint) => ({
                ...checkpoint,
                createdAt: checkpoint.createdAt instanceof Date
                    ? checkpoint.createdAt.toISOString()
                    : new Date(checkpoint.createdAt).toISOString(),
            }));

            await localStorage.updateConversationMessage(
                input.projectId,
                input.conversationId,
                input.messageId,
                { checkpoints }
            );
        }),

    delete: protectedProcedure
        .input(z.object({ projectId: z.string(), conversationId: z.string(), messageIds: z.array(z.string()) }))
        .mutation(async ({ input }) => {
            const existing = await localStorage.listConversationMessages(input.projectId, input.conversationId);
            const filtered = existing.filter((message) => !input.messageIds.includes(message.id));
            await localStorage.replaceConversationMessages(input.projectId, input.conversationId, filtered);
        }),
});
