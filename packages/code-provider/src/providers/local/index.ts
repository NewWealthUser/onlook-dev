import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import chokidar, { type FSWatcher } from 'chokidar';
import { existsSync } from 'fs';
import { promises as fs } from 'fs/promises';
import net from 'net';
import path from 'path';
import { randomUUID } from 'crypto';
import { once } from 'events';
import { EventEmitter } from 'events';
import {
    Provider,
    ProviderBackgroundCommand,
    ProviderFileWatcher,
    ProviderTask,
    ProviderTerminal,
    type CopyFileOutput,
    type CopyFilesInput,
    type CreateProjectInput,
    type CreateProjectOutput,
    type CreateSessionInput,
    type CreateSessionOutput,
    type CreateTerminalInput,
    type CreateTerminalOutput,
    type DeleteFilesInput,
    type DeleteFilesOutput,
    type DownloadFilesInput,
    type DownloadFilesOutput,
    type GetTaskInput,
    type GetTaskOutput,
    type GitStatusInput,
    type GitStatusOutput,
    type InitializeInput,
    type InitializeOutput,
    type ListFilesInput,
    type ListFilesOutput,
    type ListFilesOutputFile,
    type ListProjectsInput,
    type ListProjectsOutput,
    type PauseProjectInput,
    type PauseProjectOutput,
    type ReadFileInput,
    type ReadFileOutput,
    type RenameFileInput,
    type RenameFileOutput,
    type SetupInput,
    type SetupOutput,
    type StatFileInput,
    type StatFileOutput,
    type StopProjectInput,
    type StopProjectOutput,
    type TerminalBackgroundCommandInput,
    type TerminalBackgroundCommandOutput,
    type TerminalCommandInput,
    type TerminalCommandOutput,
    type WatchEvent,
    type WatchFilesInput,
    type WatchFilesOutput,
    type WriteFileInput,
    type WriteFileOutput,
} from '../../types';

const DEFAULT_MAX_LOG_LINES = 200;
const LOG_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
});

type LogLevel = 'info' | 'warn' | 'error';

export interface LocalSandboxLogEntry {
    level: LogLevel;
    message: string;
    timestamp: Date;
}

export interface LocalProviderGetSession {
    sandboxId: string;
    port: number;
    previewUrl: string;
    projectPath: string;
}

export interface LocalProviderOptions {
    sandboxId: string;
    projectPath: string;
    preferredPort?: number;
    command?: {
        bin: string;
        args: string[];
    };
    projectsRoot?: string;
    env?: Record<string, string>;
    maxLogLines?: number;
    getSession?: (sandboxId: string) => Promise<LocalProviderGetSession>;
}

export interface LocalCreateSessionOutput extends CreateSessionOutput {
    sandboxId: string;
    port: number;
    previewUrl: string;
    projectPath: string;
}

const DEFAULT_COMMAND = {
    bin: 'bun',
    args: ['run', 'dev'],
};

const DEFAULT_PREFERRED_PORT = 3000;

function normalizeProjectPath(projectPath: string) {
    return path.resolve(projectPath);
}

async function ensureDirectoryExists(dirPath: string) {
    await fs.mkdir(dirPath, { recursive: true });
}

async function findAvailablePort(startPort: number, attempts = 20): Promise<number> {
    let port = startPort;
    for (let i = 0; i < attempts; i++) {
        const available = await new Promise<boolean>((resolve) => {
            const server = net.createServer();
            server.once('error', () => {
                server.close(() => resolve(false));
            });
            server.once('listening', () => {
                server.close(() => resolve(true));
            });
            server.listen(port, '127.0.0.1');
        });
        if (available) {
            return port;
        }
        port += 1;
    }
    return port;
}

function detectLogLevel(message: string, source: 'stdout' | 'stderr'): LogLevel {
    if (source === 'stderr') {
        return 'error';
    }
    const lower = message.toLowerCase();
    if (lower.includes('error')) {
        return 'error';
    }
    if (lower.includes('warn')) {
        return 'warn';
    }
    return 'info';
}

function formatLogEntry(entry: LocalSandboxLogEntry): string {
    const timestamp = LOG_TIMESTAMP_FORMATTER.format(entry.timestamp);
    return `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
}

function toSandboxRelativePath(root: string, targetPath: string) {
    const relative = path.relative(root, targetPath);
    return relative === '' ? '.' : relative.replace(/\\/g, '/');
}

function buildListFilesOutput(dirents: ListFilesOutputFile[]): ListFilesOutput {
    return { files: dirents };
}

function ensureCommand(options: LocalProviderOptions): { bin: string; args: string[] } {
    if (options.command) {
        return options.command;
    }
    return DEFAULT_COMMAND;
}

class LocalSandboxRuntime extends EventEmitter {
    readonly sandboxId: string;
    readonly projectPath: string;
    readonly maxLogLines: number;
    private preferredPort: number;
    private process: ChildProcessWithoutNullStreams | null = null;
    private startPromise: Promise<void> | null = null;
    private stopPromise: Promise<void> | null = null;
    private resolvedPort: number | null = null;
    private readonly command: { bin: string; args: string[] };
    private readonly env: Record<string, string>;
    private readonly logBuffer: LocalSandboxLogEntry[] = [];

    constructor(options: LocalProviderOptions) {
        super();
        this.sandboxId = options.sandboxId;
        this.projectPath = normalizeProjectPath(options.projectPath);
        this.preferredPort = options.preferredPort ?? DEFAULT_PREFERRED_PORT;
        this.command = ensureCommand(options);
        this.env = options.env ?? {};
        this.maxLogLines = options.maxLogLines ?? DEFAULT_MAX_LOG_LINES;
    }

    get port(): number {
        return this.resolvedPort ?? this.preferredPort;
    }

    get isRunning(): boolean {
        return Boolean(this.process);
    }

    private appendLog(level: LogLevel, message: string) {
        const logEntry: LocalSandboxLogEntry = {
            level,
            message,
            timestamp: new Date(),
        };
        this.logBuffer.push(logEntry);
        if (this.logBuffer.length > this.maxLogLines) {
            this.logBuffer.splice(0, this.logBuffer.length - this.maxLogLines);
        }
        this.emit('log', logEntry);
    }

    async ensureStarted(): Promise<void> {
        if (this.process) {
            return;
        }
        if (this.startPromise) {
            await this.startPromise;
            return;
        }
        this.startPromise = this.spawnProcess();
        try {
            await this.startPromise;
        } finally {
            this.startPromise = null;
        }
    }

    private async spawnProcess(): Promise<void> {
        await ensureDirectoryExists(this.projectPath);
        this.resolvedPort = await findAvailablePort(this.preferredPort);
        const env = {
            ...process.env,
            ...this.env,
            PORT: String(this.resolvedPort),
            FORCE_COLOR: '1',
        } as NodeJS.ProcessEnv;
        this.appendLog('info', `Starting sandbox on port ${this.resolvedPort}`);
        const child = spawn(this.command.bin, this.command.args, {
            cwd: this.projectPath,
            env,
        });
        this.process = child;

        child.stdout?.on('data', (data: Buffer) => {
            const content = data.toString();
            content.split(/\r?\n/).filter(Boolean).forEach((line) => {
                const level = detectLogLevel(line, 'stdout');
                this.appendLog(level, line);
            });
        });

        child.stderr?.on('data', (data: Buffer) => {
            const content = data.toString();
            content.split(/\r?\n/).filter(Boolean).forEach((line) => {
                const level = detectLogLevel(line, 'stderr');
                this.appendLog(level, line);
            });
        });

        child.on('exit', (code, signal) => {
            const reason = code !== null ? `code ${code}` : `signal ${signal}`;
            this.appendLog('warn', `Sandbox exited with ${reason}`);
            this.process = null;
        });
    }

    async stop(): Promise<void> {
        if (!this.process) {
            return;
        }
        if (this.stopPromise) {
            await this.stopPromise;
            return;
        }
        this.stopPromise = new Promise<void>((resolve) => {
            const child = this.process;
            if (!child) {
                resolve();
                return;
            }
            const onExit = () => {
                child.removeListener('exit', onExit);
                this.process = null;
                resolve();
            };
            child.once('exit', onExit);
            child.kill('SIGTERM');
            setTimeout(() => {
                if (this.process) {
                    this.appendLog('warn', 'Force killing sandbox process after timeout');
                    child.kill('SIGKILL');
                }
            }, 5000);
        });
        try {
            await this.stopPromise;
        } finally {
            this.stopPromise = null;
        }
    }

    async restart(): Promise<void> {
        await this.stop();
        await this.ensureStarted();
        this.appendLog('info', 'Sandbox restarted');
    }

    getLogs(level: LogLevel | 'all' = 'all'): LocalSandboxLogEntry[] {
        if (level === 'all') {
            return [...this.logBuffer];
        }
        return this.logBuffer.filter((entry) => entry.level === level);
    }

    onLog(listener: (entry: LocalSandboxLogEntry) => void, level: LogLevel | 'all' = 'all'): () => void {
        const wrapped = (entry: LocalSandboxLogEntry) => {
            if (level === 'all' || entry.level === level) {
                listener(entry);
            }
        };
        this.on('log', wrapped);
        return () => {
            this.off('log', wrapped);
        };
    }
}

class LocalRuntimeRegistry {
    private static runtimes = new Map<string, LocalSandboxRuntime>();

    static getOrCreate(options: LocalProviderOptions): LocalSandboxRuntime {
        const existing = this.runtimes.get(options.sandboxId);
        if (existing) {
            return existing;
        }
        const runtime = new LocalSandboxRuntime(options);
        this.runtimes.set(options.sandboxId, runtime);
        return runtime;
    }

    static get(sandboxId: string): LocalSandboxRuntime | undefined {
        return this.runtimes.get(sandboxId);
    }

    static remove(sandboxId: string): void {
        this.runtimes.delete(sandboxId);
    }
}

class LocalFileWatcher extends ProviderFileWatcher {
    private watcher: FSWatcher | null = null;
    private callback: ((event: WatchEvent) => Promise<void>) | null = null;

    constructor(private readonly projectPath: string) {
        super();
    }

    async start(input: WatchFilesInput): Promise<void> {
        const { path: targetPath, recursive, excludes } = input.args;
        const watchPath = path.resolve(this.projectPath, targetPath);
        const ignored = excludes?.map((exclude) => path.resolve(this.projectPath, exclude)) ?? [];
        this.watcher = chokidar.watch(watchPath, {
            ignoreInitial: true,
            persistent: true,
            depth: recursive ? undefined : 0,
            ignored,
        });
        this.watcher.on('all', async (event, filePath) => {
            if (!this.callback) {
                return;
            }
            const relative = toSandboxRelativePath(this.projectPath, filePath);
            if (event === 'add' || event === 'addDir') {
                await this.callback({ type: 'add', paths: [relative] });
            } else if (event === 'change') {
                await this.callback({ type: 'change', paths: [relative] });
            } else if (event === 'unlink' || event === 'unlinkDir') {
                await this.callback({ type: 'remove', paths: [relative] });
            }
        });
    }

    registerEventCallback(callback: (event: WatchEvent) => Promise<void>): void {
        this.callback = callback;
    }

    async stop(): Promise<void> {
        await this.watcher?.close();
        this.watcher = null;
        this.callback = null;
    }
}

class LocalTerminal extends ProviderTerminal {
    private readonly terminalId: string = randomUUID();
    private readonly projectPath: string;
    private process: ChildProcessWithoutNullStreams | null = null;
    private listeners = new Set<(data: string) => void>();

    constructor(projectPath: string) {
        super();
        this.projectPath = projectPath;
    }

    get id(): string {
        return this.terminalId;
    }

    get name(): string {
        return 'local-terminal';
    }

    private async ensureProcess(): Promise<ChildProcessWithoutNullStreams> {
        if (this.process) {
            return this.process;
        }
        const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : 'bash');
        const args = process.platform === 'win32' ? ['-NoLogo'] : ['-i'];
        const child = spawn(shell, args, {
            cwd: this.projectPath,
            env: {
                ...process.env,
                FORCE_COLOR: '1',
            },
        });
        this.process = child;
        child.stdout?.on('data', (data: Buffer) => {
            const message = data.toString();
            this.listeners.forEach((listener) => listener(message));
        });
        child.stderr?.on('data', (data: Buffer) => {
            const message = data.toString();
            this.listeners.forEach((listener) => listener(message));
        });
        child.on('exit', () => {
            this.process = null;
        });
        return child;
    }

    async open(): Promise<string> {
        await this.ensureProcess();
        return '';
    }

    async write(input: string): Promise<void> {
        const proc = await this.ensureProcess();
        proc.stdin?.write(input);
    }

    async run(input: string): Promise<void> {
        const proc = await this.ensureProcess();
        proc.stdin?.write(`${input}\n`);
    }

    async kill(): Promise<void> {
        const proc = this.process;
        if (!proc) {
            return;
        }
        proc.kill('SIGTERM');
        await once(proc, 'exit');
        this.process = null;
    }

    onOutput(callback: (data: string) => void): () => void {
        this.listeners.add(callback);
        return () => {
            this.listeners.delete(callback);
        };
    }
}

class LocalDevTask extends ProviderTask {
    constructor(private readonly runtime: LocalSandboxRuntime) {
        super();
    }

    get id(): string {
        return 'dev';
    }

    get name(): string {
        return 'Dev Server';
    }

    get command(): string {
        return 'bun run dev';
    }

    async open(): Promise<string> {
        const logs = this.runtime.getLogs('all');
        return logs.map(formatLogEntry).join('\n');
    }

    async run(): Promise<void> {
        await this.runtime.ensureStarted();
    }

    async restart(): Promise<void> {
        await this.runtime.restart();
    }

    async stop(): Promise<void> {
        await this.runtime.stop();
    }

    onOutput(callback: (data: string) => void): () => void {
        return this.runtime.onLog((entry) => {
            callback(formatLogEntry(entry));
        });
    }
}

class LocalBackgroundCommand extends ProviderBackgroundCommand {
    constructor(private readonly runtime: LocalSandboxRuntime) {
        super();
    }

    get name(): string | undefined {
        return 'local-dev-server';
    }

    get command(): string {
        return 'bun run dev';
    }

    async open(): Promise<string> {
        return this.runtime.getLogs('all').map(formatLogEntry).join('\n');
    }

    async restart(): Promise<void> {
        await this.runtime.restart();
    }

    async kill(): Promise<void> {
        await this.runtime.stop();
    }

    onOutput(callback: (data: string) => void): () => void {
        return this.runtime.onLog((entry) => callback(formatLogEntry(entry)));
    }
}

function detectSandboxFileType(buffer: Buffer): 'binary' | 'text' {
    const sample = buffer.subarray(0, Math.min(buffer.length, 512));
    for (const byte of sample) {
        if (byte === 0) {
            return 'binary';
        }
    }
    return 'text';
}

async function readSandboxFile(root: string, filePath: string) {
    const absolute = path.resolve(root, filePath);
    const data = await fs.readFile(absolute);
    const type = detectSandboxFileType(data);
    if (type === 'binary') {
        return {
            type: 'binary' as const,
            path: filePath,
            content: new Uint8Array(data),
            toString: () => '',
        };
    }
    const content = data.toString('utf8');
    return {
        type: 'text' as const,
        path: filePath,
        content,
        toString: () => content,
    };
}

export class LocalProvider extends Provider {
    private readonly options: LocalProviderOptions;
    private runtime: LocalSandboxRuntime;

    constructor(options: LocalProviderOptions) {
        super();
        this.options = {
            ...options,
            projectPath: normalizeProjectPath(options.projectPath),
        };
        this.runtime = LocalRuntimeRegistry.getOrCreate(this.options);
    }

    private get projectPath() {
        return this.options.projectPath;
    }

    async initialize(input: InitializeInput): Promise<InitializeOutput> {
        await ensureDirectoryExists(this.projectPath);
        if (this.options.getSession) {
            const session = await this.options.getSession(this.options.sandboxId);
            this.runtime = LocalRuntimeRegistry.getOrCreate({
                ...this.options,
                preferredPort: session.port,
            });
            await this.runtime.ensureStarted();
        }
        return {};
    }

    async writeFile(input: WriteFileInput): Promise<WriteFileOutput> {
        const { path: targetPath, content } = input.args;
        const absolute = path.resolve(this.projectPath, targetPath);
        await ensureDirectoryExists(path.dirname(absolute));
        if (typeof content === 'string') {
            await fs.writeFile(absolute, content, 'utf8');
        } else {
            await fs.writeFile(absolute, Buffer.from(content));
        }
        return { success: true };
    }

    async renameFile(input: RenameFileInput): Promise<RenameFileOutput> {
        const absoluteOld = path.resolve(this.projectPath, input.args.oldPath);
        const absoluteNew = path.resolve(this.projectPath, input.args.newPath);
        await ensureDirectoryExists(path.dirname(absoluteNew));
        await fs.rename(absoluteOld, absoluteNew);
        return {};
    }

    async statFile(input: StatFileInput): Promise<StatFileOutput> {
        const absolute = path.resolve(this.projectPath, input.args.path);
        const stats = await fs.stat(absolute);
        return {
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            mtime: stats.mtimeMs,
            ctime: stats.ctimeMs,
            atime: stats.atimeMs,
        };
    }

    async deleteFiles(input: DeleteFilesInput): Promise<DeleteFilesOutput> {
        const absolute = path.resolve(this.projectPath, input.args.path);
        const recursive = input.args.recursive ?? false;
        await fs.rm(absolute, { recursive, force: true });
        return {};
    }

    async listFiles(input: ListFilesInput): Promise<ListFilesOutput> {
        const absolute = path.resolve(this.projectPath, input.args.path);
        const dirents = await fs.readdir(absolute, { withFileTypes: true });
        const files: ListFilesOutputFile[] = dirents.map((dirent) => ({
            name: dirent.name,
            type: dirent.isDirectory() ? 'directory' : 'file',
            isSymlink: dirent.isSymbolicLink(),
        }));
        return buildListFilesOutput(files);
    }

    async readFile(input: ReadFileInput): Promise<ReadFileOutput> {
        const file = await readSandboxFile(this.projectPath, input.args.path);
        return { file };
    }

    async downloadFiles(input: DownloadFilesInput): Promise<DownloadFilesOutput> {
        return { url: undefined };
    }

    async copyFiles(input: CopyFilesInput): Promise<CopyFileOutput> {
        const source = path.resolve(this.projectPath, input.args.sourcePath);
        const target = path.resolve(this.projectPath, input.args.targetPath);
        await ensureDirectoryExists(path.dirname(target));
        await fs.cp(source, target, { recursive: input.args.recursive ?? false, force: input.args.overwrite ?? false });
        return {};
    }

    async watchFiles(input: WatchFilesInput): Promise<WatchFilesOutput> {
        const watcher = new LocalFileWatcher(this.projectPath);
        await watcher.start(input);
        return { watcher };
    }

    async createTerminal(input: CreateTerminalInput): Promise<CreateTerminalOutput> {
        const terminal = new LocalTerminal(this.projectPath);
        await terminal.open();
        return { terminal };
    }

    async getTask(input: GetTaskInput): Promise<GetTaskOutput> {
        if (input.args.id !== 'dev') {
            throw new Error(`Unsupported task id: ${input.args.id}`);
        }
        await this.runtime.ensureStarted();
        return { task: new LocalDevTask(this.runtime) };
    }

    async runCommand(input: TerminalCommandInput): Promise<TerminalCommandOutput> {
        const command = input.args.command;
        const child = spawn(command, {
            cwd: this.projectPath,
            shell: true,
        });
        let output = '';
        let error = '';
        child.stdout?.on('data', (data: Buffer) => {
            output += data.toString();
        });
        child.stderr?.on('data', (data: Buffer) => {
            error += data.toString();
        });
        const exitCode: number = await new Promise((resolve) => {
            child.on('close', (code) => resolve(code ?? 0));
        });
        if (exitCode !== 0) {
            return { output, error };
        }
        return { output };
    }

    async runBackgroundCommand(
        input: TerminalBackgroundCommandInput,
    ): Promise<TerminalBackgroundCommandOutput> {
        return { command: new LocalBackgroundCommand(this.runtime) };
    }

    async gitStatus(input: GitStatusInput): Promise<GitStatusOutput> {
        const child = spawn('git', ['status', '--porcelain'], {
            cwd: this.projectPath,
        });
        const chunks: string[] = [];
        child.stdout?.on('data', (data: Buffer) => {
            chunks.push(data.toString());
        });
        await once(child, 'close');
        const output = chunks.join('');
        const changedFiles = output
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        return { changedFiles };
    }

    async setup(input: SetupInput): Promise<SetupOutput> {
        return {};
    }

    async createSession(input: CreateSessionInput): Promise<LocalCreateSessionOutput> {
        await this.runtime.ensureStarted();
        return {
            sandboxId: this.options.sandboxId,
            port: this.runtime.port,
            previewUrl: `http://localhost:${this.runtime.port}`,
            projectPath: this.projectPath,
        };
    }

    async reload(): Promise<boolean> {
        await this.runtime.restart();
        return true;
    }

    async reconnect(): Promise<void> {
        await this.runtime.ensureStarted();
    }

    async ping(): Promise<boolean> {
        return this.runtime.isRunning;
    }

    static async createProject(input: CreateProjectInput): Promise<CreateProjectOutput> {
        const projectPath = path.resolve('./onlook-projects', input.id);
        await ensureDirectoryExists(projectPath);
        return { id: input.id };
    }

    static async createProjectFromGit(input: { repoUrl: string; branch: string; }): Promise<CreateProjectOutput> {
        throw new Error('createProjectFromGit is not implemented for LocalProvider');
    }

    async pauseProject(input: PauseProjectInput): Promise<PauseProjectOutput> {
        await this.runtime.stop();
        return {};
    }

    async stopProject(input: StopProjectInput): Promise<StopProjectOutput> {
        await this.runtime.stop();
        LocalRuntimeRegistry.remove(this.options.sandboxId);
        return {};
    }

    async listProjects(input: ListProjectsInput): Promise<ListProjectsOutput> {
        const projectsRoot = this.options.projectsRoot ?? path.resolve(this.projectPath, '..');
        if (!existsSync(projectsRoot)) {
            return {} as ListProjectsOutput;
        }
        const entries = await fs.readdir(projectsRoot, { withFileTypes: true });
        const projects = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => ({
                id: entry.name,
                path: path.join(projectsRoot, entry.name),
            }));
        return { projects } as unknown as ListProjectsOutput;
    }

    async destroy(): Promise<void> {
        // keep runtime alive for preview; explicit stop handled elsewhere
    }

    getDevServerLogs(level: LogLevel | 'all' = 'all'): LocalSandboxLogEntry[] {
        return this.runtime.getLogs(level);
    }

    subscribeToDevServerLogs(
        callback: (entry: LocalSandboxLogEntry) => void,
        level: LogLevel | 'all' = 'all',
    ): () => void {
        return this.runtime.onLog(callback, level);
    }
}

export type { LogLevel as LocalSandboxLogLevel };
