import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { localStorage } from '@onlook/db/src/local-storage';
import { z } from 'zod';

export const projectRouter = createTRPCRouter({
    list: protectedProcedure
        .query(async () => {
            const projects = await localStorage.listProjects();
            return projects;
        }),

    get: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ input }) => {
            const project = await localStorage.getProject(input.projectId);
            if (!project) {
                throw new Error('Project not found');
            }
            return project;
        }),

    create: protectedProcedure
        .input(z.object({
            name: z.string(),
            description: z.string().optional(),
            tags: z.array(z.string()).default([]),
        }))
        .mutation(async ({ input }) => {
            const project = await localStorage.createProject({
                name: input.name,
                description: input.description,
                tags: input.tags,
            });

            // Create default canvas
            await localStorage.createCanvas({
                projectId: project.id,
                name: 'Main Canvas',
            });

            // Create default conversation
            await localStorage.createConversation({
                projectId: project.id,
                title: 'Main Chat',
            });

            return project;
        }),

    update: protectedProcedure
        .input(z.object({
            projectId: z.string(),
            name: z.string().optional(),
            description: z.string().optional(),
            tags: z.array(z.string()).optional(),
        }))
        .mutation(async ({ input }) => {
            const { projectId, ...updates } = input;
            const project = await localStorage.updateProject(projectId, updates);
            if (!project) {
                throw new Error('Project not found');
            }
            return project;
        }),

    delete: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .mutation(async ({ input }) => {
            const success = await localStorage.deleteProject(input.projectId);
            if (!success) {
                throw new Error('Failed to delete project');
            }
            return { success: true };
        }),

    // Canvas operations
    listCanvases: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ input }) => {
            return await localStorage.listCanvases(input.projectId);
        }),

    createCanvas: protectedProcedure
        .input(z.object({
            projectId: z.string(),
            name: z.string(),
        }))
        .mutation(async ({ input }) => {
            return await localStorage.createCanvas(input);
        }),

    // Conversation operations
    listConversations: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ input }) => {
            return await localStorage.listConversations(input.projectId);
        }),

    createConversation: protectedProcedure
        .input(z.object({
            projectId: z.string(),
            title: z.string(),
        }))
        .mutation(async ({ input }) => {
            return await localStorage.createConversation(input);
        }),

    // File operations
    listFiles: protectedProcedure
        .input(z.object({
            projectId: z.string(),
            path: z.string().optional(),
        }))
        .query(async ({ input }) => {
            return await localStorage.listFiles(input.projectId, input.path);
        }),

    readFile: protectedProcedure
        .input(z.object({
            projectId: z.string(),
            filePath: z.string(),
        }))
        .query(async ({ input }) => {
            const content = await localStorage.readFile(input.projectId, input.filePath);
            if (!content) {
                throw new Error('File not found');
            }
            return { content };
        }),

    writeFile: protectedProcedure
        .input(z.object({
            projectId: z.string(),
            filePath: z.string(),
            content: z.string(),
        }))
        .mutation(async ({ input }) => {
            await localStorage.saveFile(input.projectId, input.filePath, input.content);
            return { success: true };
        }),
});
