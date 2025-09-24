import { initModel } from '@onlook/ai';
import { localStorage, type LocalConversation } from '@onlook/db/src/local-storage';
import type { ChatConversation } from '@onlook/models';
import { LLMProvider, OPENROUTER_MODELS } from '@onlook/models';
import { generateText } from 'ai';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const createConversationInput = z.object({
    projectId: z.string(),
    title: z.string().optional().nullable(),
});

const updateConversationInput = z.object({
    projectId: z.string(),
    id: z.string(),
    title: z.string().optional().nullable(),
    suggestions: z
        .array(
            z.object({
                title: z.string(),
                prompt: z.string(),
            })
        )
        .optional(),
});

const deleteConversationInput = z.object({
    projectId: z.string(),
    conversationId: z.string(),
});

const getConversationInput = z.object({
    projectId: z.string(),
    conversationId: z.string(),
});

const generateTitleInput = z.object({
    projectId: z.string(),
    conversationId: z.string(),
    content: z.string(),
});

const toChatConversation = (conversation: LocalConversation): ChatConversation => ({
    id: conversation.id,
    projectId: conversation.projectId,
    title: conversation.title,
    createdAt: new Date(conversation.createdAt),
    updatedAt: new Date(conversation.updatedAt),
    suggestions: conversation.suggestions ?? [],
});

export const conversationRouter = createTRPCRouter({
    getAll: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ input }) => {
            const conversations = await localStorage.listConversations(input.projectId);
            return conversations.map(toChatConversation);
        }),

    get: protectedProcedure
        .input(getConversationInput)
        .query(async ({ input }) => {
            const conversation = await localStorage.getConversation(input.projectId, input.conversationId);
            if (!conversation) {
                throw new Error('Conversation not found');
            }
            return toChatConversation(conversation);
        }),

    upsert: protectedProcedure
        .input(createConversationInput)
        .mutation(async ({ input }) => {
            const conversation = await localStorage.createConversation({
                projectId: input.projectId,
                title: input.title ?? null,
            });
            return toChatConversation(conversation);
        }),

    update: protectedProcedure
        .input(updateConversationInput)
        .mutation(async ({ input }) => {
            const updated = await localStorage.updateConversation(input.projectId, input.id, {
                title: input.title ?? undefined,
                suggestions: input.suggestions ?? undefined,
            });

            if (!updated) {
                throw new Error('Conversation not found');
            }

            return toChatConversation(updated);
        }),

    delete: protectedProcedure
        .input(deleteConversationInput)
        .mutation(async ({ input }) => {
            await localStorage.deleteConversation(input.projectId, input.conversationId);
        }),

    generateTitle: protectedProcedure
        .input(generateTitleInput)
        .mutation(async ({ ctx, input }) => {
            const { model, providerOptions, headers } = await initModel({
                provider: LLMProvider.OPENROUTER,
                model: OPENROUTER_MODELS.CLAUDE_3_5_HAIKU,
            });

            const MAX_NAME_LENGTH = 50;
            const result = await generateText({
                model,
                headers,
                prompt: `Generate a concise and meaningful conversation title (2-4 words maximum) that reflects the main purpose or theme of the conversation based on user's creation prompt. Generate only the conversation title, nothing else. Keep it short and descriptive. User's creation prompt: <prompt>${input.content}</prompt>`,
                providerOptions,
                maxOutputTokens: 50,
                experimental_telemetry: {
                    isEnabled: true,
                    metadata: {
                        conversationId: input.conversationId,
                        userId: ctx.user.id,
                        tags: ['conversation-title-generation'],
                        sessionId: input.conversationId,
                        langfuseTraceId: uuidv4(),
                    },
                },
            });

            const generatedName = result.text.trim();
            if (generatedName && generatedName.length > 0 && generatedName.length <= MAX_NAME_LENGTH) {
                await localStorage.updateConversation(input.projectId, input.conversationId, {
                    title: generatedName,
                });
                return generatedName;
            }

            console.error('Error generating conversation title', result);
            return null;
        }),
});
