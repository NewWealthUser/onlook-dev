import { promises as fs } from 'fs';
import path from 'path';
import { env } from '../../web/client/src/env';

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

  constructor() {
    this.projectsDir = env.ONLOOK_PROJECTS_DIR;
    this.ensureProjectsDir();
  }

  private async ensureProjectsDir() {
    try {
      await fs.mkdir(this.projectsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create projects directory:', error);
    }
  }

  private getProjectPath(projectId: string): string {
    return path.join(this.projectsDir, projectId);
  }

  private getProjectMetaPath(projectId: string): string {
    return path.join(this.getProjectPath(projectId), 'meta.json');
  }

  private getCanvasPath(projectId: string, canvasId: string): string {
    return path.join(this.getProjectPath(projectId), 'canvases', `${canvasId}.json`);
  }

  private getConversationPath(projectId: string, conversationId: string): string {
    return path.join(this.getProjectPath(projectId), 'conversations', `${conversationId}.json`);
  }

  // Project operations
  async createProject(project: Omit<LocalProject, 'id' | 'createdAt' | 'updatedAt'>): Promise<LocalProject> {
    const id = this.generateId();
    const now = new Date().toISOString();
    const fullProject: LocalProject = {
      ...project,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const projectPath = this.getProjectPath(id);
    await fs.mkdir(projectPath, { recursive: true });
    await fs.mkdir(path.join(projectPath, 'canvases'), { recursive: true });
    await fs.mkdir(path.join(projectPath, 'conversations'), { recursive: true });
    await fs.mkdir(path.join(projectPath, 'files'), { recursive: true });

    await fs.writeFile(
      this.getProjectMetaPath(id),
      JSON.stringify(fullProject, null, 2)
    );

    return fullProject;
  }

  async getProject(projectId: string): Promise<LocalProject | null> {
    try {
      const metaPath = this.getProjectMetaPath(projectId);
      const data = await fs.readFile(metaPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async updateProject(projectId: string, updates: Partial<Omit<LocalProject, 'id' | 'createdAt'>>): Promise<LocalProject | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    const updatedProject: LocalProject = {
      ...project,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await fs.writeFile(
      this.getProjectMetaPath(projectId),
      JSON.stringify(updatedProject, null, 2)
    );

    return updatedProject;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    try {
      const projectPath = this.getProjectPath(projectId);
      await fs.rm(projectPath, { recursive: true, force: true });
      return true;
    } catch (error) {
      console.error('Failed to delete project:', error);
      return false;
    }
  }

  async listProjects(): Promise<LocalProject[]> {
    try {
      const entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
      const projects: LocalProject[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const project = await this.getProject(entry.name);
          if (project) {
            projects.push(project);
          }
        }
      }

      return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (error) {
      console.error('Failed to list projects:', error);
      return [];
    }
  }

  // Canvas operations
  async createCanvas(canvas: Omit<LocalCanvas, 'id' | 'createdAt' | 'updatedAt'>): Promise<LocalCanvas> {
    const id = this.generateId();
    const now = new Date().toISOString();
    const fullCanvas: LocalCanvas = {
      ...canvas,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await fs.writeFile(
      this.getCanvasPath(canvas.projectId, id),
      JSON.stringify(fullCanvas, null, 2)
    );

    return fullCanvas;
  }

  async getCanvas(projectId: string, canvasId: string): Promise<LocalCanvas | null> {
    try {
      const canvasPath = this.getCanvasPath(projectId, canvasId);
      const data = await fs.readFile(canvasPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async listCanvases(projectId: string): Promise<LocalCanvas[]> {
    try {
      const canvasesDir = path.join(this.getProjectPath(projectId), 'canvases');
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

      return canvases.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (error) {
      console.error('Failed to list canvases:', error);
      return [];
    }
  }

  // Conversation operations
  async createConversation(conversation: Omit<LocalConversation, 'id' | 'createdAt' | 'updatedAt'>): Promise<LocalConversation> {
    const id = this.generateId();
    const now = new Date().toISOString();
    const fullConversation: LocalConversation = {
      ...conversation,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await fs.writeFile(
      this.getConversationPath(conversation.projectId, id),
      JSON.stringify(fullConversation, null, 2)
    );

    return fullConversation;
  }

  async getConversation(projectId: string, conversationId: string): Promise<LocalConversation | null> {
    try {
      const conversationPath = this.getConversationPath(projectId, conversationId);
      const data = await fs.readFile(conversationPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async listConversations(projectId: string): Promise<LocalConversation[]> {
    try {
      const conversationsDir = path.join(this.getProjectPath(projectId), 'conversations');
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

      return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (error) {
      console.error('Failed to list conversations:', error);
      return [];
    }
  }

  // File operations
  async saveFile(projectId: string, filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.getProjectPath(projectId), 'files', filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async readFile(projectId: string, filePath: string): Promise<string | null> {
    try {
      const fullPath = path.join(this.getProjectPath(projectId), 'files', filePath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      return null;
    }
  }

  async listFiles(projectId: string, dirPath: string = ''): Promise<string[]> {
    try {
      const fullPath = path.join(this.getProjectPath(projectId), 'files', dirPath);
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
