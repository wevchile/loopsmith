import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Project, GenerationHistory, AudioTrack, Manifest } from '@loopsmith/core';
import { validatePathSafety } from '@loopsmith/core';

export class Storage {
  constructor(private allowedRoots: string[]) {}

  private validatePath(targetPath: string): void {
    validatePathSafety(targetPath, this.allowedRoots);
  }

  async ensureDir(dirPath: string): Promise<void> {
    this.validatePath(dirPath);
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async readProject(projectPath: string): Promise<Project | null> {
    this.validatePath(projectPath);
    const projectFile = path.join(projectPath, 'loopsmith.project.json');
    
    try {
      const content = await readFile(projectFile, 'utf-8');
      return JSON.parse(content) as Project;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async writeProject(project: Project): Promise<void> {
    this.validatePath(project.path);
    await this.ensureDir(project.path);
    const projectFile = path.join(project.path, 'loopsmith.project.json');
    await writeFile(projectFile, JSON.stringify(project, null, 2), 'utf-8');
  }

  async readHistory(projectPath: string): Promise<GenerationHistory[]> {
    this.validatePath(projectPath);
    const historyFile = path.join(projectPath, 'history.json');
    
    try {
      const content = await readFile(historyFile, 'utf-8');
      return JSON.parse(content) as GenerationHistory[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async writeHistory(projectPath: string, history: GenerationHistory[]): Promise<void> {
    this.validatePath(projectPath);
    await this.ensureDir(projectPath);
    const historyFile = path.join(projectPath, 'history.json');
    await writeFile(historyFile, JSON.stringify(history, null, 2), 'utf-8');
  }

  async addHistoryEntry(projectPath: string, entry: GenerationHistory): Promise<void> {
    const history = await this.readHistory(projectPath);
    history.push(entry);
    await this.writeHistory(projectPath, history);
  }

  async readManifest(manifestPath: string): Promise<Manifest | null> {
    this.validatePath(manifestPath);
    
    try {
      const content = await readFile(manifestPath, 'utf-8');
      return JSON.parse(content) as Manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async listProjects(rootPath: string): Promise<Project[]> {
    this.validatePath(rootPath);
    
    try {
      const entries = await readdir(rootPath, { withFileTypes: true });
      const projects: Project[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectPath = path.join(rootPath, entry.name);
          const project = await this.readProject(projectPath);
          if (project) {
            projects.push(project);
          }
        }
      }

      return projects;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async listAudioFiles(dirPath: string): Promise<AudioTrack[]> {
    this.validatePath(dirPath);
    
    const tracks: AudioTrack[] = [];
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          const subTracks = await this.listAudioFiles(fullPath);
          tracks.push(...subTracks);
        } else if (entry.isFile() && audioExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
          const stats = await stat(fullPath);
          const relativePath = path.relative(dirPath, fullPath);
          const folder = path.dirname(relativePath) || '.';

          tracks.push({
            id: fullPath,
            name: entry.name,
            path: fullPath,
            type: 'OTHER',
            folder,
            isGenerated: false,
          });
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return tracks;
  }

  async writeAudioFile(filePath: string, data: Buffer): Promise<void> {
    this.validatePath(filePath);
    await this.ensureDir(path.dirname(filePath));
    await writeFile(filePath, data);
  }

  isPathAllowed(targetPath: string): boolean {
    try {
      this.validatePath(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
