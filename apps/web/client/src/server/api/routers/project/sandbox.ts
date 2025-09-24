import {
    CodeProvider,
    createCodeProviderClient,
    getStaticCodeProvider,
} from '@onlook/code-provider';
import { env } from '@/env';
import { CodeProvider, createCodeProviderClient, getStaticCodeProvider } from '@onlook/code-provider';
import { getSandboxPreviewUrl } from '@onlook/constants';
import { shortenUuid } from '@onlook/utility/src/id';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { TRPCError } from '@trpc/server';
import path from 'path';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { env } from '@/env';

const LOCAL_SANDBOX_PREFIX = 'local-';
const PROJECTS_ROOT = path.resolve(env.ONLOOK_PROJECTS_DIR);

function sanitizeSandboxId(sandboxId: string): string {
    return sandboxId.replace(/[^a-zA-Z0-9-_]/g, '');
}

function resolveProviderType(sandboxId: string, requested?: CodeProvider) {
    if (requested) {
        return requested;
    }
    return sandboxId.startsWith(LOCAL_SANDBOX_PREFIX) ? CodeProvider.Local : CodeProvider.CodeSandbox;
}

const LOCAL_SANDBOX_PREFIX = 'local-';
const PROJECTS_ROOT = path.resolve(env.ONLOOK_PROJECTS_DIR);

function sanitizeSandboxId(sandboxId: string): string {
    return sandboxId.replace(/[^a-zA-Z0-9-_]/g, '');
}

function resolveProviderType(sandboxId: string, requested?: CodeProvider) {
    if (requested) {
        return requested;
    }
    return sandboxId.startsWith(LOCAL_SANDBOX_PREFIX) ? CodeProvider.Local : CodeProvider.CodeSandbox;
}

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
    provider,
}: {
    sandboxId: string,
    provider?: CodeProvider,
    userId?: undefined | string,
}) {
    const resolvedProvider = resolveProviderType(sandboxId, provider);

    if (resolvedProvider === CodeProvider.Local) {
        const sanitizedId = sanitizeSandboxId(sandboxId);
        const projectPath = path.join(PROJECTS_ROOT, sanitizedId);
        return createCodeProviderClient(CodeProvider.Local, {
            providerOptions: {
                local: {
                    sandboxId,
                    projectPath,
                    preferredPort: 3000,
                    projectsRoot: PROJECTS_ROOT,
        return createCodeProviderClient(CodeProvider.Local, {
            providerOptions: {
                local: {
                    sandboxId,
                    projectPath,
                    preferredPort: 3000,
                    projectsRoot: PROJECTS_ROOT,
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
    } else if (resolvedProvider === CodeProvider.CodeSandbox) {
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
            const providerType = resolveProviderType(input.sandboxId);
            const provider = await getProvider({
                sandboxId: input.sandboxId,
                userId,
                provider: providerType,
            });
            const session = await provider.createSession({
                args: {
                    id: shortenUuid(userId, 20),
                },
            });
            await provider.destroy();
            return {
                provider: providerType,
                session,
            };
        }),
    hibernate: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
            }),
        )
        .mutation(async ({ input }) => {
            const providerType = resolveProviderType(input.sandboxId);
            const provider = await getProvider({ sandboxId: input.sandboxId, provider: providerType });
            try {
                await provider.pauseProject({});
            } finally {
                await provider.destroy().catch(() => { });
            }
        }),
    list: protectedProcedure.input(z.object({ sandboxId: z.string() })).query(async ({ input }) => {
        const providerType = resolveProviderType(input.sandboxId);
        const provider = await getProvider({ sandboxId: input.sandboxId, provider: providerType });
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
            const providerType = resolveProviderType(input.sandboxId);
            const provider = await getProvider({ sandboxId: input.sandboxId, provider: providerType });
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
                const sandboxId = `${LOCAL_SANDBOX_PREFIX}${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
                const sanitizedId = sanitizeSandboxId(sandboxId);
                const projectPath = path.join(PROJECTS_ROOT, sanitizedId);
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
