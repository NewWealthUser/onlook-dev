import { promises as fs, Dirent, constants as fsConstants } from 'fs';
import path from 'path';
import { z } from 'zod';
import { DefaultSettings } from '@onlook/constants';
import type { ChatSuggestion } from '@onlook/models';

export interface LocalBrandColor {
  id: string;
  value: string;
  label?: string;
}

export interface LocalBrandFont {
  id: string;
  family: string;
  files: string[];
  styles?: string[];
  weights?: string[];
  displayName?: string;
}

export interface LocalBrandState {
  colors: LocalBrandColor[];
  fonts: LocalBrandFont[];
  updatedAt: string;
}
import path from 'path';
import { z } from 'zod';
import { DefaultSettings } from '@onlook/constants';
import type { ChatSuggestion } from '@onlook/models';

export interface LocalBrandColor {
  id: string;
  value: string;
  label?: string;
}

export interface LocalBrandFont {
  id: string;
  family: string;
  files: string[];
  styles?: string[];
  weights?: string[];
  displayName?: string;
}

export interface LocalBrandState {
  colors: LocalBrandColor[];
  fonts: LocalBrandFont[];
  updatedAt: string;
}
import path from 'path';
import { z } from 'zod';
import type { ChatSuggestion } from '@onlook/models';

export interface LocalBrandColor {
  id: string;
  value: string;
  label?: string;
}

export interface LocalBrandFont {
  id: string;
  family: string;
  files: string[];
  styles?: string[];
  weights?: string[];
  displayName?: string;
}

export interface LocalBrandState {
  colors: LocalBrandColor[];
  fonts: LocalBrandFont[];
  updatedAt: string;
}
import path from 'path';
import { z } from 'zod';

export interface LocalBrandColor {
  id: string;
  value: string;
  label?: string;
}

export interface LocalBrandFont {
  id: string;
  family: string;
  files: string[];
  styles?: string[];
  weights?: string[];
  displayName?: string;
}

export interface LocalBrandState {
  colors: LocalBrandColor[];
  fonts: LocalBrandFont[];
  updatedAt: string;
}
import { promises as fs, Dirent } from 'fs';
import path from 'path';

export interface LocalProject {
  id: string;
  name: string;
  description?: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  previewImgUrl?: string | null;
  previewImgPath?: string | null;
  sandboxId?: string | null;
  sandboxUrl?: string | null;
  version: number;
  brand: LocalBrandState;
}

export interface LocalBrandUpdate {
  colors?: LocalBrandColor[];
  fonts?: LocalBrandFont[];
}

export interface LocalBranch {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  sandboxId?: string | null;
  sandboxUrl?: string | null;
}

export interface LocalCanvasState {
  scale: number;
  position: { x: number; y: number };
}

export interface LocalCanvas {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  frames: LocalFrame[];
  state: LocalCanvasState;
}

export interface LocalFrame {
  id: string;
  projectId: string;
  canvasId: string;
  branchId: string;
  name: string;
  position: { x: number; y: number };
  dimension: { width: number; height: number };
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalConversation {
  id: string;
  projectId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  suggestions: ChatSuggestion[];
}

export type LocalConversationMessageRole = 'user' | 'assistant' | 'system';

export interface LocalConversationMessage {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
  role: LocalConversationMessageRole;
  context: unknown[];
  parts: unknown[];
  checkpoints: unknown[];
  applied?: boolean | null;
  commitOid?: string | null;
  snapshots?: unknown;
}

interface LocalConversationFile extends LocalConversation {
  version: number;
  messages: LocalConversationMessage[];
}

export class LocalStorage {
  private projectsDir: string;

  private readonly ready: Promise<void>;

  private readonly projectDirIndex = new Map<string, string>();

  private readonly largeAssetHintedProjects = new Set<string>();

  private static readonly PROJECT_META_VERSION = 2;
  private static readonly CONVERSATION_FILE_VERSION = 1;

  private static readonly brandSchema = z
    .object({
      colors: z
        .array(
          z.object({
            id: z.string(),
            value: z.string(),
            label: z.string().optional(),
          })
        )
        .default([]),
      fonts: z
        .array(
          z.object({
            id: z.string(),
            family: z.string(),
            files: z.array(z.string()).default([]),
            styles: z.array(z.string()).optional(),
            weights: z.array(z.string()).optional(),
            displayName: z.string().optional(),
          })
        )
        .default([]),
      updatedAt: z.string().default(() => new Date().toISOString()),
    })
    .default({ colors: [], fonts: [], updatedAt: new Date().toISOString() });

  private static readonly projectMetaSchema = z
    .object({
      version: z
        .number()
        .int()
        .positive()
        .default(LocalStorage.PROJECT_META_VERSION),
      id: z.string(),
      name: z.string(),
      description: z.string().optional().nullable(),
      tags: z.array(z.string()).default([]),
      createdAt: z.string(),
      updatedAt: z.string(),
      previewImgUrl: z.string().optional().nullable(),
      previewImgPath: z.string().optional().nullable(),
      sandboxId: z.string().optional().nullable(),
      sandboxUrl: z.string().optional().nullable(),
      brand: LocalStorage.brandSchema,
    })
    .transform((data) => ({
      ...data,
      description: data.description ?? undefined,
      previewImgUrl: data.previewImgUrl ?? undefined,
      previewImgPath: data.previewImgPath ?? undefined,
      sandboxId: data.sandboxId ?? undefined,
      sandboxUrl: data.sandboxUrl ?? undefined,
    }));

  private static readonly canvasStateSchema = z
    .object({
      scale: z.coerce.number().default(() => DefaultSettings.SCALE),
      position: z
        .object({
          x: z.coerce.number(),
          y: z.coerce.number(),
        })
        .default(() => ({
          x: DefaultSettings.PAN_POSITION.x,
          y: DefaultSettings.PAN_POSITION.y,
        })),
    })
    .transform((state): LocalCanvasState => ({
      scale: state.scale,
      position: {
        x: state.position.x,
        y: state.position.y,
      },
    }));

  private static readonly canvasFrameSchema = z.object({
    id: z.string(),
    projectId: z.string(),
    canvasId: z.string(),
    branchId: z.string(),
    name: z.string().default('Frame'),
    position: z.object({
      x: z.coerce.number(),
      y: z.coerce.number(),
    }),
    dimension: z.object({
      width: z.coerce.number(),
      height: z.coerce.number(),
    }),
    url: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  });

  private static readonly canvasFileSchema = z
    .object({
      id: z.string(),
      projectId: z.string(),
      name: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      frames: z.array(LocalStorage.canvasFrameSchema).default([]),
      state: LocalStorage.canvasStateSchema.default(() =>
        LocalStorage.defaultCanvasState()
      ),
    })
    .transform((data): LocalCanvas => ({
      id: data.id,
      projectId: data.projectId,
      name: data.name,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      frames: data.frames.map((frame) => ({
        ...frame,
        name: frame.name ?? 'Frame',
      })),
      state: data.state,
    }));

  private static defaultCanvasState(): LocalCanvasState {
    return {
      scale: DefaultSettings.SCALE,
      position: {
        x: DefaultSettings.PAN_POSITION.x,
        y: DefaultSettings.PAN_POSITION.y,
      },
    };
  }

  private static readonly conversationMessageSchema = z.object({
    id: z.string(),
    conversationId: z.string(),
    content: z.string(),
    createdAt: z.string(),
    role: z.enum(['user', 'assistant', 'system']),
    context: z.array(z.unknown()).default([]),
    parts: z.array(z.unknown()).default([]),
    checkpoints: z.array(z.unknown()).default([]),
    applied: z.boolean().nullable().optional(),
    commitOid: z.string().nullable().optional(),
    snapshots: z.unknown().optional(),
  });

  private static readonly conversationFileSchema = z
    .object({
      version: z
        .number()
        .int()
        .positive()
        .default(LocalStorage.CONVERSATION_FILE_VERSION),
      id: z.string(),
      projectId: z.string(),
      title: z.string().nullable().optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
      suggestions: z.array(z.unknown()).default([]),
      messages: z.array(LocalStorage.conversationMessageSchema).default([]),
    })
    .transform((data): LocalConversationFile => ({
      version: data.version ?? LocalStorage.CONVERSATION_FILE_VERSION,
      id: data.id,
      projectId: data.projectId,
      title: data.title ?? null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      suggestions: (data.suggestions ?? []) as ChatSuggestion[],
      messages: data.messages.map((message) => ({
        ...message,
        context: message.context ?? [],
        parts: message.parts ?? [],
        checkpoints: message.checkpoints ?? [],
      })),
    }));

  constructor(projectsDir?: string) {
    this.projectsDir = projectsDir ?? '';
    this.ready = this.initialize(projectsDir).catch((error) => {
      console.error('Failed to initialize local storage directory:', error);
      throw error;
    });
  }

  private static readonly PERMISSIONS_DOC_PATH = 'docs/macos-permissions.md';

  private async initialize(providedPath?: string): Promise<void> {
    const resolvedProjectsDir =
      providedPath ?? (await LocalStorage.resolveDefaultProjectsDir());

    this.projectsDir = resolvedProjectsDir;
    await this.ensureAccess(this.projectsDir, {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });
    await this.refreshProjectIndex();
  }

  private static async resolveDefaultProjectsDir(): Promise<string> {
    try {
      const { env } = await import('../../../apps/web/client/src/env');
      return env.ONLOOK_PROJECTS_DIR;
    } catch (error) {
      const fallback = process.env.ONLOOK_PROJECTS_DIR;
      if (fallback && fallback.trim()) {
        return LocalStorage.expandHomePath(fallback);
      }

      const home = process.env.HOME;
      return home ? path.join(home, 'Onlook Projects') : './onlook-projects';
    }
  }

  private static expandHomePath(rawValue: string): string {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return trimmed;
    }

    const homeDirectory = process.env.HOME;
    if (!homeDirectory) {
      return trimmed;
    }

    if (trimmed === '~') {
      return homeDirectory;
    }

    if (trimmed.startsWith('~/')) {
      return path.join(homeDirectory, trimmed.slice(2));
    }

    if (trimmed.startsWith('$HOME')) {
      const remainder = trimmed.slice('$HOME'.length);
      if (!remainder) {
        return homeDirectory;
      }

      return path.join(homeDirectory, remainder.replace(/^[/\\]/, ''));
    }

    return trimmed;
  }

  private static getErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const maybeErrno = error as Partial<NodeJS.ErrnoException>;
    return typeof maybeErrno.code === 'string' ? maybeErrno.code : undefined;
  }

  private static isPermissionError(error: unknown): boolean {
    const code = LocalStorage.getErrorCode(error);
    return code === 'EACCES' || code === 'EPERM';
  }

  private static permissionDocLink(anchor?: string): string {
    if (!anchor) {
      return LocalStorage.PERMISSIONS_DOC_PATH;
    }

    return `${LocalStorage.PERMISSIONS_DOC_PATH}#${anchor}`;
  }

  private static formatPermissionMessage(
    targetPath: string,
    intent: 'read' | 'write'
  ): string {
    const action = intent === 'write' ? 'write to' : 'read from';
    return [
      `Onlook cannot ${action} "${targetPath}" due to macOS permissions.`,
      'Grant Full Disk Access to your terminal (or the Onlook app) under',
      'System Settings → Privacy & Security → Full Disk Access, then retry.',
      `See ${LocalStorage.permissionDocLink('full-disk-access')} for a walkthrough.`,
    ].join(' ');
  }

  private static formatMissingPathMessage(
    targetPath: string,
    kind: 'directory' | 'file'
  ): string {
    return [
      `The configured ${kind} "${targetPath}" does not exist.`,
      'Create it (use mkdir -p for directories) or update ONLOOK_PROJECTS_DIR',
      `to point to a valid location. See ${LocalStorage.permissionDocLink(
        'projects-root-layout'
      )} for the expected tree.`,
    ].join(' ');
  }

  private static formatNotDirectoryMessage(targetPath: string): string {
    return [
      `Expected a directory at "${targetPath}" but found a file.`,
      'Move or remove the file, recreate the folder, and rerun the command.',
      `See ${LocalStorage.permissionDocLink('projects-root-layout')} for details.`,
    ].join(' ');
  }

  private static formatGenericAccessMessage(
    targetPath: string,
    error: unknown
  ): string {
    const reason = error instanceof Error ? error.message : String(error);
    return [
      `Unable to access "${targetPath}": ${reason}.`,
      `See ${LocalStorage.permissionDocLink()} for troubleshooting steps.`,
    ].join(' ');
  }

  private async ensureAccess(
    targetPath: string,
    options: {
      intent?: 'read' | 'write';
      createIfMissing?: boolean;
      kind?: 'directory' | 'file';
    } = {}
  ): Promise<void> {
    const { intent = 'read', createIfMissing = false, kind = 'directory' } = options;
    const resolvedPath = path.resolve(targetPath);
    const mode =
      intent === 'write' ? fsConstants.W_OK | fsConstants.R_OK : fsConstants.R_OK;

    try {
      await fs.access(resolvedPath, mode);
    } catch (error) {
      const code = LocalStorage.getErrorCode(error);
      if (code === 'ENOENT') {
        if (createIfMissing && kind === 'directory') {
          try {
            await fs.mkdir(resolvedPath, { recursive: true });
            await fs.access(resolvedPath, mode);
          } catch (creationError) {
            if (LocalStorage.isPermissionError(creationError)) {
              throw new Error(LocalStorage.formatPermissionMessage(resolvedPath, intent));
            }

            throw new Error(
              LocalStorage.formatGenericAccessMessage(resolvedPath, creationError)
            );
          }

          return;
        }

        throw new Error(LocalStorage.formatMissingPathMessage(resolvedPath, kind));
      }

      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(resolvedPath, intent));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(resolvedPath, error));
    }

    if (kind === 'directory') {
      try {
        const stats = await fs.stat(resolvedPath);
        if (!stats.isDirectory()) {
          throw new Error(LocalStorage.formatNotDirectoryMessage(resolvedPath));
        }
      } catch (error) {
        const code = LocalStorage.getErrorCode(error);
        if (code === 'ENOENT') {
          throw new Error(LocalStorage.formatMissingPathMessage(resolvedPath, kind));
        }

        if (LocalStorage.isPermissionError(error)) {
          throw new Error(LocalStorage.formatPermissionMessage(resolvedPath, intent));
        }

        throw new Error(LocalStorage.formatGenericAccessMessage(resolvedPath, error));
      }
    }
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  private static defaultBrandState(): LocalBrandState {
    const now = new Date().toISOString();
    return { colors: [], fonts: [], updatedAt: now };
  }

  private async writeProjectMeta(
    projectDir: string,
    project: LocalProject
  ): Promise<void> {
    const metaPath = this.getMetaPathFromDir(projectDir);
    await this.writeFileSafely(metaPath, JSON.stringify(project, null, 2));
  }

  private async writeFileSafely(
    targetPath: string,
    content: string | Uint8Array
  ): Promise<void> {
    const directory = path.dirname(targetPath);
    await this.ensureAccess(directory, {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });

    try {
      await fs.writeFile(targetPath, content);
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(targetPath, 'write'));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(targetPath, error));
    }
  }

  private normalizeProjectName(name: string | undefined): string {
    const fallback = 'Untitled Project';
    if (!name) {
      return fallback;
    }

    const trimmed = name.trim();
    return trimmed || fallback;
  }

  private toDirectoryName(name: string): string {
    const normalized = this.normalizeProjectName(name);
    const sanitized = normalized.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
    const withoutTrailing = sanitized.replace(/[. ]+$/g, '');
    return withoutTrailing || 'Untitled Project';
  }

  private getMetaPathFromDir(projectDir: string): string {
    return path.join(projectDir, 'meta.json');
  }

  private async readProjectMeta(projectDir: string): Promise<LocalProject | null> {
    try {
      const data = await fs.readFile(this.getMetaPathFromDir(projectDir), 'utf-8');
      const raw = JSON.parse(data) as unknown;
      const parsed = LocalStorage.projectMetaSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(
          '[onlook-local-storage] Failed to parse project meta, ignoring project',
          parsed.error
        );
        return null;
      }

      const needsMigration =
        (typeof raw === 'object' && raw !== null &&
          (raw as Record<string, unknown>).version !== LocalStorage.PROJECT_META_VERSION) ||
        !(typeof raw === 'object' && raw !== null && 'brand' in (raw as Record<string, unknown>));

      const project: LocalProject = {
        ...parsed.data,
        version: LocalStorage.PROJECT_META_VERSION,
        brand: {
          ...parsed.data.brand,
          updatedAt: parsed.data.brand.updatedAt || new Date().toISOString(),
        },
      };

      if (needsMigration) {
        await this.writeProjectMeta(projectDir, project);
      }

      return project;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(
            this.getMetaPathFromDir(projectDir),
            'read'
          )
        );
      }
      return null;
    }
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async refreshProjectIndex(): Promise<void> {
    this.projectDirIndex.clear();

    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(this.projectsDir, 'read'));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(this.projectsDir, error));
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectDir = path.join(this.projectsDir, entry.name);
      const project = await this.readProjectMeta(projectDir);
      if (project) {
        this.projectDirIndex.set(project.id, projectDir);
      }
    }
  }

  private async getProjectDir(projectId: string): Promise<string | null> {
    const existing = this.projectDirIndex.get(projectId);
    if (existing) {
      return existing;
    }

    await this.refreshProjectIndex();
    return this.projectDirIndex.get(projectId) ?? null;
  }

  private async requireProjectDir(projectId: string): Promise<string> {
    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      throw new Error(`Project directory not found for id ${projectId}`);
    }
    return projectDir;
  }

  private async ensureProjectStructure(projectDir: string): Promise<void> {
    await this.ensureAccess(projectDir, {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });

    const directories = ['files', 'canvases', 'conversations', 'previews', 'assets', 'branches'];
    for (const directory of directories) {
      const target = path.join(projectDir, directory);
      await this.ensureAccess(target, {
        intent: 'write',
        createIfMissing: true,
        kind: 'directory',
      });
    }

    await this.maybeRecommendAssetSymlink(path.join(projectDir, 'assets'));
  }

  private async maybeRecommendAssetSymlink(assetDir: string): Promise<void> {
    const resolvedAssetDir = path.resolve(assetDir);
    if (this.largeAssetHintedProjects.has(resolvedAssetDir)) {
      return;
    }

    const thresholdBytes = 200 * 1024 * 1024;

    try {
      const entries = await fs.readdir(resolvedAssetDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        const entryPath = path.join(resolvedAssetDir, entry.name);
        try {
          const stats = await fs.stat(entryPath);
          if (stats.size >= thresholdBytes) {
            this.largeAssetHintedProjects.add(resolvedAssetDir);
            const sizeInMb = stats.size / (1024 * 1024);
            console.warn(
              `[onlook-local-storage] "${entryPath}" is ${sizeInMb.toFixed(
                1
              )}MB. Consider symlinking large binaries into the assets folder instead of copying them. See ${LocalStorage.permissionDocLink(
                'large-assets-and-symlinks'
              )} for guidance.`
            );
            break;
          }
        } catch (statError) {
          if (LocalStorage.isPermissionError(statError)) {
            throw new Error(LocalStorage.formatPermissionMessage(entryPath, 'read'));
          }
        }
      }
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(resolvedAssetDir, 'read'));
      }
      // Ignore missing directories; ensureAccess already created them when needed.
    }
  }

  private async getUniqueProjectDir(
    baseName: string,
    currentProjectId?: string
  ): Promise<{ dirName: string; dirPath: string }> {
    const targetDir = currentProjectId
      ? await this.getProjectDir(currentProjectId)
      : null;

    let attempt = 0;
    let candidateName = baseName;

    while (true) {
      const candidatePath = path.join(this.projectsDir, candidateName);
      if (!(await this.pathExists(candidatePath))) {
        return { dirName: candidateName, dirPath: candidatePath };
      }

      if (targetDir && path.resolve(candidatePath) === path.resolve(targetDir)) {
        return { dirName: candidateName, dirPath: candidatePath };
      }

      attempt += 1;
      candidateName = `${baseName} (${attempt})`;
    }
  }

  // Project operations
  async createProject(
    project: Omit<LocalProject, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'brand'>
  ): Promise<LocalProject> {
    await this.ensureReady();

    const now = new Date().toISOString();
    const name = this.normalizeProjectName(project.name);
    const directoryBase = this.toDirectoryName(name);
    const { dirPath } = await this.getUniqueProjectDir(directoryBase);

    await this.ensureProjectStructure(dirPath);

    const id = this.generateId();
    const fullProject: LocalProject = {
      ...project,
      name,
      id,
      createdAt: now,
      updatedAt: now,
      version: LocalStorage.PROJECT_META_VERSION,
      brand: LocalStorage.defaultBrandState(),
    };

    await this.writeProjectMeta(dirPath, fullProject);

    this.projectDirIndex.set(id, dirPath);

    await this.ensureDefaultBranch(fullProject, dirPath);

    return fullProject;
  }

  async getProject(projectId: string): Promise<LocalProject | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const project = await this.readProjectMeta(projectDir);
    if (!project) {
      return null;
    }

    await this.ensureProjectStructure(projectDir);
    return project;
  }

  async updateProject(
    projectId: string,
    updates: Partial<Omit<LocalProject, 'id' | 'createdAt' | 'version'>>
  ): Promise<LocalProject | null> {
    await this.ensureReady();

    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const now = new Date().toISOString();
    const brandUpdate =
      'brand' in updates && updates.brand
        ? {
            colors: updates.brand.colors ?? project.brand.colors,
            fonts: updates.brand.fonts ?? project.brand.fonts,
            updatedAt: new Date().toISOString(),
          }
        : project.brand;

    const updatedProject: LocalProject = {
      ...project,
      ...updates,
      brand: brandUpdate,
      name: updates.name ? this.normalizeProjectName(updates.name) : project.name,
      updatedAt: now,
      version: LocalStorage.PROJECT_META_VERSION,
    };

    const currentDir = await this.requireProjectDir(projectId);
    const targetDirName = this.toDirectoryName(updatedProject.name);
    const { dirPath: targetDir } = await this.getUniqueProjectDir(
      targetDirName,
      projectId
    );

    if (path.resolve(currentDir) !== path.resolve(targetDir)) {
      await this.ensureAccess(path.dirname(targetDir), {
        intent: 'write',
        createIfMissing: true,
        kind: 'directory',
      });

      try {
        await fs.rename(currentDir, targetDir);
      } catch (error) {
        if (LocalStorage.isPermissionError(error)) {
          throw new Error(LocalStorage.formatPermissionMessage(targetDir, 'write'));
        }

        throw new Error(LocalStorage.formatGenericAccessMessage(targetDir, error));
      }
      this.projectDirIndex.set(projectId, targetDir);
    }

    await this.ensureProjectStructure(targetDir);
    await this.writeProjectMeta(targetDir, updatedProject);

    return updatedProject;
  }

  async updateBrand(
    projectId: string,
    updates: LocalBrandUpdate
  ): Promise<LocalProject | null> {
    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const now = new Date().toISOString();
    const updatedProject: LocalProject = {
      ...project,
      brand: {
        colors: updates.colors ?? project.brand.colors,
        fonts: updates.fonts ?? project.brand.fonts,
        updatedAt: now,
      },
      updatedAt: now,
      version: LocalStorage.PROJECT_META_VERSION,
    };

    const projectDir = await this.requireProjectDir(projectId);
    await this.writeProjectMeta(projectDir, updatedProject);
    return updatedProject;
  }

  private getBranchPath(projectDir: string, branchId: string): string {
    return path.join(projectDir, 'branches', `${branchId}.json`);
  }

  private getConversationPath(projectDir: string, conversationId: string): string {
    return path.join(projectDir, 'conversations', `${conversationId}.json`);
  }

  private async ensureDefaultBranch(
    project: LocalProject,
    projectDir: string
  ): Promise<void> {
    const branches = await this.listBranches(project.id);
    if (branches.length > 0) {
      return;
    }

    const defaultBranch: Omit<LocalBranch, 'id' | 'createdAt' | 'updatedAt'> = {
      projectId: project.id,
      name: 'main',
      description: null,
      isDefault: true,
      sandboxId: null,
      sandboxUrl: null,
    };

    const now = new Date().toISOString();
    const branch: LocalBranch = {
      ...defaultBranch,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
    };

    await this.writeFileSafely(
      this.getBranchPath(projectDir, branch.id),
      JSON.stringify(branch, null, 2)
    );
  }

  async createBranch(
    projectId: string,
    branch: Omit<LocalBranch, 'id' | 'createdAt' | 'updatedAt' | 'projectId'>
  ): Promise<LocalBranch> {
    await this.ensureReady();

    const projectDir = await this.requireProjectDir(projectId);
    await this.ensureAccess(path.join(projectDir, 'branches'), {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });

    const now = new Date().toISOString();
    const id = this.generateId();
    const fullBranch: LocalBranch = {
      ...branch,
      projectId,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.writeFileSafely(
      this.getBranchPath(projectDir, id),
      JSON.stringify(fullBranch, null, 2)
    );

    return fullBranch;
  }

  async listBranches(projectId: string): Promise<LocalBranch[]> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return [];
    }

    await this.ensureAccess(path.join(projectDir, 'branches'), {
      intent: 'read',
      createIfMissing: true,
      kind: 'directory',
    });

    try {
      const entries = await fs.readdir(path.join(projectDir, 'branches'), {
        withFileTypes: true,
      });

      const branches: LocalBranch[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(projectDir, 'branches', entry.name);
        try {
          const raw = await fs.readFile(filePath, 'utf-8');
          branches.push(JSON.parse(raw) as LocalBranch);
        } catch (error) {
          if (LocalStorage.isPermissionError(error)) {
            throw new Error(LocalStorage.formatPermissionMessage(filePath, 'read'));
          }
          console.warn('[onlook-local-storage] Failed to parse branch file', filePath, error);
        }
      }

      return branches.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(path.join(projectDir, 'branches'), 'read')
        );
      }

      throw new Error(
        LocalStorage.formatGenericAccessMessage(path.join(projectDir, 'branches'), error)
      );
    }
  }

  async updateBranch(
    projectId: string,
    branchId: string,
    updates: Partial<Omit<LocalBranch, 'id' | 'projectId' | 'createdAt'>>
  ): Promise<LocalBranch | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const branchPath = this.getBranchPath(projectDir, branchId);
    try {
      const raw = await fs.readFile(branchPath, 'utf-8');
      const branch = JSON.parse(raw) as LocalBranch;
      const updated: LocalBranch = {
        ...branch,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await this.writeFileSafely(branchPath, JSON.stringify(updated, null, 2));
      return updated;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(branchPath, 'write'));
      }
      return null;
    }
  }

  async deleteBranch(projectId: string, branchId: string): Promise<boolean> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return false;
    }

    const branchPath = this.getBranchPath(projectDir, branchId);
    try {
      await fs.rm(branchPath, { force: true });
      return true;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(branchPath, 'write'));
      }
      return false;
    }
  }

  private async writeCanvasFile(
    projectDir: string,
    canvas: LocalCanvas
  ): Promise<void> {
    const normalized = LocalStorage.canvasFileSchema.parse({
      ...canvas,
      state: {
        scale: canvas.state.scale,
        position: {
          x: canvas.state.position.x,
          y: canvas.state.position.y,
        },
      },
      frames: canvas.frames.map((frame) => ({
        ...frame,
        position: {
          x: frame.position.x,
          y: frame.position.y,
        },
        dimension: {
          width: frame.dimension.width,
          height: frame.dimension.height,
        },
      })),
    });

    await this.writeFileSafely(
      path.join(projectDir, 'canvases', `${normalized.id}.json`),
      JSON.stringify(normalized, null, 2)
    );
  }

  private async maybeMigrateLegacyFrames(
    projectDir: string,
    canvas: LocalCanvas
  ): Promise<LocalCanvas> {
    if (canvas.frames.length > 0) {
      return canvas;
    }

    const legacyDir = path.join(projectDir, 'frames');
    if (!(await this.pathExists(legacyDir))) {
      return canvas;
    }

    let migrated = false;
    const migratedFrames: LocalFrame[] = [];

    let entries: Dirent[];
    try {
      entries = await fs.readdir(legacyDir, { withFileTypes: true });
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(legacyDir, 'read'));
      }
      return canvas;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(legacyDir, entry.name);
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = LocalStorage.canvasFrameSchema.parse({
          projectId: canvas.projectId,
          canvasId: canvas.id,
          ...JSON.parse(raw),
        });

        if (parsed.canvasId !== canvas.id) {
          continue;
        }

        migratedFrames.push({
          ...parsed,
          projectId: parsed.projectId ?? canvas.projectId,
        });
        migrated = true;
        await fs.rm(filePath, { force: true }).catch(() => undefined);
      } catch (error) {
        if (LocalStorage.isPermissionError(error)) {
          throw new Error(LocalStorage.formatPermissionMessage(filePath, 'read'));
        }
        console.warn('[onlook-local-storage] Failed to migrate legacy frame file', filePath, error);
      }
    }

    if (!migrated || migratedFrames.length === 0) {
      return canvas;
    }

    const updatedCanvas: LocalCanvas = {
      ...canvas,
      frames: migratedFrames,
      updatedAt: new Date().toISOString(),
    };

    await this.writeCanvasFile(projectDir, updatedCanvas);
    return updatedCanvas;
  }

  async createFrame(
    frame: Omit<LocalFrame, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<LocalFrame> {
    await this.ensureReady();

    const projectDir = await this.requireProjectDir(frame.projectId);
    const canvas = await this.getCanvas(frame.projectId, frame.canvasId);

    if (!canvas) {
      throw new Error(`Canvas ${frame.canvasId} not found for project ${frame.projectId}`);
    }

    const now = new Date().toISOString();
    const id = this.generateId();
    const fullFrame: LocalFrame = {
      ...frame,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const updatedCanvas: LocalCanvas = {
      ...canvas,
      updatedAt: now,
      frames: [...canvas.frames, fullFrame],
    };

    await this.writeCanvasFile(projectDir, updatedCanvas);

    return fullFrame;
  }

  async listFrames(
    projectId: string,
    filters: { canvasId?: string; branchId?: string } = {}
  ): Promise<LocalFrame[]> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return [];
    }

    if (filters.canvasId) {
      const canvas = await this.getCanvas(projectId, filters.canvasId);
      if (!canvas) {
        return [];
      }

      return canvas.frames
        .filter((frame) =>
          filters.branchId ? frame.branchId === filters.branchId : true
        )
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    const canvases = await this.listCanvases(projectId);
    const frames = canvases.flatMap((canvas) => canvas.frames);

    return frames
      .filter((frame) => (filters.branchId ? frame.branchId === filters.branchId : true))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async updateFrame(
    projectId: string,
    frameId: string,
    updates: Partial<Omit<LocalFrame, 'id' | 'projectId' | 'createdAt'>>
  ): Promise<LocalFrame | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const canvases = await this.listCanvases(projectId);
    for (const canvas of canvases) {
      const index = canvas.frames.findIndex((frame) => frame.id === frameId);
      if (index === -1) {
        continue;
      }

      const existing = canvas.frames[index]!;
      const updated: LocalFrame = {
        ...existing,
        ...updates,
        position: updates.position ?? existing.position,
        dimension: updates.dimension ?? existing.dimension,
        canvasId: updates.canvasId ?? existing.canvasId,
        branchId: updates.branchId ?? existing.branchId,
        url: updates.url ?? existing.url,
        name: updates.name ?? existing.name,
        updatedAt: new Date().toISOString(),
      };

      const updatedCanvas: LocalCanvas = {
        ...canvas,
        updatedAt: updated.updatedAt,
        frames: [
          ...canvas.frames.slice(0, index),
          updated,
          ...canvas.frames.slice(index + 1),
        ],
      };

      await this.writeCanvasFile(projectDir, updatedCanvas);
      return updated;
    }

    return null;
  }

  async deleteFrame(projectId: string, frameId: string): Promise<boolean> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return false;
    }

    const canvases = await this.listCanvases(projectId);
    for (const canvas of canvases) {
      const index = canvas.frames.findIndex((frame) => frame.id === frameId);
      if (index === -1) {
        continue;
      }
  }

  private async refreshProjectIndex(): Promise<void> {
    this.projectDirIndex.clear();

    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(this.projectsDir, 'read'));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(this.projectsDir, error));
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectDir = path.join(this.projectsDir, entry.name);
      const project = await this.readProjectMeta(projectDir);
      if (project) {
        this.projectDirIndex.set(project.id, projectDir);
      }
    }
  }

  private async getProjectDir(projectId: string): Promise<string | null> {
    const existing = this.projectDirIndex.get(projectId);
    if (existing) {
      return existing;
    }

    await this.refreshProjectIndex();
    return this.projectDirIndex.get(projectId) ?? null;
  }

  private async requireProjectDir(projectId: string): Promise<string> {
    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      throw new Error(`Project directory not found for id ${projectId}`);
    }
    return projectDir;
  }

  private async ensureProjectStructure(projectDir: string): Promise<void> {
    await this.ensureAccess(projectDir, {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });

    const directories = ['files', 'canvases', 'conversations', 'previews', 'assets', 'branches'];
    for (const directory of directories) {
      const target = path.join(projectDir, directory);
      await this.ensureAccess(target, {
        intent: 'write',
        createIfMissing: true,
        kind: 'directory',
      });
    }

    await this.maybeRecommendAssetSymlink(path.join(projectDir, 'assets'));
  }

  private async maybeRecommendAssetSymlink(assetDir: string): Promise<void> {
    const resolvedAssetDir = path.resolve(assetDir);
    if (this.largeAssetHintedProjects.has(resolvedAssetDir)) {
      return;
    }

    const thresholdBytes = 200 * 1024 * 1024;

    try {
      const entries = await fs.readdir(resolvedAssetDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        const entryPath = path.join(resolvedAssetDir, entry.name);
        try {
          const stats = await fs.stat(entryPath);
          if (stats.size >= thresholdBytes) {
            this.largeAssetHintedProjects.add(resolvedAssetDir);
            const sizeInMb = stats.size / (1024 * 1024);
            console.warn(
              `[onlook-local-storage] "${entryPath}" is ${sizeInMb.toFixed(
                1
              )}MB. Consider symlinking large binaries into the assets folder instead of copying them. See ${LocalStorage.permissionDocLink(
                'large-assets-and-symlinks'
              )} for guidance.`
            );
            break;
          }
        } catch (statError) {
          if (LocalStorage.isPermissionError(statError)) {
            throw new Error(LocalStorage.formatPermissionMessage(entryPath, 'read'));
          }
        }
      }
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(resolvedAssetDir, 'read'));
      }
      // Ignore missing directories; ensureAccess already created them when needed.
    }
  }

  private async getUniqueProjectDir(
    baseName: string,
    currentProjectId?: string
  ): Promise<{ dirName: string; dirPath: string }> {
    const targetDir = currentProjectId
      ? await this.getProjectDir(currentProjectId)
      : null;

    let attempt = 0;
    let candidateName = baseName;

    while (true) {
      const candidatePath = path.join(this.projectsDir, candidateName);
      if (!(await this.pathExists(candidatePath))) {
        return { dirName: candidateName, dirPath: candidatePath };
      }

      if (targetDir && path.resolve(candidatePath) === path.resolve(targetDir)) {
        return { dirName: candidateName, dirPath: candidatePath };
      }

      attempt += 1;
      candidateName = `${baseName} (${attempt})`;
    }
  }

  // Project operations
  async createProject(
    project: Omit<LocalProject, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'brand'>
  ): Promise<LocalProject> {
    await this.ensureReady();

    const now = new Date().toISOString();
    const name = this.normalizeProjectName(project.name);
    const directoryBase = this.toDirectoryName(name);
    const { dirPath } = await this.getUniqueProjectDir(directoryBase);

    await this.ensureProjectStructure(dirPath);

    const id = this.generateId();
    const fullProject: LocalProject = {
      ...project,
      name,
      id,
      createdAt: now,
      updatedAt: now,
      version: LocalStorage.PROJECT_META_VERSION,
      brand: LocalStorage.defaultBrandState(),
    };

    await this.writeProjectMeta(dirPath, fullProject);

    this.projectDirIndex.set(id, dirPath);

    await this.ensureDefaultBranch(fullProject, dirPath);

      const updatedCanvas: LocalCanvas = {
        ...canvas,
        updatedAt: new Date().toISOString(),
        frames: [
          ...canvas.frames.slice(0, index),
          ...canvas.frames.slice(index + 1),
        ],
      };

      await this.writeCanvasFile(projectDir, updatedCanvas);
      return true;
    }

    return false;
  }

  async findFrame(
    frameId: string
  ): Promise<{ frame: LocalFrame; canvas: LocalCanvas; projectId: string } | null> {
  async getProject(projectId: string): Promise<LocalProject | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const project = await this.readProjectMeta(projectDir);
    if (!project) {
      return null;
    }

    await this.ensureProjectStructure(projectDir);
    return project;
  }

  async updateProject(
    projectId: string,
    updates: Partial<Omit<LocalProject, 'id' | 'createdAt' | 'version'>>
  ): Promise<LocalProject | null> {
    await this.ensureReady();

    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const now = new Date().toISOString();
    const brandUpdate =
      'brand' in updates && updates.brand
        ? {
            colors: updates.brand.colors ?? project.brand.colors,
            fonts: updates.brand.fonts ?? project.brand.fonts,
            updatedAt: new Date().toISOString(),
          }
        : project.brand;

    const updatedProject: LocalProject = {
      ...project,
      ...updates,
      brand: brandUpdate,
      name: updates.name ? this.normalizeProjectName(updates.name) : project.name,
      updatedAt: now,
      version: LocalStorage.PROJECT_META_VERSION,
    };

    const currentDir = await this.requireProjectDir(projectId);
    const targetDirName = this.toDirectoryName(updatedProject.name);
    const { dirPath: targetDir } = await this.getUniqueProjectDir(
      targetDirName,
      projectId
    );

    if (path.resolve(currentDir) !== path.resolve(targetDir)) {
      await this.ensureAccess(path.dirname(targetDir), {
        intent: 'write',
        createIfMissing: true,
        kind: 'directory',
      });

      try {
        await fs.rename(currentDir, targetDir);
      } catch (error) {
        if (LocalStorage.isPermissionError(error)) {
          throw new Error(LocalStorage.formatPermissionMessage(targetDir, 'write'));
        }

        throw new Error(LocalStorage.formatGenericAccessMessage(targetDir, error));
      }
      this.projectDirIndex.set(projectId, targetDir);
    }

    await this.ensureProjectStructure(targetDir);
    await this.writeProjectMeta(targetDir, updatedProject);

    return updatedProject;
  }

  async updateBrand(
    projectId: string,
    updates: LocalBrandUpdate
  ): Promise<LocalProject | null> {
    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const now = new Date().toISOString();
    const updatedProject: LocalProject = {
      ...project,
      brand: {
        colors: updates.colors ?? project.brand.colors,
        fonts: updates.fonts ?? project.brand.fonts,
        updatedAt: now,
      },
      updatedAt: now,
      version: LocalStorage.PROJECT_META_VERSION,
    };

    const projectDir = await this.requireProjectDir(projectId);
    await this.writeProjectMeta(projectDir, updatedProject);
    return updatedProject;
  }

  private getBranchPath(projectDir: string, branchId: string): string {
    return path.join(projectDir, 'branches', `${branchId}.json`);
  }

  private getConversationPath(projectDir: string, conversationId: string): string {
    return path.join(projectDir, 'conversations', `${conversationId}.json`);
  }

  private async ensureDefaultBranch(
    project: LocalProject,
    projectDir: string
  ): Promise<void> {
    const branches = await this.listBranches(project.id);
    if (branches.length > 0) {
      return;
    }

    const defaultBranch: Omit<LocalBranch, 'id' | 'createdAt' | 'updatedAt'> = {
      projectId: project.id,
      name: 'main',
      description: null,
      isDefault: true,
      sandboxId: null,
      sandboxUrl: null,
    };

    const now = new Date().toISOString();
    const branch: LocalBranch = {
      ...defaultBranch,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
    };

    await this.writeFileSafely(
      this.getBranchPath(projectDir, branch.id),
      JSON.stringify(branch, null, 2)
    );
  }

  async createBranch(
    projectId: string,
    branch: Omit<LocalBranch, 'id' | 'createdAt' | 'updatedAt' | 'projectId'>
  ): Promise<LocalBranch> {
    await this.ensureReady();

    const projectDir = await this.requireProjectDir(projectId);
    await this.ensureAccess(path.join(projectDir, 'branches'), {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });

    const now = new Date().toISOString();
    const id = this.generateId();
    const fullBranch: LocalBranch = {
      ...branch,
      projectId,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.writeFileSafely(
      this.getBranchPath(projectDir, id),
      JSON.stringify(fullBranch, null, 2)
    );

    return fullBranch;
  }

  async listBranches(projectId: string): Promise<LocalBranch[]> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return [];
    }

    await this.ensureAccess(path.join(projectDir, 'branches'), {
      intent: 'read',
      createIfMissing: true,
      kind: 'directory',
    });

    try {
      const entries = await fs.readdir(path.join(projectDir, 'branches'), {
        withFileTypes: true,
      });

      const branches: LocalBranch[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(projectDir, 'branches', entry.name);
        try {
          const raw = await fs.readFile(filePath, 'utf-8');
          branches.push(JSON.parse(raw) as LocalBranch);
        } catch (error) {
          if (LocalStorage.isPermissionError(error)) {
            throw new Error(LocalStorage.formatPermissionMessage(filePath, 'read'));
          }
          console.warn('[onlook-local-storage] Failed to parse branch file', filePath, error);
        }
      }

      return branches.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(path.join(projectDir, 'branches'), 'read')
        );
      }

      throw new Error(
        LocalStorage.formatGenericAccessMessage(path.join(projectDir, 'branches'), error)
      );
    }
  }

  async updateBranch(
    projectId: string,
    branchId: string,
    updates: Partial<Omit<LocalBranch, 'id' | 'projectId' | 'createdAt'>>
  ): Promise<LocalBranch | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const branchPath = this.getBranchPath(projectDir, branchId);
    try {
      const raw = await fs.readFile(branchPath, 'utf-8');
      const branch = JSON.parse(raw) as LocalBranch;
      const updated: LocalBranch = {
        ...branch,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await this.writeFileSafely(branchPath, JSON.stringify(updated, null, 2));
      return updated;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(branchPath, 'write'));
      }
      return null;
    }
  }

  async deleteBranch(projectId: string, branchId: string): Promise<boolean> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return false;
    }

    const branchPath = this.getBranchPath(projectDir, branchId);
    try {
      await fs.rm(branchPath, { force: true });
      return true;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(branchPath, 'write'));
      }
      return false;
    }
  }

  private async writeCanvasFile(
    projectDir: string,
    canvas: LocalCanvas
  ): Promise<void> {
    const normalized = LocalStorage.canvasFileSchema.parse({
      ...canvas,
      state: {
        scale: canvas.state.scale,
        position: {
          x: canvas.state.position.x,
          y: canvas.state.position.y,
        },
      },
      frames: canvas.frames.map((frame) => ({
        ...frame,
        position: {
          x: frame.position.x,
          y: frame.position.y,
        },
        dimension: {
          width: frame.dimension.width,
          height: frame.dimension.height,
        },
      })),
    });

    await this.writeFileSafely(
      path.join(projectDir, 'canvases', `${normalized.id}.json`),
      JSON.stringify(normalized, null, 2)
    );
  }

  private async maybeMigrateLegacyFrames(
    projectDir: string,
    canvas: LocalCanvas
  ): Promise<LocalCanvas> {
    if (canvas.frames.length > 0) {
      return canvas;
    }

    const legacyDir = path.join(projectDir, 'frames');
    if (!(await this.pathExists(legacyDir))) {
      return canvas;
    }

    let migrated = false;
    const migratedFrames: LocalFrame[] = [];

    let entries: Dirent[];
    try {
      entries = await fs.readdir(legacyDir, { withFileTypes: true });
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(legacyDir, 'read'));
      }
      return canvas;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(legacyDir, entry.name);
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = LocalStorage.canvasFrameSchema.parse({
          projectId: canvas.projectId,
          canvasId: canvas.id,
          ...JSON.parse(raw),
        });

        if (parsed.canvasId !== canvas.id) {
          continue;
        }

        migratedFrames.push({
          ...parsed,
          projectId: parsed.projectId ?? canvas.projectId,
        });
        migrated = true;
        await fs.rm(filePath, { force: true }).catch(() => undefined);
      } catch (error) {
        if (LocalStorage.isPermissionError(error)) {
          throw new Error(LocalStorage.formatPermissionMessage(filePath, 'read'));
        }
        console.warn('[onlook-local-storage] Failed to migrate legacy frame file', filePath, error);
      }
    }

    if (!migrated || migratedFrames.length === 0) {
      return canvas;
    }

    const updatedCanvas: LocalCanvas = {
      ...canvas,
      frames: migratedFrames,
      updatedAt: new Date().toISOString(),
    };

    await this.writeCanvasFile(projectDir, updatedCanvas);
    return updatedCanvas;

export interface LocalConversation {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export class LocalStorage {
  private projectsDir: string;

  private readonly ready: Promise<void>;

  private readonly projectDirIndex = new Map<string, string>();

  private readonly largeAssetHintedProjects = new Set<string>();

  private static readonly PROJECT_META_VERSION = 2;

  private static readonly brandSchema = z
    .object({
      colors: z
        .array(
          z.object({
            id: z.string(),
            value: z.string(),
            label: z.string().optional(),
          })
        )
        .default([]),
      fonts: z
        .array(
          z.object({
            id: z.string(),
            family: z.string(),
            files: z.array(z.string()).default([]),
            styles: z.array(z.string()).optional(),
            weights: z.array(z.string()).optional(),
            displayName: z.string().optional(),
          })
        )
        .default([]),
      updatedAt: z.string().default(() => new Date().toISOString()),
    })
    .default({ colors: [], fonts: [], updatedAt: new Date().toISOString() });

  private static readonly projectMetaSchema = z
    .object({
      version: z
        .number()
        .int()
        .positive()
        .default(LocalStorage.PROJECT_META_VERSION),
      id: z.string(),
      name: z.string(),
      description: z.string().optional().nullable(),
      tags: z.array(z.string()).default([]),
      createdAt: z.string(),
      updatedAt: z.string(),
      previewImgUrl: z.string().optional().nullable(),
      previewImgPath: z.string().optional().nullable(),
      sandboxId: z.string().optional().nullable(),
      sandboxUrl: z.string().optional().nullable(),
      brand: LocalStorage.brandSchema,
    })
    .transform((data) => ({
      ...data,
      description: data.description ?? undefined,
      previewImgUrl: data.previewImgUrl ?? undefined,
      previewImgPath: data.previewImgPath ?? undefined,
      sandboxId: data.sandboxId ?? undefined,
      sandboxUrl: data.sandboxUrl ?? undefined,
    }));

  constructor(projectsDir?: string) {
    this.projectsDir = projectsDir ?? '';
    this.ready = this.initialize(projectsDir).catch((error) => {
      console.error('Failed to initialize local storage directory:', error);
      throw error;
    });
  }

  private static readonly PERMISSIONS_DOC_PATH = 'docs/macos-permissions.md';

  private async initialize(providedPath?: string): Promise<void> {
    const resolvedProjectsDir =
      providedPath ?? (await LocalStorage.resolveDefaultProjectsDir());

    this.projectsDir = resolvedProjectsDir;
    await this.ensureAccess(this.projectsDir, {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });
    await this.refreshProjectIndex();
  }

  private static async resolveDefaultProjectsDir(): Promise<string> {
    try {
      const { env } = await import('../../../apps/web/client/src/env');
      return env.ONLOOK_PROJECTS_DIR;
    } catch (error) {
      const fallback = process.env.ONLOOK_PROJECTS_DIR;
      if (fallback && fallback.trim()) {
        return LocalStorage.expandHomePath(fallback);
      }

      const home = process.env.HOME;
      return home ? path.join(home, 'Onlook Projects') : './onlook-projects';
    }
  }

  private static expandHomePath(rawValue: string): string {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return trimmed;
    }

    const homeDirectory = process.env.HOME;
    if (!homeDirectory) {
      return trimmed;
    }

    if (trimmed === '~') {
      return homeDirectory;
    }

    if (trimmed.startsWith('~/')) {
      return path.join(homeDirectory, trimmed.slice(2));
    }

    if (trimmed.startsWith('$HOME')) {
      const remainder = trimmed.slice('$HOME'.length);
      if (!remainder) {
        return homeDirectory;
      }

      return path.join(homeDirectory, remainder.replace(/^[/\\]/, ''));
    }

    return trimmed;
  }

  private static getErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const maybeErrno = error as Partial<NodeJS.ErrnoException>;
    return typeof maybeErrno.code === 'string' ? maybeErrno.code : undefined;
  }

  private static isPermissionError(error: unknown): boolean {
    const code = LocalStorage.getErrorCode(error);
    return code === 'EACCES' || code === 'EPERM';
  }

  private static permissionDocLink(anchor?: string): string {
    if (!anchor) {
      return LocalStorage.PERMISSIONS_DOC_PATH;
    }

    return `${LocalStorage.PERMISSIONS_DOC_PATH}#${anchor}`;
  }

  private static formatPermissionMessage(
    targetPath: string,
    intent: 'read' | 'write'
  ): string {
    const action = intent === 'write' ? 'write to' : 'read from';
    return [
      `Onlook cannot ${action} "${targetPath}" due to macOS permissions.`,
      'Grant Full Disk Access to your terminal (or the Onlook app) under',
      'System Settings → Privacy & Security → Full Disk Access, then retry.',
      `See ${LocalStorage.permissionDocLink('full-disk-access')} for a walkthrough.`,
    ].join(' ');
  }

  private static formatMissingPathMessage(
    targetPath: string,
    kind: 'directory' | 'file'
  ): string {
    return [
      `The configured ${kind} "${targetPath}" does not exist.`,
      'Create it (use mkdir -p for directories) or update ONLOOK_PROJECTS_DIR',
      `to point to a valid location. See ${LocalStorage.permissionDocLink(
        'projects-root-layout'
      )} for the expected tree.`,
    ].join(' ');
  }

  private static formatNotDirectoryMessage(targetPath: string): string {
    return [
      `Expected a directory at "${targetPath}" but found a file.`,
      'Move or remove the file, recreate the folder, and rerun the command.',
      `See ${LocalStorage.permissionDocLink('projects-root-layout')} for details.`,
    ].join(' ');
  }

  private static formatGenericAccessMessage(
    targetPath: string,
    error: unknown
  ): string {
    const reason = error instanceof Error ? error.message : String(error);
    return [
      `Unable to access "${targetPath}": ${reason}.`,
      `See ${LocalStorage.permissionDocLink()} for troubleshooting steps.`,
    ].join(' ');
  }

  private async ensureAccess(
    targetPath: string,
    options: {
      intent?: 'read' | 'write';
      createIfMissing?: boolean;
      kind?: 'directory' | 'file';
    } = {}
  ): Promise<void> {
    const { intent = 'read', createIfMissing = false, kind = 'directory' } = options;
    const resolvedPath = path.resolve(targetPath);
    const mode =
      intent === 'write' ? fsConstants.W_OK | fsConstants.R_OK : fsConstants.R_OK;

    try {
      await fs.access(resolvedPath, mode);
    } catch (error) {
      const code = LocalStorage.getErrorCode(error);
      if (code === 'ENOENT') {
        if (createIfMissing && kind === 'directory') {
          try {
            await fs.mkdir(resolvedPath, { recursive: true });
            await fs.access(resolvedPath, mode);
          } catch (creationError) {
            if (LocalStorage.isPermissionError(creationError)) {
              throw new Error(LocalStorage.formatPermissionMessage(resolvedPath, intent));
            }

            throw new Error(
              LocalStorage.formatGenericAccessMessage(resolvedPath, creationError)
            );
          }

          return;
        }

        throw new Error(LocalStorage.formatMissingPathMessage(resolvedPath, kind));
      }

      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(resolvedPath, intent));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(resolvedPath, error));
    }

    if (kind === 'directory') {
      try {
        const stats = await fs.stat(resolvedPath);
        if (!stats.isDirectory()) {
          throw new Error(LocalStorage.formatNotDirectoryMessage(resolvedPath));
        }
      } catch (error) {
        const code = LocalStorage.getErrorCode(error);
        if (code === 'ENOENT') {
          throw new Error(LocalStorage.formatMissingPathMessage(resolvedPath, kind));
        }

        if (LocalStorage.isPermissionError(error)) {
          throw new Error(LocalStorage.formatPermissionMessage(resolvedPath, intent));
        }

        throw new Error(LocalStorage.formatGenericAccessMessage(resolvedPath, error));
      }
    }
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  private static defaultBrandState(): LocalBrandState {
    const now = new Date().toISOString();
    return { colors: [], fonts: [], updatedAt: now };
  }

  private async writeProjectMeta(
    projectDir: string,
    project: LocalProject
  ): Promise<void> {
    const metaPath = this.getMetaPathFromDir(projectDir);
    await this.writeFileSafely(metaPath, JSON.stringify(project, null, 2));
  }

  private async writeFileSafely(
    targetPath: string,
    content: string | Uint8Array
  ): Promise<void> {
  private async writeFileSafely(targetPath: string, content: string): Promise<void> {
    const directory = path.dirname(targetPath);
    await this.ensureAccess(directory, {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });

    try {
      await fs.writeFile(targetPath, content);
      await fs.writeFile(targetPath, content, 'utf-8');
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(targetPath, 'write'));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(targetPath, error));
    }
  }

  private normalizeProjectName(name: string | undefined): string {
    const fallback = 'Untitled Project';
    if (!name) {
      return fallback;
    }

    const trimmed = name.trim();
    return trimmed || fallback;
  }

  private toDirectoryName(name: string): string {
    const normalized = this.normalizeProjectName(name);
    const sanitized = normalized.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
    const withoutTrailing = sanitized.replace(/[. ]+$/g, '');
    return withoutTrailing || 'Untitled Project';

  }

  private getMetaPathFromDir(projectDir: string): string {
    return path.join(projectDir, 'meta.json');
  }

  private async readProjectMeta(projectDir: string): Promise<LocalProject | null> {
    try {
      const data = await fs.readFile(this.getMetaPathFromDir(projectDir), 'utf-8');
      return JSON.parse(data) as LocalProject;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(
            this.getMetaPathFromDir(projectDir),
            'read'
          )
        );
      }
      return null;
    }
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async refreshProjectIndex(): Promise<void> {
    this.projectDirIndex.clear();

    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(this.projectsDir, 'read'));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(this.projectsDir, error));
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectDir = path.join(this.projectsDir, entry.name);
      const project = await this.readProjectMeta(projectDir);
      if (project) {
        this.projectDirIndex.set(project.id, projectDir);
      }
    }
  }

  private async getProjectDir(projectId: string): Promise<string | null> {
    const existing = this.projectDirIndex.get(projectId);
    if (existing) {
      return existing;
    }

    await this.refreshProjectIndex();
    return this.projectDirIndex.get(projectId) ?? null;
  }

  private async requireProjectDir(projectId: string): Promise<string> {
    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      throw new Error(`Project directory not found for id ${projectId}`);
    }
    return projectDir;
  }

  private async ensureProjectStructure(projectDir: string): Promise<void> {
    await this.ensureAccess(projectDir, {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });

    const directories = ['files', 'canvases', 'conversations', 'previews', 'assets'];
    for (const directory of directories) {
      const target = path.join(projectDir, directory);
      await this.ensureAccess(target, {
        intent: 'write',
        createIfMissing: true,
        kind: 'directory',
      });
    }

    await this.maybeRecommendAssetSymlink(path.join(projectDir, 'assets'));
  }

  private async maybeRecommendAssetSymlink(assetDir: string): Promise<void> {
    const resolvedAssetDir = path.resolve(assetDir);
    if (this.largeAssetHintedProjects.has(resolvedAssetDir)) {
      return;
    }

    const thresholdBytes = 200 * 1024 * 1024;

    try {
      const entries = await fs.readdir(resolvedAssetDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        const entryPath = path.join(resolvedAssetDir, entry.name);
        try {
          const stats = await fs.stat(entryPath);
          if (stats.size >= thresholdBytes) {
            this.largeAssetHintedProjects.add(resolvedAssetDir);
            const sizeInMb = stats.size / (1024 * 1024);
            console.warn(
              `[onlook-local-storage] "${entryPath}" is ${sizeInMb.toFixed(
                1
              )}MB. Consider symlinking large binaries into the assets folder instead of copying them. See ${LocalStorage.permissionDocLink(
                'large-assets-and-symlinks'
              )} for guidance.`
            );
            break;
          }
        } catch (statError) {
          if (LocalStorage.isPermissionError(statError)) {
            throw new Error(LocalStorage.formatPermissionMessage(entryPath, 'read'));
          }
        }
      }
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(resolvedAssetDir, 'read'));
      }
      // Ignore missing directories; ensureAccess already created them when needed.
    }
  }

  }

  private async initialize(providedPath?: string): Promise<void> {
    const resolvedProjectsDir =
      providedPath ?? (await LocalStorage.resolveDefaultProjectsDir());

    this.projectsDir = resolvedProjectsDir;

    await fs.mkdir(this.projectsDir, { recursive: true });
    await this.refreshProjectIndex();
  }

  private static async resolveDefaultProjectsDir(): Promise<string> {
    try {
      const { env } = await import('../../../apps/web/client/src/env');
      return env.ONLOOK_PROJECTS_DIR;
    } catch (error) {
      const fallback = process.env.ONLOOK_PROJECTS_DIR;
      if (fallback && fallback.trim()) {
        return LocalStorage.expandHomePath(fallback);
      }

      const home = process.env.HOME;
      return home ? path.join(home, 'Onlook Projects') : './onlook-projects';
    }
  }

  private static expandHomePath(rawValue: string): string {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return trimmed;
    }

    const homeDirectory = process.env.HOME;
    if (!homeDirectory) {
      return trimmed;
    }

    if (trimmed === '~') {
      return homeDirectory;
    }

    if (trimmed.startsWith('~/')) {
      return path.join(homeDirectory, trimmed.slice(2));
    }

    if (trimmed.startsWith('$HOME')) {
      const remainder = trimmed.slice('$HOME'.length);
      if (!remainder) {
        return homeDirectory;
      }

      return path.join(homeDirectory, remainder.replace(/^[/\\]/, ''));
    }

    return trimmed;
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  private normalizeProjectName(name: string | undefined): string {
    const fallback = 'Untitled Project';
    if (!name) {
      return fallback;
    }

    const trimmed = name.trim();
    return trimmed || fallback;
  }

  private toDirectoryName(name: string): string {
    const normalized = this.normalizeProjectName(name);
    const sanitized = normalized.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
    const withoutTrailing = sanitized.replace(/[. ]+$/g, '');
    return withoutTrailing || 'Untitled Project';
  }

  private getMetaPathFromDir(projectDir: string): string {
    return path.join(projectDir, 'meta.json');
  }

  private async readProjectMeta(projectDir: string): Promise<LocalProject | null> {
    try {
      const data = await fs.readFile(this.getMetaPathFromDir(projectDir), 'utf-8');
      const raw = JSON.parse(data) as unknown;
      const parsed = LocalStorage.projectMetaSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(
          '[onlook-local-storage] Failed to parse project meta, ignoring project',
          parsed.error
        );
        return null;
      }

      const needsMigration =
        (typeof raw === 'object' && raw !== null &&
          (raw as Record<string, unknown>).version !== LocalStorage.PROJECT_META_VERSION) ||
        !(typeof raw === 'object' && raw !== null && 'brand' in (raw as Record<string, unknown>));

      const project: LocalProject = {
        ...parsed.data,
        version: LocalStorage.PROJECT_META_VERSION,
        brand: {
          ...parsed.data.brand,
          updatedAt: parsed.data.brand.updatedAt || new Date().toISOString(),
        },
      };

      if (needsMigration) {
        await this.writeProjectMeta(projectDir, project);
      }

      return project;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(
            this.getMetaPathFromDir(projectDir),
            'read'
          )
        );
      }
      return JSON.parse(data) as LocalProject;
    } catch (error) {
      return null;
    }
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async refreshProjectIndex(): Promise<void> {
    this.projectDirIndex.clear();

    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(this.projectsDir, 'read'));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(this.projectsDir, error));
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectDir = path.join(this.projectsDir, entry.name);
      const project = await this.readProjectMeta(projectDir);
      if (project) {
        this.projectDirIndex.set(project.id, projectDir);
      }
    }
  }

  private async getProjectDir(projectId: string): Promise<string | null> {
    const existing = this.projectDirIndex.get(projectId);
    if (existing) {
      return existing;
    }

    await this.refreshProjectIndex();
    return this.projectDirIndex.get(projectId) ?? null;
  }

  private async requireProjectDir(projectId: string): Promise<string> {
    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      throw new Error(`Project directory not found for id ${projectId}`);
    }
    return projectDir;
  }

  private async ensureProjectStructure(projectDir: string): Promise<void> {
    await this.ensureAccess(projectDir, {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });

    const directories = ['files', 'canvases', 'conversations', 'previews', 'assets', 'branches'];
    for (const directory of directories) {
      const target = path.join(projectDir, directory);
      await this.ensureAccess(target, {
        intent: 'write',
        createIfMissing: true,
        kind: 'directory',
      });
    }

    await this.maybeRecommendAssetSymlink(path.join(projectDir, 'assets'));
  }

  private async maybeRecommendAssetSymlink(assetDir: string): Promise<void> {
    const resolvedAssetDir = path.resolve(assetDir);
    if (this.largeAssetHintedProjects.has(resolvedAssetDir)) {
      return;
    }

    const thresholdBytes = 200 * 1024 * 1024;

    try {
      const entries = await fs.readdir(resolvedAssetDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        const entryPath = path.join(resolvedAssetDir, entry.name);
        try {
          const stats = await fs.stat(entryPath);
          if (stats.size >= thresholdBytes) {
            this.largeAssetHintedProjects.add(resolvedAssetDir);
            const sizeInMb = stats.size / (1024 * 1024);
            console.warn(
              `[onlook-local-storage] "${entryPath}" is ${sizeInMb.toFixed(
                1
              )}MB. Consider symlinking large binaries into the assets folder instead of copying them. See ${LocalStorage.permissionDocLink(
                'large-assets-and-symlinks'
              )} for guidance.`
            );
            break;
          }
        } catch (statError) {
          if (LocalStorage.isPermissionError(statError)) {
            throw new Error(LocalStorage.formatPermissionMessage(entryPath, 'read'));
          }
        }
      }
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(resolvedAssetDir, 'read'));
      }
      // Ignore missing directories; ensureAccess already created them when needed.
    }
    const directories = ['files', 'canvases', 'conversations', 'previews', 'assets'];
    await Promise.all(
      directories.map((directory) =>
        fs.mkdir(path.join(projectDir, directory), { recursive: true })
      )
    );
  }

  private async getUniqueProjectDir(
    baseName: string,
    currentProjectId?: string
  ): Promise<{ dirName: string; dirPath: string }> {
    const targetDir = currentProjectId
      ? await this.getProjectDir(currentProjectId)
      : null;

    let attempt = 0;
    let candidateName = baseName;

    while (true) {
      const candidatePath = path.join(this.projectsDir, candidateName);
      if (!(await this.pathExists(candidatePath))) {
        return { dirName: candidateName, dirPath: candidatePath };
      }

      if (targetDir && path.resolve(candidatePath) === path.resolve(targetDir)) {
        return { dirName: candidateName, dirPath: candidatePath };
      }

      attempt += 1;
      candidateName = `${baseName} (${attempt})`;
    }
  }

  // Project operations
  async createProject(
    project: Omit<LocalProject, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'brand'>
    project: Omit<LocalProject, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<LocalProject> {
    await this.ensureReady();

    const now = new Date().toISOString();
    const name = this.normalizeProjectName(project.name);
    const directoryBase = this.toDirectoryName(name);
    const { dirPath } = await this.getUniqueProjectDir(directoryBase);


    await fs.mkdir(dirPath, { recursive: true });
    await this.ensureProjectStructure(dirPath);

    const id = this.generateId();
    const fullProject: LocalProject = {
      ...project,
      name,
      id,
      createdAt: now,
      updatedAt: now,
      version: LocalStorage.PROJECT_META_VERSION,
      brand: LocalStorage.defaultBrandState(),
    };

    await this.writeProjectMeta(dirPath, fullProject);

    this.projectDirIndex.set(id, dirPath);

    await this.ensureDefaultBranch(fullProject, dirPath);
    await this.writeFileSafely(
    await fs.writeFile(
      this.getMetaPathFromDir(dirPath),
      JSON.stringify(fullProject, null, 2)
    );

    this.projectDirIndex.set(id, dirPath);

    return fullProject;
  }

  async getProject(projectId: string): Promise<LocalProject | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

      return null;
    }

    const project = await this.readProjectMeta(projectDir);
    if (!project) {
      return null;
    }

      return null;
    }

    const project = await this.readProjectMeta(projectDir);
    if (!project) {
      return null;
    }

    await this.ensureProjectStructure(projectDir);
    return project;
  }

  async updateProject(
    projectId: string,
    updates: Partial<Omit<LocalProject, 'id' | 'createdAt' | 'version'>>
    updates: Partial<Omit<LocalProject, 'id' | 'createdAt'>>
  ): Promise<LocalProject | null> {
    await this.ensureReady();

    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const now = new Date().toISOString();
    const brandUpdate =
      'brand' in updates && updates.brand
        ? {
            colors: updates.brand.colors ?? project.brand.colors,
            fonts: updates.brand.fonts ?? project.brand.fonts,
            updatedAt: new Date().toISOString(),
          }
        : project.brand;

    const now = new Date().toISOString();
    const updatedProject: LocalProject = {
      ...project,
      ...updates,
      brand: brandUpdate,
      name: updates.name ? this.normalizeProjectName(updates.name) : project.name,
      updatedAt: now,
      version: LocalStorage.PROJECT_META_VERSION,
      name: updates.name ? this.normalizeProjectName(updates.name) : project.name,
      updatedAt: now,
    };

    const currentDir = await this.requireProjectDir(projectId);
    const targetDirName = this.toDirectoryName(updatedProject.name);
    const { dirPath: targetDir } = await this.getUniqueProjectDir(
      targetDirName,
      projectId
    );

    if (path.resolve(currentDir) !== path.resolve(targetDir)) {
      await this.ensureAccess(path.dirname(targetDir), {
        intent: 'write',
        createIfMissing: true,
        kind: 'directory',
      });

      try {
        await fs.rename(currentDir, targetDir);
      } catch (error) {
        if (LocalStorage.isPermissionError(error)) {
          throw new Error(LocalStorage.formatPermissionMessage(targetDir, 'write'));
        }

        throw new Error(LocalStorage.formatGenericAccessMessage(targetDir, error));
      }
      await fs.mkdir(path.dirname(targetDir), { recursive: true });
      await fs.rename(currentDir, targetDir);
      this.projectDirIndex.set(projectId, targetDir);
    }

    await this.ensureProjectStructure(targetDir);
    await this.writeFileSafely(
    await fs.writeFile(
      this.getMetaPathFromDir(targetDir),
      JSON.stringify(updatedProject, null, 2)
    );

    if (path.resolve(currentDir) !== path.resolve(targetDir)) {
      await this.ensureAccess(path.dirname(targetDir), {
        intent: 'write',
        createIfMissing: true,
        kind: 'directory',
      });

      try {
        await fs.rename(currentDir, targetDir);
      } catch (error) {
        if (LocalStorage.isPermissionError(error)) {
          throw new Error(LocalStorage.formatPermissionMessage(targetDir, 'write'));
        }

        throw new Error(LocalStorage.formatGenericAccessMessage(targetDir, error));
      }
      this.projectDirIndex.set(projectId, targetDir);
    }

    await this.ensureProjectStructure(targetDir);
    await this.writeProjectMeta(targetDir, updatedProject);

    return updatedProject;
  }

  async updateBrand(
    projectId: string,
    updates: LocalBrandUpdate
  ): Promise<LocalProject | null> {
    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const now = new Date().toISOString();
    const updatedProject: LocalProject = {
      ...project,
      brand: {
        colors: updates.colors ?? project.brand.colors,
        fonts: updates.fonts ?? project.brand.fonts,
        updatedAt: now,
      },
      updatedAt: now,
      version: LocalStorage.PROJECT_META_VERSION,
    };

    const projectDir = await this.requireProjectDir(projectId);
    await this.writeProjectMeta(projectDir, updatedProject);
    return updatedProject;
  }

  private getBranchPath(projectDir: string, branchId: string): string {
    return path.join(projectDir, 'branches', `${branchId}.json`);
  }

  private async ensureDefaultBranch(
    project: LocalProject,
    projectDir: string
  ): Promise<void> {
    const branches = await this.listBranches(project.id);
    if (branches.length > 0) {
      return;
    }

    const defaultBranch: Omit<LocalBranch, 'id' | 'createdAt' | 'updatedAt'> = {
      projectId: project.id,
      name: 'main',
      description: null,
      isDefault: true,
      sandboxId: null,
      sandboxUrl: null,
    };

    const now = new Date().toISOString();
    const branch: LocalBranch = {
      ...defaultBranch,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
    };

    await this.writeFileSafely(
      this.getBranchPath(projectDir, branch.id),
      JSON.stringify(branch, null, 2)
    );
  }

  async createBranch(
    projectId: string,
    branch: Omit<LocalBranch, 'id' | 'createdAt' | 'updatedAt' | 'projectId'>
  ): Promise<LocalBranch> {
    await this.ensureReady();

    const projectDir = await this.requireProjectDir(projectId);
    await this.ensureAccess(path.join(projectDir, 'branches'), {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });

    const now = new Date().toISOString();
    const id = this.generateId();
    const fullBranch: LocalBranch = {
      ...branch,
      projectId,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.writeFileSafely(
      this.getBranchPath(projectDir, id),
      JSON.stringify(fullBranch, null, 2)
    );

    return fullBranch;
  }

  async listBranches(projectId: string): Promise<LocalBranch[]> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return [];
    }

    await this.ensureAccess(path.join(projectDir, 'branches'), {
      intent: 'read',
      createIfMissing: true,
      kind: 'directory',
    });

    try {
      const entries = await fs.readdir(path.join(projectDir, 'branches'), {
        withFileTypes: true,
      });

      const branches: LocalBranch[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(projectDir, 'branches', entry.name);
        try {
          const raw = await fs.readFile(filePath, 'utf-8');
          branches.push(JSON.parse(raw) as LocalBranch);
        } catch (error) {
          if (LocalStorage.isPermissionError(error)) {
            throw new Error(LocalStorage.formatPermissionMessage(filePath, 'read'));
          }
          console.warn('[onlook-local-storage] Failed to parse branch file', filePath, error);
        }
      }

      return branches.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(path.join(projectDir, 'branches'), 'read')
        );
      }

      throw new Error(
        LocalStorage.formatGenericAccessMessage(path.join(projectDir, 'branches'), error)
      );
    }
  }

  async updateBranch(
    projectId: string,
    branchId: string,
    updates: Partial<Omit<LocalBranch, 'id' | 'projectId' | 'createdAt'>>
  ): Promise<LocalBranch | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const branchPath = this.getBranchPath(projectDir, branchId);
    try {
      const raw = await fs.readFile(branchPath, 'utf-8');
      const branch = JSON.parse(raw) as LocalBranch;
      const updated: LocalBranch = {
        ...branch,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await this.writeFileSafely(branchPath, JSON.stringify(updated, null, 2));
      return updated;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(branchPath, 'write'));
      }
      return null;
    }
  }

  async deleteBranch(projectId: string, branchId: string): Promise<boolean> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return false;
    }

    const branchPath = this.getBranchPath(projectDir, branchId);
    try {
      await fs.rm(branchPath, { force: true });
      return true;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(branchPath, 'write'));
      }
      return false;
    }
  }

  private getFramePath(projectDir: string, frameId: string): string {
    return path.join(projectDir, 'frames', `${frameId}.json`);
  }

  async createFrame(
    frame: Omit<LocalFrame, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<LocalFrame> {
    await this.ensureReady();

    const projectDir = await this.requireProjectDir(frame.projectId);
    const framesDir = path.join(projectDir, 'frames');
    await this.ensureAccess(framesDir, {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });


    await this.writeFileSafely(
      this.getBranchPath(projectDir, id),
      JSON.stringify(fullBranch, null, 2)
    );

    return fullBranch;
  }

  async listBranches(projectId: string): Promise<LocalBranch[]> {
  async deleteProject(projectId: string): Promise<boolean> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return [];
    }

    await this.ensureAccess(path.join(projectDir, 'branches'), {
      intent: 'read',
      createIfMissing: true,
      kind: 'directory',
    });

    try {
      const entries = await fs.readdir(path.join(projectDir, 'branches'), {
        withFileTypes: true,
      });

      const branches: LocalBranch[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(projectDir, 'branches', entry.name);
        try {
          const raw = await fs.readFile(filePath, 'utf-8');
          branches.push(JSON.parse(raw) as LocalBranch);
        } catch (error) {
          if (LocalStorage.isPermissionError(error)) {
            throw new Error(LocalStorage.formatPermissionMessage(filePath, 'read'));
          }
          console.warn('[onlook-local-storage] Failed to parse branch file', filePath, error);
        }
      }

      return branches.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(path.join(projectDir, 'branches'), 'read')
        );
      }

      throw new Error(
        LocalStorage.formatGenericAccessMessage(path.join(projectDir, 'branches'), error)
      );
    }
  }

  async updateBranch(
    projectId: string,
    branchId: string,
    updates: Partial<Omit<LocalBranch, 'id' | 'projectId' | 'createdAt'>>
  ): Promise<LocalBranch | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const branchPath = this.getBranchPath(projectDir, branchId);
    try {
      const raw = await fs.readFile(branchPath, 'utf-8');
      const branch = JSON.parse(raw) as LocalBranch;
      const updated: LocalBranch = {
        ...branch,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await this.writeFileSafely(branchPath, JSON.stringify(updated, null, 2));
      return updated;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(branchPath, 'write'));
      }
      return null;
    }
  }

  async deleteBranch(projectId: string, branchId: string): Promise<boolean> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return false;
    }

    const branchPath = this.getBranchPath(projectDir, branchId);
    try {
      await fs.rm(branchPath, { force: true });
      return true;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(branchPath, 'write'));
      }
      return false;
    }

    try {
      await fs.rm(projectDir, { recursive: true, force: true });
      this.projectDirIndex.delete(projectId);
      return true;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(projectDir, 'write'));
      }
      console.error('Failed to delete project:', error);
      return false;
    }
  }

  private getFramePath(projectDir: string, frameId: string): string {
    return path.join(projectDir, 'frames', `${frameId}.json`);
  }

  async createFrame(
    frame: Omit<LocalFrame, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<LocalFrame> {
    await this.ensureReady();

    const projectDir = await this.requireProjectDir(frame.projectId);
    const canvas = await this.getCanvas(frame.projectId, frame.canvasId);

    if (!canvas) {
      throw new Error(`Canvas ${frame.canvasId} not found for project ${frame.projectId}`);
    }
    const framesDir = path.join(projectDir, 'frames');
    await this.ensureAccess(framesDir, {
      intent: 'write',
      createIfMissing: true,
      kind: 'directory',
    });

    const now = new Date().toISOString();
    const id = this.generateId();
    const fullFrame: LocalFrame = {
      ...frame,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const updatedCanvas: LocalCanvas = {
      ...canvas,
      updatedAt: now,
      frames: [...canvas.frames, fullFrame],
    };

    await this.writeCanvasFile(projectDir, updatedCanvas);
    await this.writeFileSafely(
      this.getFramePath(projectDir, id),
      JSON.stringify(fullFrame, null, 2)
    );

    return fullFrame;
  }

  async listFrames(
    projectId: string,
    filters: { canvasId?: string; branchId?: string } = {}
  ): Promise<LocalFrame[]> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return [];
    }

    if (filters.canvasId) {
      const canvas = await this.getCanvas(projectId, filters.canvasId);
      if (!canvas) {
        return [];
      }

      return canvas.frames
        .filter((frame) =>
          filters.branchId ? frame.branchId === filters.branchId : true
        )
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    const canvases = await this.listCanvases(projectId);
    const frames = canvases.flatMap((canvas) => canvas.frames);

    return frames
      .filter((frame) => (filters.branchId ? frame.branchId === filters.branchId : true))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async updateFrame(
    projectId: string,
    frameId: string,
    updates: Partial<Omit<LocalFrame, 'id' | 'projectId' | 'createdAt'>>
  ): Promise<LocalFrame | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const canvases = await this.listCanvases(projectId);
    for (const canvas of canvases) {
      const index = canvas.frames.findIndex((frame) => frame.id === frameId);
      if (index === -1) {
        continue;
      }

      const existing = canvas.frames[index]!;
      const updated: LocalFrame = {
        ...existing,
        ...updates,
        position: updates.position ?? existing.position,
        dimension: updates.dimension ?? existing.dimension,
        canvasId: updates.canvasId ?? existing.canvasId,
        branchId: updates.branchId ?? existing.branchId,
        url: updates.url ?? existing.url,
        name: updates.name ?? existing.name,
        updatedAt: new Date().toISOString(),
      };

      const updatedCanvas: LocalCanvas = {
        ...canvas,
        updatedAt: updated.updatedAt,
        frames: [
          ...canvas.frames.slice(0, index),
          updated,
          ...canvas.frames.slice(index + 1),
        ],
      };

      await this.writeCanvasFile(projectDir, updatedCanvas);
      return updated;
    }

    return null;
  }

  async deleteFrame(projectId: string, frameId: string): Promise<boolean> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return false;
    }

    const canvases = await this.listCanvases(projectId);
    for (const canvas of canvases) {
      const index = canvas.frames.findIndex((frame) => frame.id === frameId);
      if (index === -1) {
        continue;
      }

      const updatedCanvas: LocalCanvas = {
        ...canvas,
        updatedAt: new Date().toISOString(),
        frames: [
          ...canvas.frames.slice(0, index),
          ...canvas.frames.slice(index + 1),
        ],
      };

      await this.writeCanvasFile(projectDir, updatedCanvas);
      return true;
    const framesDir = path.join(projectDir, 'frames');
    await this.ensureAccess(framesDir, {
      intent: 'read',
      createIfMissing: true,
      kind: 'directory',
    });

    try {
      const entries = await fs.readdir(framesDir, { withFileTypes: true });
      const frames: LocalFrame[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(framesDir, entry.name);
        try {
          const raw = await fs.readFile(filePath, 'utf-8');
          const frame = JSON.parse(raw) as LocalFrame;
          if (
            (filters.canvasId && frame.canvasId !
             filters.canvasId) ||
            (filters.branchId && frame.branchId !== filters.branchId)
          ) {
            continue;
          }
          frames.push(frame);
        } catch (error) {
          if (LocalStorage.isPermissionError(error)) {
            throw new Error(LocalStorage.formatPermissionMessage(filePath, 'read'));
          }
          console.warn('[onlook-local-storage] Failed to parse frame file', filePath, error);
        }
      }

      return frames.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(framesDir, 'read'));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(framesDir, error));
    }
  }

  async updateFrame(
    projectId: string,
    frameId: string,
    updates: Partial<Omit<LocalFrame, 'id' | 'projectId' | 'createdAt'>>
  ): Promise<LocalFrame | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const framePath = this.getFramePath(projectDir, frameId);
    try {
      const raw = await fs.readFile(framePath, 'utf-8');
      const frame = JSON.parse(raw) as LocalFrame;
      const updated: LocalFrame = {
        ...frame,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await this.writeFileSafely(framePath, JSON.stringify(updated, null, 2));
      return updated;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(framePath, 'write'));
      }
      return null;
    }
  }

  async deleteFrame(projectId: string, frameId: string): Promise<boolean> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return false;
    }

  async listProjects(): Promise<LocalProject[]> {
    await this.ensureReady();

    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(this.projectsDir, 'read'));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(this.projectsDir, error));
    }

    const projects: LocalProject[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectDir = path.join(this.projectsDir, entry.name);
      const project = await this.readProjectMeta(projectDir);
      if (project) {
        this.projectDirIndex.set(project.id, projectDir);
        await this.ensureProjectStructure(projectDir);
        projects.push(project);
      }
    }


    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(framesDir, 'read'));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(framesDir, error));
    }
  }

  async updateFrame(
    projectId: string,
    frameId: string,
    updates: Partial<Omit<LocalFrame, 'id' | 'projectId' | 'createdAt'>>
  ): Promise<LocalFrame | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const framePath = this.getFramePath(projectDir, frameId);
    try {
      const raw = await fs.readFile(framePath, 'utf-8');
      const frame = JSON.parse(raw) as LocalFrame;
      const updated: LocalFrame = {
        ...frame,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await this.writeFileSafely(framePath, JSON.stringify(updated, null, 2));
      return updated;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(framePath, 'write'));
      }
      return null;
    }

    return false;
  }

  async findFrame(
    frameId: string
  ): Promise<{ frame: LocalFrame; canvas: LocalCanvas; projectId: string } | null> {
    await this.ensureReady();
    await this.refreshProjectIndex();

    for (const [projectId] of this.projectDirIndex) {
      const canvases = await this.listCanvases(projectId);
      for (const canvas of canvases) {
        const frame = canvas.frames.find((item) => item.id === frameId);
        if (frame) {
          return { frame, canvas, projectId };
        }
      }
    }

    return null;
  }

  async findCanvasById(
    canvasId: string
  ): Promise<{ canvas: LocalCanvas; projectId: string } | null> {
    await this.ensureReady();
    await this.refreshProjectIndex();

    for (const [projectId] of this.projectDirIndex) {
      const canvases = await this.listCanvases(projectId);
      for (const canvas of canvases) {
        const frame = canvas.frames.find((item) => item.id === frameId);
        if (frame) {
          return { frame, canvas, projectId };
        }
      const canvas = await this.getCanvas(projectId, canvasId);
      if (canvas) {
        return { canvas, projectId };
      }
    }

    return null;
  }

  async findCanvasById(
    canvasId: string
  ): Promise<{ canvas: LocalCanvas; projectId: string } | null> {
    await this.ensureReady();
    await this.refreshProjectIndex();

    for (const [projectId] of this.projectDirIndex) {
      const canvas = await this.getCanvas(projectId, canvasId);
      if (canvas) {
        return { canvas, projectId };
      }
    }

    return null;
  async deleteFrame(projectId: string, frameId: string): Promise<boolean> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return false;
    }

    const framePath = this.getFramePath(projectDir, frameId);
    try {
      await fs.rm(framePath, { force: true });
      return true;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(framePath, 'write'));
      }
      return false;
    }
  }

  async deleteProject(projectId: string): Promise<boolean> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return false;
    }

    try {
      await fs.rm(projectDir, { recursive: true, force: true });
      this.projectDirIndex.delete(projectId);
      return true;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(projectDir, 'write'));
      }
      console.error('Failed to delete project:', error);
      return false;
    }

    const projects: LocalProject[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectDir = path.join(this.projectsDir, entry.name);
      const project = await this.readProjectMeta(projectDir);
      if (project) {
        this.projectDirIndex.set(project.id, projectDir);
        await this.ensureProjectStructure(projectDir);
        projects.push(project);
      }
    }

    return projects.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async listProjects(): Promise<LocalProject[]> {
    await this.ensureReady();

    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(this.projectsDir, 'read'));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(this.projectsDir, error));
    }

    const projects: LocalProject[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectDir = path.join(this.projectsDir, entry.name);
      const project = await this.readProjectMeta(projectDir);
      if (project) {
        this.projectDirIndex.set(project.id, projectDir);
        await this.ensureProjectStructure(projectDir);
        projects.push(project);
      }
    }

    return projects.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  // Canvas operations
  async createCanvas(
    canvas: Omit<LocalCanvas, 'id' | 'createdAt' | 'updatedAt' | 'frames' | 'state'> & {
      frames?: LocalFrame[];
      state?: Partial<LocalCanvasState>;
    }
    canvas: Omit<LocalCanvas, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<LocalCanvas> {
    await this.ensureReady();

    const projectDir = await this.requireProjectDir(canvas.projectId);
    await this.ensureProjectStructure(projectDir);

    const id = this.generateId();
    const now = new Date().toISOString();
    const normalized = LocalStorage.canvasFileSchema.parse({
      ...canvas,
      frames: canvas.frames ?? [],
      state: {
        scale: canvas.state?.scale ?? DefaultSettings.SCALE,
        position: {
          x: canvas.state?.position?.x ?? DefaultSettings.PAN_POSITION.x,
          y: canvas.state?.position?.y ?? DefaultSettings.PAN_POSITION.y,
        },
      },
      id,
      createdAt: now,
      updatedAt: now,
    });

    await this.writeFileSafely(
      path.join(projectDir, 'canvases', `${id}.json`),
      JSON.stringify(normalized, null, 2)
    await fs.writeFile(
      path.join(projectDir, 'canvases', `${id}.json`),
      JSON.stringify(fullCanvas, null, 2)
    );

    return normalized;
  }

  async getCanvas(
    projectId: string,
    canvasId: string
  ): Promise<LocalCanvas | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    try {
      const data = await fs.readFile(
        path.join(projectDir, 'canvases', `${canvasId}.json`),
        'utf-8'
      );
      const parsed = LocalStorage.canvasFileSchema.parse(JSON.parse(data));
      return await this.maybeMigrateLegacyFrames(projectDir, parsed);
      return JSON.parse(data) as LocalCanvas;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(
            path.join(projectDir, 'canvases', `${canvasId}.json`),
            'read'
          )
        );
      }
      return null;
    }
  }

  async listCanvases(projectId: string): Promise<LocalCanvas[]> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return [];
    }

    await this.ensureProjectStructure(projectDir);

    try {
      const canvasesDir = path.join(projectDir, 'canvases');
      const entries = await fs.readdir(canvasesDir, { withFileTypes: true });
      const canvases: LocalCanvas[] = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const canvasId = entry.name.replace('.json', '');
          const canvas = await this.getCanvas(projectId, canvasId);
          if (canvas) {
            canvases.push(canvas);
          }
        }
      }

      return canvases.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(path.join(projectDir, 'canvases'), 'read'));
      }

      throw new Error(
        LocalStorage.formatGenericAccessMessage(path.join(projectDir, 'canvases'), error)
      );
    }
  }

  async updateCanvasState(
    projectId: string,
    canvasId: string,
    state: Partial<LocalCanvasState>
  ): Promise<LocalCanvas | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const canvas = await this.getCanvas(projectId, canvasId);
    if (!canvas) {
      return null;
    }

    const updatedCanvas: LocalCanvas = {
      ...canvas,
      state: {
        scale: state.scale ?? canvas.state.scale,
        position: {
          x: state.position?.x ?? canvas.state.position.x,
          y: state.position?.y ?? canvas.state.position.y,
        },
      },
      updatedAt: new Date().toISOString(),
    };

    await this.writeCanvasFile(projectDir, updatedCanvas);
    return updatedCanvas;
  }

  // Conversation operations
  private toConversationMetadata(file: LocalConversationFile): LocalConversation {
    return {
      id: file.id,
      projectId: file.projectId,
      title: file.title,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      suggestions: file.suggestions ?? [],
    };
  }

  private normalizeStoredMessage(
    conversationId: string,
    raw: unknown
  ): LocalConversationMessage {
    const value = typeof raw === 'object' && raw ? raw as Record<string, unknown> : {};
    const createdAt = typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString();
    const id = typeof value.id === 'string' ? value.id : this.generateId();

    const parsed = LocalStorage.conversationMessageSchema.parse({
      ...value,
      id,
      conversationId: typeof value.conversationId === 'string' ? value.conversationId : conversationId,
      createdAt,
    });

    return {
      ...parsed,
      context: parsed.context ?? [],
      parts: parsed.parts ?? [],
      checkpoints: parsed.checkpoints ?? [],
    };
  }

  private async readConversationFile(
    projectDir: string,
    conversationId: string
  ): Promise<LocalConversationFile | null> {
    const conversationPath = this.getConversationPath(projectDir, conversationId);
    try {
      const raw = await fs.readFile(conversationPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      if (typeof parsed.version !== 'number') {
        const now = new Date().toISOString();
        const legacySuggestions = Array.isArray(parsed.suggestions)
          ? (parsed.suggestions as ChatSuggestion[])
          : [];
        const legacyMessages = Array.isArray(parsed.messages)
          ? (parsed.messages as unknown[]).map((message) =>
              this.normalizeStoredMessage(conversationId, message)
            )
          : [];

        const upgraded: LocalConversationFile = {
          version: LocalStorage.CONVERSATION_FILE_VERSION,
          id: typeof parsed.id === 'string' ? parsed.id : conversationId,
          projectId: typeof parsed.projectId === 'string'
            ? parsed.projectId
            : path.basename(projectDir),
          title: typeof parsed.title === 'string'
            ? parsed.title
            : typeof parsed.displayName === 'string'
              ? (parsed.displayName as string)
              : null,
          createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : now,
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now,
          suggestions: legacySuggestions,
          messages: legacyMessages,
        };

        await this.writeConversationFile(projectDir, upgraded);
        return upgraded;
      }

      const normalized = LocalStorage.conversationFileSchema.parse(parsed);

      if (normalized.version !== LocalStorage.CONVERSATION_FILE_VERSION) {
        normalized.version = LocalStorage.CONVERSATION_FILE_VERSION;
        await this.writeConversationFile(projectDir, normalized);
      }

      return normalized;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(conversationPath, 'read')
        );
      }

      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return null;
      }

      throw new Error(
        LocalStorage.formatGenericAccessMessage(conversationPath, error)
      );
    }
  }

  private async writeConversationFile(
    projectDir: string,
    conversation: LocalConversationFile
  ): Promise<void> {
    const filePath = this.getConversationPath(projectDir, conversation.id);
    const payload = {
      ...conversation,
      title: conversation.title ?? null,
      suggestions: conversation.suggestions ?? [],
      messages: conversation.messages.map((message) => ({
        ...message,
        context: message.context ?? [],
        parts: message.parts ?? [],
        checkpoints: message.checkpoints ?? [],
      })),
    } satisfies LocalConversationFile;

    await this.writeFileSafely(filePath, JSON.stringify(payload, null, 2));
  }

  async createConversation(
    conversation: { projectId: string; title?: string | null }
  async createConversation(
    conversation: Omit<LocalConversation, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<LocalConversation> {
    await this.ensureReady();

    const projectDir = await this.requireProjectDir(conversation.projectId);
    await this.ensureProjectStructure(projectDir);

    const id = this.generateId();
    const now = new Date().toISOString();
    const metadata: LocalConversation = {
      id,
      projectId: conversation.projectId,
      title: conversation.title ?? null,
      createdAt: now,
      updatedAt: now,
      suggestions: [],
    };

    const conversationFile: LocalConversationFile = {
      ...metadata,
      version: LocalStorage.CONVERSATION_FILE_VERSION,
      messages: [],
    };
    await this.writeFileSafely(
    await fs.writeFile(
      path.join(projectDir, 'conversations', `${id}.json`),
      JSON.stringify(fullConversation, null, 2)
    );

    await this.writeConversationFile(projectDir, conversationFile);

    return metadata;
  }

  async getConversation(
    projectId: string,
    conversationId: string
  ): Promise<LocalConversation | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const file = await this.readConversationFile(projectDir, conversationId);
    if (!file) {
    try {
      const data = await fs.readFile(
        path.join(projectDir, 'conversations', `${conversationId}.json`),
        'utf-8'
      );
      return JSON.parse(data) as LocalConversation;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(
            path.join(projectDir, 'conversations', `${conversationId}.json`),
            'read'
          )
        );
      }
      return null;
    }

    return this.toConversationMetadata(file);
  }

  async listConversations(projectId: string): Promise<LocalConversation[]> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return [];
    }

    await this.ensureProjectStructure(projectDir);

    try {
      const conversationsDir = path.join(projectDir, 'conversations');
      const entries = await fs.readdir(conversationsDir, { withFileTypes: true });
      const conversations: LocalConversation[] = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const conversationId = entry.name.replace('.json', '');
          const conversationFile = await this.readConversationFile(projectDir, conversationId);
          if (conversationFile) {
            conversations.push(this.toConversationMetadata(conversationFile));
          }
        }
      }

      return conversations.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(path.join(projectDir, 'conversations'), 'read')
        );
      }

      throw new Error(
        LocalStorage.formatGenericAccessMessage(path.join(projectDir, 'conversations'), error)
      );
    }
  }

  async updateConversation(
    projectId: string,
    conversationId: string,
    updates: Partial<Pick<LocalConversation, 'title' | 'suggestions'>>
  ): Promise<LocalConversation | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const conversation = await this.readConversationFile(projectDir, conversationId);
    if (!conversation) {
      return null;
    }

    const now = new Date().toISOString();
    const updatedConversation: LocalConversationFile = {
      ...conversation,
      title: updates.title ?? conversation.title ?? null,
      suggestions: updates.suggestions ?? conversation.suggestions ?? [],
      updatedAt: now,
    };

    await this.writeConversationFile(projectDir, updatedConversation);
    return this.toConversationMetadata(updatedConversation);
  }

  async deleteConversation(projectId: string, conversationId: string): Promise<boolean> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return false;
    }

    const filePath = this.getConversationPath(projectDir, conversationId);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(path.join(projectDir, 'conversations'), 'read')
        );
      }

      throw new Error(
        LocalStorage.formatGenericAccessMessage(path.join(projectDir, 'conversations'), error)
      );
    }
  }

  async updateConversation(
    projectId: string,
    conversationId: string,
    updates: Partial<Pick<LocalConversation, 'title' | 'suggestions'>>
  ): Promise<LocalConversation | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    const conversation = await this.readConversationFile(projectDir, conversationId);
    if (!conversation) {
      return null;
    }

    const now = new Date().toISOString();
    const updatedConversation: LocalConversationFile = {
      ...conversation,
      title: updates.title ?? conversation.title ?? null,
      suggestions: updates.suggestions ?? conversation.suggestions ?? [],
      updatedAt: now,
    };

    await this.writeConversationFile(projectDir, updatedConversation);
    return this.toConversationMetadata(updatedConversation);
  }

  async deleteConversation(projectId: string, conversationId: string): Promise<boolean> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return false;
    }

    const filePath = this.getConversationPath(projectDir, conversationId);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return false;
      }

      if (LocalStorage.isPermissionError(error)) {
        throw new Error(LocalStorage.formatPermissionMessage(filePath, 'write'));
      }

      throw new Error(LocalStorage.formatGenericAccessMessage(filePath, error));
    }
  }

  async listConversationMessages(
    projectId: string,
    conversationId: string
  ): Promise<LocalConversationMessage[]> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return [];
    }

    const conversation = await this.readConversationFile(projectDir, conversationId);
    if (!conversation) {
      return [];
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(path.join(projectDir, 'conversations'), 'read')
        );
      }

      throw new Error(
        LocalStorage.formatGenericAccessMessage(path.join(projectDir, 'conversations'), error)
      );
    }

    return conversation.messages;
  }

  async replaceConversationMessages(
    projectId: string,
    conversationId: string,
    messages: LocalConversationMessage[]
  ): Promise<void> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      throw new Error(`Project ${projectId} not found`);
    }

    const conversation = await this.readConversationFile(projectDir, conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const updated: LocalConversationFile = {
      ...conversation,
      messages,
      updatedAt: new Date().toISOString(),
    };

    await this.writeConversationFile(projectDir, updated);
  }

  async updateConversationMessage(
    projectId: string,
    conversationId: string,
    messageId: string,
    updates: Partial<Pick<LocalConversationMessage, 'context' | 'parts' | 'checkpoints' | 'content' | 'createdAt'>>
  ): Promise<void> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      throw new Error(`Project ${projectId} not found`);
    }

    return conversation.messages;
  }

  async replaceConversationMessages(
    projectId: string,
    conversationId: string,
    messages: LocalConversationMessage[]
  ): Promise<void> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      throw new Error(`Project ${projectId} not found`);
    }

    const conversation = await this.readConversationFile(projectDir, conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const updated: LocalConversationFile = {
      ...conversation,
      messages,
      updatedAt: new Date().toISOString(),
    };

    await this.writeConversationFile(projectDir, updated);
  }

  async updateConversationMessage(
    projectId: string,
    conversationId: string,
    messageId: string,
    updates: Partial<Pick<LocalConversationMessage, 'context' | 'parts' | 'checkpoints' | 'content' | 'createdAt'>>
  ): Promise<void> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      throw new Error(`Project ${projectId} not found`);
    }

    return conversation.messages;
  }

  async replaceConversationMessages(
    projectId: string,
    conversationId: string,
    messages: LocalConversationMessage[]
  ): Promise<void> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      throw new Error(`Project ${projectId} not found`);
    }

    const conversation = await this.readConversationFile(projectDir, conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const updated: LocalConversationFile = {
      ...conversation,
      messages,
      updatedAt: new Date().toISOString(),
    };

    await this.writeConversationFile(projectDir, updated);
  }

  async updateConversationMessage(
    projectId: string,
    conversationId: string,
    messageId: string,
    updates: Partial<Pick<LocalConversationMessage, 'context' | 'parts' | 'checkpoints' | 'content' | 'createdAt'>>
  ): Promise<void> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      throw new Error(`Project ${projectId} not found`);
    }

    const conversation = await this.readConversationFile(projectDir, conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const index = conversation.messages.findIndex((message) => message.id === messageId);
    if (index === -1) {
      throw new Error(`Message ${messageId} not found`);
    }

    const existing = conversation.messages[index];
    const updatedMessage: LocalConversationMessage = {
      ...existing,
      ...updates,
      context: updates.context ?? existing.context ?? [],
      parts: updates.parts ?? existing.parts ?? [],
      checkpoints: updates.checkpoints ?? existing.checkpoints ?? [],
      createdAt: updates.createdAt ?? existing.createdAt,
    };

    const updatedConversation: LocalConversationFile = {
      ...conversation,
      messages: [
        ...conversation.messages.slice(0, index),
        updatedMessage,
        ...conversation.messages.slice(index + 1),
      ],
      updatedAt: new Date().toISOString(),
    };

    await this.writeConversationFile(projectDir, updatedConversation);
  }

  // File operations
  async saveFile(
    projectId: string,
    filePath: string,
    content: string
  ): Promise<void> {
    await this.ensureReady();

    const projectDir = await this.requireProjectDir(projectId);
    await this.ensureProjectStructure(projectDir);

    const fullPath = path.join(projectDir, 'files', filePath);
    await this.writeFileSafely(fullPath, content);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async readFile(projectId: string, filePath: string): Promise<string | null> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return null;
    }

    try {
      const fullPath = path.join(projectDir, 'files', filePath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(
            path.join(projectDir, 'files', filePath),
            'read'
          )
        );
      }
      return null;
    }
  }

  async listFiles(projectId: string, dirPath: string = ''): Promise<string[]> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return [];
    }

    await this.ensureProjectStructure(projectDir);

    try {
      const fullPath = path.join(projectDir, 'files', dirPath);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        const relativePath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          const subFiles = await this.listFiles(projectId, relativePath);
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      }

      return files;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(path.join(projectDir, 'files', dirPath), 'read')
        );
      }

      return [];
    }
  }

  private async listDirectory(
    projectDir: string,
    baseDir: string,
    dirPath: string = ''
  ): Promise<string[]> {
    const targetDir = path.join(projectDir, baseDir, dirPath);
    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        const relativePath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          const subFiles = await this.listDirectory(projectDir, baseDir, relativePath);
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      }

      return files;
    } catch (error) {
      if (LocalStorage.isPermissionError(error)) {
        throw new Error(
          LocalStorage.formatPermissionMessage(path.join(projectDir, baseDir, dirPath), 'read')
        );
      }

      return [];
    }
  }

  async listAssets(projectId: string, dirPath: string = ''): Promise<string[]> {
    await this.ensureReady();

    const projectDir = await this.getProjectDir(projectId);
    if (!projectDir) {
      return [];
    }

    await this.ensureProjectStructure(projectDir);
    return this.listDirectory(projectDir, 'assets', dirPath);
  }

  async saveAsset(
    projectId: string,
    assetPath: string,
    content: string | Uint8Array
  ): Promise<void> {
    await this.ensureReady();

    const projectDir = await this.requireProjectDir(projectId);
    await this.ensureProjectStructure(projectDir);

    const fullPath = path.join(projectDir, 'assets', assetPath);
    await this.writeFileSafely(fullPath, content);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

// Export singleton instance
export const localStorage = new LocalStorage();
