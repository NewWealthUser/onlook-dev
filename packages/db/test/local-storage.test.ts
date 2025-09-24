import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
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
  'branches',
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

describe('LocalStorage left panel state persistence', () => {
  let baseDir: string;
  let storage: LocalStorage;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(tmpdir(), 'onlook-left-panel-'));
    storage = new LocalStorage(baseDir);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('persists brand colors and fonts via meta.json', async () => {
    const project = await storage.createProject({
      name: 'Brand Project',
      description: 'Brand state',
      tags: [],
    });

    const updated = await storage.updateBrand(project.id, {
      colors: [
        { id: 'primary', value: '#ff0000', label: 'Primary Red' },
        { id: 'secondary', value: '#00ff00' },
      ],
      fonts: [
        {
          id: 'inter',
          family: 'Inter',
          files: ['fonts/inter.woff2'],
          styles: ['normal'],
          weights: ['400', '700'],
        },
      ],
    });

    expect(updated?.brand.colors).toHaveLength(2);
    expect(updated?.brand.fonts).toHaveLength(1);

    const reloaded = new LocalStorage(baseDir);
    const fetched = await reloaded.getProject(project.id);
    expect(fetched?.brand.colors).toEqual(updated?.brand.colors);
    expect(fetched?.brand.fonts).toEqual(updated?.brand.fonts);
  });

  it('creates, lists, and updates branches for the branches tab', async () => {
    const project = await storage.createProject({
      name: 'Branch Project',
      description: undefined,
      tags: [],
    });

    const defaultBranches = await storage.listBranches(project.id);
    expect(defaultBranches.length).toBeGreaterThanOrEqual(1);

    const newBranch = await storage.createBranch(project.id, {
      name: 'feature/login',
      description: 'Login flow work',
      isDefault: false,
      sandboxId: 'sandbox-123',
      sandboxUrl: 'http://localhost:3000',
    });

    const branches = await storage.listBranches(project.id);
    expect(branches.find((branch) => branch.id === newBranch.id)).toBeDefined();

    await storage.updateBranch(project.id, newBranch.id, {
      description: 'Updated description',
    });

    const reloaded = new LocalStorage(baseDir);
    const reloadedBranches = await reloaded.listBranches(project.id);
    const reloadedBranch = reloadedBranches.find((branch) => branch.id === newBranch.id);
    expect(reloadedBranch?.description).toBe('Updated description');
  });

  it('stores frames for the layers tab', async () => {
    const project = await storage.createProject({
      name: 'Layers Project',
      description: undefined,
      tags: [],
    });

    const canvas = await storage.createCanvas({
      projectId: project.id,
      name: 'Canvas A',
    });

    const branch = (await storage.listBranches(project.id))[0];
    expect(branch).toBeDefined();

    const frame = await storage.createFrame({
      projectId: project.id,
      canvasId: canvas.id,
      branchId: branch.id,
      name: 'Frame 1',
      position: { x: 0, y: 0 },
      dimension: { width: 1200, height: 800 },
      url: '/app/page',
    });

    const frames = await storage.listFrames(project.id, { canvasId: canvas.id });
    expect(frames.map((f) => f.id)).toContain(frame.id);

    const reloaded = new LocalStorage(baseDir);
    const persisted = await reloaded.listFrames(project.id, { branchId: branch.id });
    expect(persisted.map((f) => f.id)).toContain(frame.id);
  });

  it('saves project files used by the pages tab', async () => {
    const project = await storage.createProject({
      name: 'Pages Project',
      description: undefined,
      tags: [],
    });

    await storage.saveFile(project.id, path.join('app', 'page.tsx'), 'export default function Page() {}');
    await storage.saveFile(
      project.id,
      path.join('app', 'blog', '[slug]', 'page.tsx'),
      'export default function BlogPage() {}'
    );

    const files = await storage.listFiles(project.id);
    expect(files).toEqual(
      expect.arrayContaining(['app/page.tsx', path.join('app', 'blog', '[slug]', 'page.tsx')])
    );
  });

  it('tracks assets for the images tab', async () => {
    const project = await storage.createProject({
      name: 'Images Project',
      description: undefined,
      tags: [],
    });

    await storage.saveAsset(project.id, path.join('images', 'logo.png'), new Uint8Array([0, 1, 2]));
    await storage.saveAsset(project.id, 'hero.jpg', new Uint8Array([5, 4, 3]));

    const assets = await storage.listAssets(project.id);
    expect(assets).toEqual(expect.arrayContaining(['images/logo.png', 'hero.jpg']));
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
