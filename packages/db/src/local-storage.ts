import { promises as fs, Dirent } from 'fs';
import path from 'path';

export interface LocalProject {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  previewImgUrl?: string;
  previewImgPath?: string;
  sandboxId?: string;
  sandboxUrl?: string;
}

export interface LocalCanvas {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalFrame {
  id: string;
  canvasId: string;
  name: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}

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

  constructor(projectsDir?: string) {
    this.projectsDir = projectsDir ?? '';
    this.ready = this.initialize(projectsDir).catch((error) => {
      console.error('Failed to initialize local storage directory:', error);
      throw error;
    });
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
    };

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

    const project = await this.readProjectMeta(projectDir);
    if (!project) {
      return null;
    }

    await this.ensureProjectStructure(projectDir);
    return project;
  }

  async updateProject(
    projectId: string,
    updates: Partial<Omit<LocalProject, 'id' | 'createdAt'>>
  ): Promise<LocalProject | null> {
    await this.ensureReady();

    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const now = new Date().toISOString();
    const updatedProject: LocalProject = {
      ...project,
      ...updates,
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
      await fs.mkdir(path.dirname(targetDir), { recursive: true });
      await fs.rename(currentDir, targetDir);
      this.projectDirIndex.set(projectId, targetDir);
    }

    await this.ensureProjectStructure(targetDir);
    await fs.writeFile(
      this.getMetaPathFromDir(targetDir),
      JSON.stringify(updatedProject, null, 2)
    );

    return updatedProject;
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
      console.error('Failed to delete project:', error);
      return false;
    }
  }

  async listProjects(): Promise<LocalProject[]> {
    await this.ensureReady();

    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
    } catch (error) {
      console.error('Failed to list projects:', error);
      return [];
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
    canvas: Omit<LocalCanvas, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<LocalCanvas> {
    await this.ensureReady();

    const projectDir = await this.requireProjectDir(canvas.projectId);
    await this.ensureProjectStructure(projectDir);

    const id = this.generateId();
    const now = new Date().toISOString();
    const fullCanvas: LocalCanvas = {
      ...canvas,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await fs.writeFile(
      path.join(projectDir, 'canvases', `${id}.json`),
      JSON.stringify(fullCanvas, null, 2)
    );

    return fullCanvas;
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
      return JSON.parse(data) as LocalCanvas;
    } catch (error) {
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
      console.error('Failed to list canvases:', error);
      return [];
    }
  }

  // Conversation operations
  async createConversation(
    conversation: Omit<LocalConversation, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<LocalConversation> {
    await this.ensureReady();

    const projectDir = await this.requireProjectDir(conversation.projectId);
    await this.ensureProjectStructure(projectDir);

    const id = this.generateId();
    const now = new Date().toISOString();
    const fullConversation: LocalConversation = {
      ...conversation,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await fs.writeFile(
      path.join(projectDir, 'conversations', `${id}.json`),
      JSON.stringify(fullConversation, null, 2)
    );

    return fullConversation;
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

    try {
      const data = await fs.readFile(
        path.join(projectDir, 'conversations', `${conversationId}.json`),
        'utf-8'
      );
      return JSON.parse(data) as LocalConversation;
    } catch (error) {
      return null;
    }
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
          const conversation = await this.getConversation(projectId, conversationId);
          if (conversation) {
            conversations.push(conversation);
          }
        }
      }

      return conversations.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      console.error('Failed to list conversations:', error);
      return [];
    }
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
      return [];
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

// Export singleton instance
export const localStorage = new LocalStorage();
