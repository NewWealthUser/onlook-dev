import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { LocalStorage } from '../src/local-storage';

const requiredSubdirectories = [
  'files',
  'canvases',
  'conversations',
  'previews',
  'assets',
];

const readJson = async <T>(targetPath: string): Promise<T> => {
  const raw = await fs.readFile(targetPath, 'utf-8');
  return JSON.parse(raw) as T;
};

describe('LocalStorage project structure', () => {
  let baseDir: string;
  let storage: LocalStorage;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(tmpdir(), 'onlook-local-storage-'));
    storage = new LocalStorage(baseDir);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('creates a project tree rooted by project name', async () => {
    const project = await storage.createProject({
      name: 'Sample Project',
      description: 'Example project',
      tags: [],
    });

    const projectDir = path.join(baseDir, 'Sample Project');
    const entries = await fs.readdir(projectDir);

    expect(entries).toContain('meta.json');

    for (const subdirectory of requiredSubdirectories) {
      const stats = await fs.stat(path.join(projectDir, subdirectory));
      expect(stats.isDirectory()).toBe(true);
    }

    const meta = await readJson<typeof project>(path.join(projectDir, 'meta.json'));
    expect(meta.id).toBe(project.id);
    expect(meta.name).toBe('Sample Project');
  });

  it('repairs missing project subdirectories when accessed', async () => {
    const project = await storage.createProject({
      name: 'Repair Project',
      description: undefined,
      tags: [],
    });

    const projectDir = path.join(baseDir, 'Repair Project');

    await fs.rm(path.join(projectDir, 'files'), { recursive: true, force: true });
    await fs.rm(path.join(projectDir, 'canvases'), { recursive: true, force: true });
    await fs.rm(path.join(projectDir, 'conversations'), { recursive: true, force: true });

    const fetched = await storage.getProject(project.id);
    expect(fetched?.id).toBe(project.id);

    for (const subdirectory of requiredSubdirectories) {
      const stats = await fs.stat(path.join(projectDir, subdirectory));
      expect(stats.isDirectory()).toBe(true);
    }
  });
});

describe('LocalStorage access guidance', () => {
  it('surfaced message references Full Disk Access when the root directory is blocked', async () => {
    const blockedPath = path.join(tmpdir(), 'onlook-permission-denied');
    const accessError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const accessSpy = spyOn(fs, 'access').mockRejectedValue(accessError);

    try {
      const storage = new LocalStorage(blockedPath);
      await expect(storage.listProjects()).rejects.toThrow(
        /macos-permissions\.md#full-disk-access/i
      );
    } finally {
      accessSpy.mockRestore();
      await fs.rm(blockedPath, { recursive: true, force: true });
    }
  });

  it('reminds the user when the configured root path is a file', async () => {
    const filePath = path.join(tmpdir(), 'onlook-file-root');
    await fs.writeFile(filePath, 'not a directory');

    try {
      const storage = new LocalStorage(filePath);
      await expect(storage.listProjects()).rejects.toThrow(
        /macos-permissions\.md#projects-root-layout/i
      );
    } finally {
      await fs.rm(filePath, { recursive: true, force: true });
    }
  });
});
