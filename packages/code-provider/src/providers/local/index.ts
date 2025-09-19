import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { Provider, InitializeInput, InitializeOutput, StartProjectInput, StartProjectOutput, StopProjectInput, StopProjectOutput, DestroyInput, DestroyOutput, GetFileInput, GetFileOutput, WriteFileInput, WriteFileOutput, ListFilesInput, ListFilesOutput, InstallDependenciesInput, InstallDependenciesOutput, RunCommandInput, RunCommandOutput } from '../types';

export interface LocalProviderOptions {
  projectPath: string;
  port?: number;
}

export class LocalProvider extends Provider {
  private projectPath: string;
  private port: number;
  private process: ChildProcess | null = null;

  constructor(options: LocalProviderOptions) {
    super();
    this.projectPath = options.projectPath;
    this.port = options.port || 3000;
  }

  async initialize(input: InitializeInput): Promise<InitializeOutput> {
    // Ensure project directory exists
    await fs.mkdir(this.projectPath, { recursive: true });
    return {};
  }

  async startProject(input: StartProjectInput): Promise<StartProjectOutput> {
    try {
      // Check if package.json exists
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      const packageJsonExists = await fs.access(packageJsonPath).then(() => true).catch(() => false);

      if (!packageJsonExists) {
        // Create a basic package.json
        const basicPackageJson = {
          name: 'onlook-project',
          version: '1.0.0',
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start'
          },
          dependencies: {
            'next': '^14.0.0',
            'react': '^18.0.0',
            'react-dom': '^18.0.0'
          }
        };
        await fs.writeFile(packageJsonPath, JSON.stringify(basicPackageJson, null, 2));
      }

      // Start the development server
      this.process = spawn('npm', ['run', 'dev'], {
        cwd: this.projectPath,
        stdio: 'pipe',
        env: {
          ...process.env,
          PORT: this.port.toString()
        }
      });

      // Wait a moment for the server to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      return {
        success: true,
        url: `http://localhost:${this.port}`
      };
    } catch (error) {
      console.error('Failed to start project:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async stopProject(input: StopProjectInput): Promise<StopProjectOutput> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    return { success: true };
  }

  async destroy(input: DestroyInput): Promise<DestroyOutput> {
    await this.stopProject({});
    return { success: true };
  }

  async getFile(input: GetFileInput): Promise<GetFileOutput> {
    try {
      const filePath = path.join(this.projectPath, input.path);
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        success: true,
        content
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'File not found'
      };
    }
  }

  async writeFile(input: WriteFileInput): Promise<WriteFileOutput> {
    try {
      const filePath = path.join(this.projectPath, input.path);
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, input.content, 'utf-8');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write file'
      };
    }
  }

  async listFiles(input: ListFilesInput): Promise<ListFilesOutput> {
    try {
      const dirPath = path.join(this.projectPath, input.path || '');
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        const relativePath = path.join(input.path || '', entry.name);
        if (entry.isDirectory()) {
          const subFiles = await this.listFiles({ path: relativePath });
          if (subFiles.success) {
            files.push(...subFiles.files);
          }
        } else {
          files.push(relativePath);
        }
      }

      return {
        success: true,
        files
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list files',
        files: []
      };
    }
  }

  async installDependencies(input: InstallDependenciesInput): Promise<InstallDependenciesOutput> {
    try {
      const process = spawn('npm', ['install'], {
        cwd: this.projectPath,
        stdio: 'pipe'
      });

      return new Promise((resolve) => {
        process.on('close', (code) => {
          resolve({
            success: code === 0,
            error: code !== 0 ? 'Failed to install dependencies' : undefined
          });
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to install dependencies'
      };
    }
  }

  async runCommand(input: RunCommandInput): Promise<RunCommandOutput> {
    try {
      const [command, ...args] = input.command.split(' ');
      const process = spawn(command, args, {
        cwd: this.projectPath,
        stdio: 'pipe'
      });

      let output = '';
      let error = '';

      process.stdout?.on('data', (data) => {
        output += data.toString();
      });

      process.stderr?.on('data', (data) => {
        error += data.toString();
      });

      return new Promise((resolve) => {
        process.on('close', (code) => {
          resolve({
            success: code === 0,
            output,
            error: code !== 0 ? error : undefined
          });
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run command',
        output: ''
      };
    }
  }
}
