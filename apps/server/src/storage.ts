import { readFile, writeFile, readdir, mkdir, stat, rename, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import type { Project, GenerationHistory, AudioTrack, Manifest, SoundType } from '@loopsmith/core';
import { validatePathSafety, resolveInside, classifyAudioFile, isPathSafe } from '@loopsmith/core';

export const PROJECT_FILE = 'loopsmith.project.json';
export const HISTORY_FILE = 'history.json';
export const MANIFEST_SNAPSHOT_FILE = 'manifest.snapshot.json';
export const SOUND_TYPES: SoundType[] = ['SOUNDTRACK', 'SFX', 'VO', 'AMBIENCE', 'OTHER'];
export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];

export interface FolderNode {
  name: string;
  /** Path relative to the project folder, using forward slashes. "" is the project root. */
  path: string;
  children: FolderNode[];
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
  }
}

export function isAudioFile(filePath: string): boolean {
  return AUDIO_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * All file system access of the server goes through this class. Every path is validated to be
 * inside one of the configured roots (or, for manifest audio, inside the manifest folder).
 */
export class Storage {
  constructor(private readonly allowedRoots: string[]) {}

  get roots(): string[] {
    return [...this.allowedRoots];
  }

  private validatePath(targetPath: string): void {
    validatePathSafety(targetPath, this.allowedRoots);
  }

  isPathAllowed(targetPath: string): boolean {
    return isPathSafe(targetPath, this.allowedRoots);
  }

  async ensureDir(dirPath: string): Promise<void> {
    this.validatePath(dirPath);
    await mkdir(dirPath, { recursive: true });
  }

  // ---------- projects ----------

  async readProject(projectPath: string): Promise<Project | null> {
    this.validatePath(projectPath);
    const project = await readJson<Project>(path.join(projectPath, PROJECT_FILE));
    if (!project) return null;
    // The folder on disk is the source of truth (the project may have been moved or copied).
    return { ...project, path: projectPath };
  }

  async writeProject(project: Project): Promise<void> {
    this.validatePath(project.path);
    await this.ensureDir(project.path);
    await writeJson(path.join(project.path, PROJECT_FILE), project);
  }

  async listProjects(): Promise<Project[]> {
    const projects: Project[] = [];
    for (const root of this.allowedRoots) {
      let entries;
      try {
        entries = await readdir(root, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const project = await this.readProject(path.join(root, entry.name));
        if (project) projects.push(project);
      }
    }
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProject(id: string): Promise<Project> {
    const project = (await this.listProjects()).find((p) => p.id === id);
    if (!project) throw new HttpError(404, 'Project not found', 'PROJECT_NOT_FOUND');
    return project;
  }

  /** Removes Loopsmith metadata from a project folder. Audio files and folders are kept. */
  async unlinkProject(project: Project): Promise<void> {
    this.validatePath(project.path);
    for (const file of [PROJECT_FILE, HISTORY_FILE, MANIFEST_SNAPSHOT_FILE]) {
      await rm(path.join(project.path, file), { force: true });
    }
  }

  // ---------- history ----------

  async readHistory(projectPath: string): Promise<GenerationHistory[]> {
    this.validatePath(projectPath);
    return (await readJson<GenerationHistory[]>(path.join(projectPath, HISTORY_FILE))) ?? [];
  }

  async addHistoryEntry(projectPath: string, entry: GenerationHistory): Promise<void> {
    const history = await this.readHistory(projectPath);
    history.push(entry);
    await writeJson(path.join(projectPath, HISTORY_FILE), history);
  }

  // ---------- manifest ----------

  /** Reads a manifest file chosen by the user. It may live outside the roots (for example in a game repo). */
  async readExternalManifest(manifestPath: string): Promise<unknown> {
    if (!path.isAbsolute(manifestPath)) {
      throw new HttpError(400, 'The manifest path must be absolute', 'MANIFEST_PATH_NOT_ABSOLUTE');
    }
    if (path.extname(manifestPath).toLowerCase() !== '.json') {
      throw new HttpError(400, 'The manifest must be a .json file', 'MANIFEST_NOT_JSON');
    }
    let content: string;
    try {
      content = await readFile(manifestPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new HttpError(404, `Manifest not found: ${manifestPath}`, 'MANIFEST_NOT_FOUND');
      }
      throw error;
    }
    try {
      return JSON.parse(content.replace(/^\uFEFF/, ''));
    } catch {
      throw new HttpError(400, 'The manifest is not valid JSON', 'MANIFEST_INVALID_JSON');
    }
  }

  async readManifestSnapshot(projectPath: string): Promise<Manifest | null> {
    this.validatePath(projectPath);
    return readJson<Manifest>(path.join(projectPath, MANIFEST_SNAPSHOT_FILE));
  }

  async writeManifestSnapshot(projectPath: string, manifest: Manifest): Promise<void> {
    this.validatePath(projectPath);
    await writeJson(path.join(projectPath, MANIFEST_SNAPSHOT_FILE), manifest);
  }

  async deleteManifestSnapshot(projectPath: string): Promise<void> {
    this.validatePath(projectPath);
    await rm(path.join(projectPath, MANIFEST_SNAPSHOT_FILE), { force: true });
  }

  // ---------- folders ----------

  resolveProjectPath(project: Project, relativePath: string): string {
    let resolved: string;
    try {
      resolved = resolveInside(project.path, relativePath);
    } catch (error) {
      throw new HttpError(400, (error as Error).message, 'PATH_NOT_ALLOWED');
    }
    this.validatePath(resolved);
    return resolved;
  }

  async listFolderTree(project: Project): Promise<FolderNode> {
    const walk = async (absDir: string, relDir: string): Promise<FolderNode[]> => {
      const entries = await readdir(absDir, { withFileTypes: true });
      const nodes: FolderNode[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
        nodes.push({ name: entry.name, path: rel, children: await walk(path.join(absDir, entry.name), rel) });
      }
      return nodes.sort((a, b) => a.name.localeCompare(b.name));
    };
    this.validatePath(project.path);
    return { name: project.name, path: '', children: await walk(project.path, '') };
  }

  async createFolder(project: Project, parent: string, name: string): Promise<string> {
    const parentAbs = this.resolveProjectPath(project, parent);
    const target = this.resolveProjectPath(project, parent ? `${parent}/${name}` : name);
    if (!(await exists(parentAbs))) throw new HttpError(404, 'Parent folder not found', 'FOLDER_NOT_FOUND');
    if (await exists(target)) throw new HttpError(409, 'A folder with that name already exists', 'FOLDER_EXISTS');
    await mkdir(target);
    return toPosix(path.relative(project.path, target));
  }

  async renameFolder(project: Project, folderPath: string, newName: string): Promise<string> {
    if (!folderPath) throw new HttpError(400, 'The project root cannot be renamed here', 'ROOT_FOLDER');
    const source = this.resolveProjectPath(project, folderPath);
    const parentRel = toPosix(path.dirname(folderPath.replace(/\\/g, '/')));
    const target = this.resolveProjectPath(project, parentRel === '.' ? newName : `${parentRel}/${newName}`);
    if (!(await exists(source))) throw new HttpError(404, 'Folder not found', 'FOLDER_NOT_FOUND');
    if (await exists(target)) throw new HttpError(409, 'A folder with that name already exists', 'FOLDER_EXISTS');
    await rename(source, target);
    return toPosix(path.relative(project.path, target));
  }

  async deleteFolder(project: Project, folderPath: string, recursive: boolean): Promise<void> {
    if (!folderPath) throw new HttpError(400, 'The project root cannot be deleted here', 'ROOT_FOLDER');
    const target = this.resolveProjectPath(project, folderPath);
    let info;
    try {
      info = await stat(target);
    } catch {
      throw new HttpError(404, 'Folder not found', 'FOLDER_NOT_FOUND');
    }
    if (!info.isDirectory()) throw new HttpError(400, 'Not a folder', 'NOT_A_FOLDER');
    if (recursive) {
      await rm(target, { recursive: true });
      return;
    }
    if ((await readdir(target)).length > 0) {
      throw new HttpError(409, 'The folder is not empty', 'FOLDER_NOT_EMPTY');
    }
    await rmdir(target);
  }

  // ---------- tracks ----------

  async listLocalTracks(project: Project, generatedPaths: Set<string>): Promise<AudioTrack[]> {
    this.validatePath(project.path);
    const tracks: AudioTrack[] = [];

    const walk = async (absDir: string) => {
      const entries = await readdir(absDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(absDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && isAudioFile(entry.name)) {
          const rel = toPosix(path.relative(project.path, fullPath));
          const folder = toPosix(path.dirname(rel));
          const topFolder = rel.split('/')[0].toUpperCase();
          const type = (SOUND_TYPES as string[]).includes(topFolder)
            ? (topFolder as SoundType)
            : classifyAudioFile(entry.name, folder === '.' ? '' : folder);
          tracks.push({
            id: `local:${rel}`,
            name: entry.name,
            path: fullPath,
            type,
            folder: folder === '.' ? '' : folder,
            source: 'local',
            isGenerated: generatedPaths.has(path.resolve(fullPath).toLowerCase()),
            exists: true,
          });
        }
      }
    };

    try {
      await walk(project.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return tracks.sort((a, b) => a.id.localeCompare(b.id));
  }

  async writeAudioFile(filePath: string, data: Buffer): Promise<void> {
    this.validatePath(filePath);
    await this.ensureDir(path.dirname(filePath));
    await writeFile(filePath, data, { flag: 'wx' });
  }

  async fileExists(filePath: string): Promise<boolean> {
    return exists(filePath);
  }
}
