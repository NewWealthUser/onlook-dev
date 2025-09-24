import { env } from '@/env';
import { CodeProvider, createCodeProviderClient, getStaticCodeProvider } from '@onlook/code-provider';
import { getSandboxPreviewUrl } from '@onlook/constants';
import { shortenUuid } from '@onlook/utility/src/id';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const getProjectsRoot = () => env.ONLOOK_PROJECTS_DIR;

const resolveProjectPath = (sandboxId: string) =>
    path.join(getProjectsRoot(), sandboxId);

async function ensureProjectsRoot() {
    const root = getProjectsRoot();
    await fs.mkdir(root, { recursive: true });
    return root;
}

async function getProvider({
    sandboxId,
    userId,
    provider = CodeProvider.Local,
}: {
    sandboxId: string,
    provider?: CodeProvider,
    userId?: undefined | string,
}) {
    await ensureProjectsRoot();

    if (provider === CodeProvider.Local) {
        return createCodeProviderClient(CodeProvider.Local, {
            providerOptions: {
                local: {
                    projectPath: resolveProjectPath(sandboxId),
                    port: 3000 + Math.floor(Math.random() * 1000), // Random port to avoid conflicts
                },
            },
        });
    } else if (provider === CodeProvider.CodeSandbox) {
        return createCodeProviderClient(CodeProvider.CodeSandbox, {
            providerOptions: {
                codesandbox: {
                    sandboxId,
                    userId,
                },
            },
        });
    } else {
        return createCodeProviderClient(CodeProvider.NodeFs, {
            providerOptions: {
                nodefs: {},
            },
        });
    }
}

export const sandboxRouter = createTRPCRouter({
    start: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const userId = ctx.user.id;
            const provider = await getProvider({
                sandboxId: input.sandboxId,
                userId,
            });
            const session = await provider.createSession({
                args: {
                    id: shortenUuid(userId, 20),
                },
            });
            await provider.destroy();
            return session;
        }),
    hibernate: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
            }),
        )
        .mutation(async ({ input }) => {
            const provider = await getProvider({ sandboxId: input.sandboxId });
            try {
                await provider.pauseProject({});
            } finally {
                await provider.destroy().catch(() => { });
            }
        }),
    list: protectedProcedure.input(z.object({ sandboxId: z.string() })).query(async ({ input }) => {
        const provider = await getProvider({ sandboxId: input.sandboxId });
        const res = await provider.listProjects({});
        // TODO future iteration of code provider abstraction will need this code to be refactored
        if ('projects' in res) {
            return res.projects;
        }
        return [];
    }),
    fork: protectedProcedure
        .input(
            z.object({
                sandbox: z.object({
                    id: z.string(),
                    port: z.number(),
                }),
                config: z
                    .object({
                        title: z.string().optional(),
                        tags: z.array(z.string()).optional(),
                    })
                    .optional(),
            }),
        )
        .mutation(async ({ input }) => {
            const MAX_RETRY_ATTEMPTS = 3;
            let lastError: Error | null = null;

            for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
                try {
                    const CodesandboxProvider = await getStaticCodeProvider(CodeProvider.CodeSandbox);
                    const sandbox = await CodesandboxProvider.createProject({
                        source: 'template',
                        id: input.sandbox.id,

                        // Metadata
                        title: input.config?.title,
                        tags: input.config?.tags,
                    });

                    const previewUrl = getSandboxPreviewUrl(sandbox.id, input.sandbox.port);

                    return {
                        sandboxId: sandbox.id,
                        previewUrl,
                    };
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));

                    if (attempt < MAX_RETRY_ATTEMPTS) {
                        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                    }
                }
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to create sandbox after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message}`,
                cause: lastError,
            });
        }),
    delete: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
            }),
        )
        .mutation(async ({ input }) => {
            const provider = await getProvider({ sandboxId: input.sandboxId });
            try {
                await provider.stopProject({});
            } finally {
                await provider.destroy().catch(() => { });
            }
        }),
    createFromGitHub: protectedProcedure
        .input(
            z.object({
                repoUrl: z.string(),
                branch: z.string(),
            }),
        )
        .mutation(async ({ input }) => {
            try {
                // Create a local sandbox ID
                const sandboxId = Math.random().toString(36).substring(2) + Date.now().toString(36);
                await ensureProjectsRoot();
                const projectPath = resolveProjectPath(sandboxId);
                const port = 3000 + Math.floor(Math.random() * 1000);

                // Clone the repository
                const { spawn } = await import('child_process');
                const gitProcess = spawn('git', ['clone', '--branch', input.branch, input.repoUrl, projectPath], {
                    stdio: 'pipe'
                });

                await new Promise((resolve, reject) => {
                    gitProcess.on('close', (code) => {
                        if (code === 0) {
                            resolve(undefined);
                        } else {
                            reject(new Error(`Git clone failed with code ${code}`));
                        }
                    });
                });

                const previewUrl = `http://localhost:${port}`;

                return {
                    sandboxId,
                    previewUrl,
                };
            } catch (error) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: `Failed to create GitHub sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    cause: error,
                });
            }
        }),
});
