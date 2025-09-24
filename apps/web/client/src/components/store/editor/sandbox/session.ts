import { api } from '@/trpc/client';
import {
    CodeProvider,
    LocalProvider,
    createCodeProviderClient,
    type LocalCreateSessionOutput,
    type LocalSandboxLogEntry,
    type LocalSandboxLogLevel,
    type Provider,
} from '@onlook/code-provider';
import type { Branch } from '@onlook/models';
import { makeAutoObservable } from 'mobx';
import type { ErrorManager } from '../error';
import { CLISessionImpl, CLISessionType, type CLISession, type TerminalSession } from './terminal';

export class SessionManager {
    provider: Provider | null = null;
    isConnecting = false;
    terminalSessions = new Map<string, CLISession>();
    activeTerminalSessionId = 'cli';
    private providerType: CodeProvider | null = null;

    constructor(
        private readonly branch: Branch,
        private readonly errorManager: ErrorManager
    ) {
        this.start(this.branch.sandbox.id);
        makeAutoObservable(this);
    }

    async start(sandboxId: string, userId?: string) {
        if (this.isConnecting || this.provider) {
            return;
        }
        this.isConnecting = true;

        try {
            const startResult = await api.sandbox.start.mutate({ sandboxId });
            this.providerType = startResult.provider;

            if (startResult.provider === CodeProvider.Local) {
                const initialSession = startResult.session as LocalCreateSessionOutput;
                const sessionCache = new Map<string, LocalCreateSessionOutput>();
                sessionCache.set(sandboxId, initialSession);

                const resolveLocalSession = async (id: string) => {
                    const cached = sessionCache.get(id);
                    if (cached) {
                        return cached;
                    }
                    const followUp = await api.sandbox.start.mutate({ sandboxId: id });
                    if (followUp.provider !== CodeProvider.Local) {
                        throw new Error('Expected local sandbox provider');
                    }
                    const session = followUp.session as LocalCreateSessionOutput;
                    sessionCache.set(id, session);
                    return session;
                };

                this.provider = await createCodeProviderClient(CodeProvider.Local, {
                    providerOptions: {
                        local: {
                            sandboxId,
                            projectPath: initialSession.projectPath,
                            preferredPort: initialSession.port,
                            getSession: resolveLocalSession,
                        },
                    },
                });
            } else {
                let pendingRemoteSession: any = startResult.session;

                const resolveRemoteSession = async (id: string) => {
                    if (pendingRemoteSession && id === sandboxId) {
                        const session = pendingRemoteSession;
                        pendingRemoteSession = null;
                        return session;
                    }
                    const followUp = await api.sandbox.start.mutate({ sandboxId: id });
                    if (followUp.provider !== CodeProvider.CodeSandbox) {
                        throw new Error('Expected CodeSandbox provider');
                    }
                    return followUp.session;
                };

                this.provider = await createCodeProviderClient(CodeProvider.CodeSandbox, {
                    providerOptions: {
                        codesandbox: {
                            sandboxId,
                            userId,
                            initClient: true,
                            keepActiveWhileConnected: false,
                            getSession: async (id) => resolveRemoteSession(id),
                        },
                    },
                });
            }
            await this.createTerminalSessions(this.provider);
        } catch (error) {
            console.error('Failed to start sandbox session:', error);
            this.provider = null;
            this.providerType = null;
            throw error;
        } finally {
            this.isConnecting = false;
        }
    }

    async restartDevServer(): Promise<boolean> {
        if (!this.provider) {
            console.error('No provider found in restartDevServer');
            return false;
        }
        const { task } = await this.provider.getTask({
            args: {
                id: 'dev',
            },
        });
        if (task) {
            await task.restart();
            return true;
        }
        return false;
    }

    async readDevServerLogs(
        level: LocalSandboxLogLevel | 'all' = 'all',
    ): Promise<string | LocalSandboxLogEntry[]> {
        if (!this.provider) {
            return 'Dev server not found';
        }
        if (this.providerType === CodeProvider.Local && this.provider instanceof LocalProvider) {
            return this.provider.getDevServerLogs(level);
        }
        const result = await this.provider.getTask({ args: { id: 'dev' } });
        return await result.task.open();
    }

    subscribeToDevServerLogs(
        level: LocalSandboxLogLevel | 'all',
        callback: (entry: LocalSandboxLogEntry) => void,
    ): () => void {
        if (this.providerType === CodeProvider.Local && this.provider instanceof LocalProvider) {
            return this.provider.subscribeToDevServerLogs(callback, level);
        }
        return () => { };
    }

    getTerminalSession(id: string) {
        return this.terminalSessions.get(id) as TerminalSession | undefined;
    }

    async createTerminalSessions(provider: Provider) {
        const task = new CLISessionImpl(
            'server',
            CLISessionType.TASK,
            provider,
            this.errorManager,
        );
        this.terminalSessions.set(task.id, task);
        const terminal = new CLISessionImpl(
            'terminal',
            CLISessionType.TERMINAL,
            provider,
            this.errorManager,
        );

        this.terminalSessions.set(terminal.id, terminal);
        this.activeTerminalSessionId = task.id;

        // Initialize the sessions after creation
        try {
            await Promise.all([
                task.initTask(),
                terminal.initTerminal()
            ]);
        } catch (error) {
            console.error('Failed to initialize terminal sessions:', error);
        }
    }

    async disposeTerminal(id: string) {
        const terminal = this.terminalSessions.get(id) as TerminalSession | undefined;
        if (terminal) {
            if (terminal.type === CLISessionType.TERMINAL) {
                await terminal.terminal?.kill();
                if (terminal.xterm) {
                    terminal.xterm.dispose();
                }
            }
            this.terminalSessions.delete(id);
        }
    }

    async hibernate(sandboxId: string) {
        await api.sandbox.hibernate.mutate({ sandboxId });
    }

    async reconnect(sandboxId: string, userId?: string) {
        try {
            if (!this.provider) {
                console.error('No provider found in reconnect');
                return;
            }

            // Check if the session is still connected
            const isConnected = await this.ping();
            if (isConnected) {
                return;
            }

            // Attempt soft reconnect
            await this.provider?.reconnect();

            const isConnected2 = await this.ping();
            if (isConnected2) {
                return;
            }

            await this.start(sandboxId, userId);
        } catch (error) {
            console.error('Failed to reconnect to sandbox', error);
            this.isConnecting = false;
        }
    }

    async ping() {
        if (!this.provider) return false;
        try {
            await this.provider.runCommand({ args: { command: 'echo "ping"' } });
            return true;
        } catch (error) {
            console.error('Failed to connect to sandbox', error);
            return false;
        }
    }

    async runCommand(
        command: string,
        streamCallback?: (output: string) => void,
        ignoreError: boolean = false,
    ): Promise<{
        output: string;
        success: boolean;
        error: string | null;
    }> {
        try {
            if (!this.provider) {
                throw new Error('No provider found in runCommand');
            }
            
            // Append error suppression if ignoreError is true
            const finalCommand = ignoreError ? `${command} 2>/dev/null || true` : command;
            
            streamCallback?.(finalCommand + '\n');
            const { output } = await this.provider.runCommand({ args: { command: finalCommand } });
            streamCallback?.(output);
            return {
                output,
                success: true,
                error: null,
            };
        } catch (error) {
            console.error('Error running command:', error);
            return {
                output: '',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }

    async clear() {
        // probably need to be moved in `Provider.destroy()`
        this.terminalSessions.forEach((terminal) => {
            if (terminal.type === CLISessionType.TERMINAL) {
                terminal.terminal?.kill();
                if (terminal.xterm) {
                    terminal.xterm.dispose();
                }
            }
        });
        if (this.provider) {
            await this.provider.destroy();
        }
        this.provider = null;
        this.providerType = null;
        this.isConnecting = false;
        this.terminalSessions.clear();
    }
}
