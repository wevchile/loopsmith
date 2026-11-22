import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, constants as fsConstants } from 'node:fs';
import { copyFile, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { GenerationHistory, Manifest, ManifestEntry, Project, ReplacementRecord } from '@loopsmith/core';
import { isPathInside, resolveInside } from '@loopsmith/core';
import type { AudioFormat, AudioTools } from './audio-length.js';
import { HttpError, isAudioFile, toPosix, type Storage } from './storage.js';

/**
 * "Reemplazar original": writes an AI track over a manifest original in the game repository.
 *
 * This is the only place where Loopsmith modifies files of a game. Order of operations:
 *   1. compute the next free numbered backup name in the same folder (name_1.ext, name_2.ext, ...),
 *   2. rename the original to that backup name (before anything is written),
 *   3. copy or convert the AI track to a temporary file in the same folder and rename it into the
 *      original's exact file name.
 * Any failure after step 2 restores the original. Files are never overwritten. Every replacement is
 * recorded (replacements.json in the project, .loopsmith-backups.json in the game) and can be reverted.
 */

export const REPLACEMENTS_FILE = 'replacements.json';
/** Lists the backups Loopsmith created in a game repository so manifest generators can skip them. */
export const BACKUP_REGISTRY_FILE = '.loopsmith-backups.json';

export interface FsOps {
  rename(from: string, to: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  remove(target: string): Promise<void>;
}

export const realFsOps: FsOps = {
  rename: (from, to) => rename(from, to),
  // COPYFILE_EXCL: fail instead of overwriting an existing file.
  copyFile: (from, to) => copyFile(from, to, fsConstants.COPYFILE_EXCL),
  remove: (target) => rm(target, { force: true }),
};

interface BackupRegistry {
  comment: string;
  version: 1;
  files: Array<{ path: string; original: string; kind: 'backup' | 'replaced-version'; createdAt: string }>;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve())
      .on('error', reject);
  });
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Next free numbered name in the same folder: soundtrack_autum.wav -> soundtrack_autum_1.wav,
 * then _2 and so on, skipping names that exist on disk or are reserved (other manifest entries or
 * recorded backups, compared case-insensitively).
 */
export async function nextBackupName(filePath: string, reserved: Set<string> = new Set()): Promise<string> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const stem = path.basename(filePath, ext);
  for (let n = 1; n < 10_000; n++) {
    const candidate = path.join(dir, `${stem}_${n}${ext}`);
    if (!reserved.has(candidate.toLowerCase()) && !(await exists(candidate))) return candidate;
  }
  throw new HttpError(409, 'No free backup name', 'NO_BACKUP_NAME');
}

// ---------- manifest file (format preserving) ----------

interface ManifestFile {
  text: string;
  data: Manifest;
}

async function readManifestFile(manifestPath: string): Promise<ManifestFile> {
  const text = await readFile(manifestPath, 'utf-8');
  return { text, data: JSON.parse(text.replace(/^\uFEFF/, '')) as Manifest };
}

/** Serializes like the original file: same indentation, line endings, BOM and final newline. */
export function formatLike(original: string, data: unknown): string {
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const indentMatch = original.match(/\n([ \t]+)\S/);
  const indent = indentMatch ? indentMatch[1]! : undefined;
  let out = JSON.stringify(data, null, indent);
  if (eol === '\r\n') out = out.replace(/\n/g, '\r\n');
  if (/\r?\n\s*$/.test(original)) out += eol;
  return bom + out;
}

/** Writes through a temporary file in the same folder, then renames it into place. */
async function writeAtomic(filePath: string, content: string): Promise<void> {
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.loopsmith-tmp-${randomBytes(4).toString('hex')}`);
  await writeFile(tmp, content, { encoding: 'utf-8', flag: 'wx' });
  try {
    await rename(tmp, filePath);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

/** Updates hash (and duration, when the entry has one) of one entry; the rest of the file is kept as is. */
export function patchManifestText(text: string, entryId: string, patch: { hash: string; duration?: number }): string {
  const data = JSON.parse(text.replace(/^\uFEFF/, '')) as { entries: Array<Record<string, unknown>> };
  const entry = data.entries.find((e) => e.id === entryId);
  if (!entry) throw new HttpError(409, 'The manifest entry no longer exists', 'MANIFEST_OUT_OF_SYNC');
  entry.hash = patch.hash;
  if ('duration' in entry && patch.duration !== undefined) entry.duration = Math.round(patch.duration * 1000) / 1000;
  return formatLike(text, data);
}

// ---------- service ----------

export interface ReplacePreview {
  generationId: string;
  originalTrackId: string;
  entryId: string;
  gameRoot: string;
  manifestPath: string;
  source: { path: string; name: string; format: string };
  target: { path: string; relativePath: string; name: string; format: string };
  backup: { path: string; relativePath: string; name: string };
  conversion: ReplacementRecord['conversion'] | null;
  /** Replacements of this original that are still active (each one has its own backup). */
  activeReplacements: number;
}

export interface RevertPreview {
  entryId: string;
  record: ReplacementRecord;
  target: { path: string; relativePath: string; name: string };
  backup: { path: string; relativePath: string; name: string };
  /** What happens to the file currently in place (the replaced AI version). */
  current: { exists: boolean; matchesReplacement: boolean; action: 'delete' | 'keep'; keepRelativePath?: string };
}

interface Context {
  project: Project;
  entry: GenerationHistory;
  manifestPath: string;
  gameRoot: string;
  manifestEntry: ManifestEntry;
  manifestFile: ManifestFile;
  snapshot: Manifest;
  target: string;
  source: string;
}

export async function readReplacementRecords(projectPath: string): Promise<ReplacementRecord[]> {
  try {
    return JSON.parse(await readFile(path.join(projectPath, REPLACEMENTS_FILE), 'utf-8')) as ReplacementRecord[];
  } catch {
    return [];
  }
}

const extLabel = (p: string) => path.extname(p).slice(1).toUpperCase();

export class ReplaceService {
  private locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly storage: Storage,
    private readonly audioTools: AudioTools,
    private readonly resolveSource: (project: Project, entry: GenerationHistory) => string,
    private readonly ops: FsOps = realFsOps
  ) {}

  /** One replace or revert at a time per game repository. */
  private withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    this.locks.set(key, run.catch(() => undefined));
    return run;
  }

  // ----- records -----

  readRecords(projectPath: string): Promise<ReplacementRecord[]> {
    return readReplacementRecords(projectPath);
  }

  private async writeRecords(projectPath: string, records: ReplacementRecord[]): Promise<void> {
    await writeAtomic(path.join(projectPath, REPLACEMENTS_FILE), JSON.stringify(records, null, 2) + '\n');
  }

  /** Active replacements of one original, oldest first (the last one is what is in the game now). */
  static activeStack(records: ReplacementRecord[], entryId: string): ReplacementRecord[] {
    return records
      .filter((r) => r.entryId === entryId && r.status === 'active')
      .sort((a, b) => a.replacedAt.localeCompare(b.replacedAt));
  }

  private async readRegistry(gameRoot: string): Promise<{ text: string | null; data: BackupRegistry }> {
    const file = path.join(gameRoot, BACKUP_REGISTRY_FILE);
    try {
      const text = await readFile(file, 'utf-8');
      return { text, data: JSON.parse(text) as BackupRegistry };
    } catch {
      return {
        text: null,
        data: {
          comment: 'Files created by Loopsmith when an original sound was replaced. Manifest generators must skip every path listed here.',
          version: 1,
          files: [],
        },
      };
    }
  }

  private async writeRegistry(gameRoot: string, data: BackupRegistry): Promise<void> {
    await writeAtomic(path.join(gameRoot, BACKUP_REGISTRY_FILE), JSON.stringify(data, null, 2) + '\n');
  }

  private async restoreRegistry(gameRoot: string, text: string | null): Promise<void> {
    const file = path.join(gameRoot, BACKUP_REGISTRY_FILE);
    if (text === null) await rm(file, { force: true });
    else await writeAtomic(file, text);
  }

  // ----- path safety -----

  private inGame(gameRoot: string, relativePath: string): string {
    try {
      return resolveInside(gameRoot, relativePath);
    } catch {
      throw new HttpError(400, 'Path outside the game repository', 'PATH_NOT_ALLOWED');
    }
  }

  /** Rejects folders that resolve outside the game repository through links. */
  private async assertRealInside(gameRoot: string, filePath: string): Promise<void> {
    const [root, dir] = await Promise.all([realpath(gameRoot), realpath(path.dirname(filePath))]);
    if (!isPathInside(dir, root)) throw new HttpError(400, 'Path outside the game repository', 'PATH_NOT_ALLOWED');
  }

  private rel(gameRoot: string, abs: string): string {
    return toPosix(path.relative(gameRoot, abs));
  }

  /** Paths that must never be used as a backup name. */
  private async reserved(ctx: { gameRoot: string; manifestFile: ManifestFile }): Promise<Set<string>> {
    const set = new Set<string>();
    for (const e of ctx.manifestFile.data.entries) {
      try {
        set.add(resolveInside(ctx.gameRoot, e.relativePath).toLowerCase());
      } catch {
        // ignore invalid entries
      }
    }
    for (const f of (await this.readRegistry(ctx.gameRoot)).data.files) {
      try {
        set.add(resolveInside(ctx.gameRoot, f.path).toLowerCase());
      } catch {
        // ignore
      }
    }
    return set;
  }

  /** Loads the manifest entry from the linked manifest file and checks it matches the project snapshot. */
  private async loadEntry(project: Project, entryId: string) {
    if (!project.manifestPath) throw new HttpError(400, 'The project has no linked manifest', 'NO_MANIFEST');
    const manifestPath = project.manifestPath;
    const gameRoot = path.dirname(manifestPath);
    const snapshot = await this.storage.readManifestSnapshot(project.path);
    const snapEntry = snapshot?.entries.find((e) => e.id === entryId);
    if (!snapEntry) throw new HttpError(400, 'The original track is not in the linked manifest', 'ORIGINAL_NOT_FOUND');
    let manifestFile: ManifestFile;
    try {
      manifestFile = await readManifestFile(manifestPath);
    } catch {
      throw new HttpError(409, 'The game manifest cannot be read', 'MANIFEST_UNREADABLE');
    }
    const manifestEntry = manifestFile.data.entries?.find((e) => e.id === entryId);
    if (!manifestEntry || manifestEntry.relativePath !== snapEntry.relativePath) {
      throw new HttpError(409, 'The game manifest changed. Check for changes and apply them first.', 'MANIFEST_OUT_OF_SYNC');
    }
    const target = this.inGame(gameRoot, manifestEntry.relativePath);
    if (!isAudioFile(target)) throw new HttpError(400, 'Not an audio file', 'NOT_AUDIO');
    return { manifestPath, gameRoot, manifestEntry, manifestFile, target, snapshot: snapshot! };
  }

  private async context(project: Project, genId: string): Promise<Context> {
    const history = await this.storage.readHistory(project.path);
    const entry = history.find((h) => h.id === genId);
    if (!entry) throw new HttpError(404, 'Generated track not found', 'GENERATION_NOT_FOUND');
    if (!entry.originalTrackId?.startsWith('manifest:')) {
      throw new HttpError(400, 'Link the AI track to an original first', 'NOT_LINKED');
    }
    const loaded = await this.loadEntry(project, entry.originalTrackId.slice('manifest:'.length));
    if (!(await exists(loaded.target))) throw new HttpError(404, 'The original file does not exist on disk', 'ORIGINAL_FILE_MISSING');
    await this.assertRealInside(loaded.gameRoot, loaded.target);
    const source = this.resolveSource(project, entry);
    if (!(await exists(source))) throw new HttpError(404, 'The AI track file does not exist on disk', 'FILE_NOT_FOUND');
    return { project, entry, ...loaded, source };
  }

  private async conversionFor(ctx: Context): Promise<{ info: ReplacementRecord['conversion'] | null; format: AudioFormat }> {
    const from = path.extname(ctx.source).toLowerCase();
    const to = path.extname(ctx.target).toLowerCase();
    if (from === to) return { info: null, format: {} };
    if (!(await this.audioTools.hasFfmpeg())) {
      throw new HttpError(400, `ffmpeg is required to convert ${extLabel(ctx.source)} to ${extLabel(ctx.target)}`, 'FFMPEG_REQUIRED');
    }
    const format = await this.audioTools.probeFormat(ctx.target);
    return {
      info: { from: from.slice(1), to: to.slice(1), sampleRate: format.sampleRate, channels: format.channels, codec: format.codec },
      format,
    };
  }

  async preview(project: Project, genId: string): Promise<ReplacePreview> {
    const ctx = await this.context(project, genId);
    const backup = await nextBackupName(ctx.target, await this.reserved(ctx));
    const { info } = await this.conversionFor(ctx);
    const records = await this.readRecords(project.path);
    return {
      generationId: genId,
      originalTrackId: ctx.entry.originalTrackId!,
      entryId: ctx.manifestEntry.id,
      gameRoot: ctx.gameRoot,
      manifestPath: ctx.manifestPath,
      source: { path: ctx.source, name: path.basename(ctx.source), format: extLabel(ctx.source) },
      target: { path: ctx.target, relativePath: ctx.manifestEntry.relativePath, name: path.basename(ctx.target), format: extLabel(ctx.target) },
      backup: { path: backup, relativePath: this.rel(ctx.gameRoot, backup), name: path.basename(backup) },
      conversion: info,
      activeReplacements: ReplaceService.activeStack(records, ctx.manifestEntry.id).length,
    };
  }

  async replace(project: Project, genId: string, expectedBackupName?: string) {
    const gameKey = project.manifestPath ? path.dirname(project.manifestPath).toLowerCase() : project.path;
    return this.withLock(gameKey, async () => {
      const ctx = await this.context(project, genId);
      const backup = await nextBackupName(ctx.target, await this.reserved(ctx));
      if (expectedBackupName && expectedBackupName !== path.basename(backup)) {
        throw new HttpError(409, 'The backup name changed since the preview. Review it again.', 'PREVIEW_STALE');
      }
      const { info: conversion, format } = await this.conversionFor(ctx);
      const hashBefore = await hashFile(ctx.target);
      const durationBefore = ctx.manifestEntry.duration ?? (await this.audioTools.measure(ctx.target).catch(() => undefined));
      const dir = path.dirname(ctx.target);
      const tmp = path.join(dir, `.${path.basename(ctx.target, path.extname(ctx.target))}.loopsmith-tmp-${randomBytes(4).toString('hex')}${path.extname(ctx.target)}`);
      const registry = await this.readRegistry(ctx.gameRoot);
      const snapshotBefore = structuredClone(ctx.snapshot);

      // Step 2: the original gets its backup name before anything is written with its name.
      if (await exists(backup)) throw new HttpError(409, 'The backup name is already taken', 'FILE_EXISTS');
      await this.ops.rename(ctx.target, backup);

      let placed = false;
      let manifestWritten = false;
      let registryWritten = false;
      try {
        // Step 3: copy or convert next to the original, then move into the original's exact name.
        if (conversion) await this.audioTools.convert(ctx.source, tmp, format);
        else await this.ops.copyFile(ctx.source, tmp);
        if (await exists(ctx.target)) throw new HttpError(409, 'A file appeared with the original name', 'FILE_EXISTS');
        await this.ops.rename(tmp, ctx.target);
        placed = true;

        const hashAfter = await hashFile(ctx.target);
        const durationAfter = await this.audioTools.measure(ctx.target).catch(() => undefined);
        const now = new Date().toISOString();

        await writeAtomic(ctx.manifestPath, patchManifestText(ctx.manifestFile.text, ctx.manifestEntry.id, { hash: hashAfter, duration: durationAfter }));
        manifestWritten = true;

        registry.data.files.push({ path: this.rel(ctx.gameRoot, backup), original: ctx.manifestEntry.relativePath, kind: 'backup', createdAt: now });
        await this.writeRegistry(ctx.gameRoot, registry.data);
        registryWritten = true;

        await this.patchSnapshot(project, ctx.manifestEntry.id, hashAfter, durationAfter);

        const record: ReplacementRecord = {
          id: nanoid(10),
          entryId: ctx.manifestEntry.id,
          relativePath: ctx.manifestEntry.relativePath,
          backupRelativePath: this.rel(ctx.gameRoot, backup),
          generationId: ctx.entry.id,
          sourceTrackId: ctx.entry.outputTrackId ?? toPosix(path.relative(project.path, ctx.source)),
          ...(conversion ? { conversion } : {}),
          hashBefore,
          hashAfter,
          durationBefore,
          durationAfter,
          replacedAt: now,
          status: 'active',
        };
        const records = await this.readRecords(project.path);
        records.push(record);
        await this.writeRecords(project.path, records);
        return { record, backupPath: backup, targetPath: ctx.target };
      } catch (error) {
        // Roll back in reverse order. The original name only ever holds our file when `placed` is true.
        await this.ops.remove(tmp).catch(() => undefined);
        try {
          if (placed) await this.ops.remove(ctx.target);
          await this.ops.rename(backup, ctx.target);
        } catch (rollbackError) {
          throw Object.assign(
            new HttpError(500, `Replacement failed and the original could not be restored automatically. It is safe at ${backup}`, 'ROLLBACK_FAILED'),
            { details: { cause: String(error), rollback: String(rollbackError), backup } }
          );
        }
        if (manifestWritten) await writeAtomic(ctx.manifestPath, ctx.manifestFile.text).catch(() => undefined);
        if (registryWritten) await this.restoreRegistry(ctx.gameRoot, registry.text).catch(() => undefined);
        await this.storage.writeManifestSnapshot(project.path, snapshotBefore).catch(() => undefined);
        throw error;
      }
    });
  }

  /** Keeps the project snapshot equal to the game manifest for this entry, so no spurious change shows up. */
  private async patchSnapshot(project: Project, entryId: string, hash: string, duration?: number): Promise<void> {
    const snapshot = await this.storage.readManifestSnapshot(project.path);
    const entry = snapshot?.entries.find((e) => e.id === entryId);
    if (!snapshot || !entry) return;
    entry.hash = hash;
    if (entry.duration !== undefined && duration !== undefined) entry.duration = Math.round(duration * 1000) / 1000;
    await this.storage.writeManifestSnapshot(project.path, snapshot);
  }

  private async revertContext(project: Project, entryId: string) {
    const records = await this.readRecords(project.path);
    const stack = ReplaceService.activeStack(records, entryId);
    const record = stack.at(-1);
    if (!record) throw new HttpError(404, 'This original has no active replacement', 'NO_REPLACEMENT');
    const loaded = await this.loadEntry(project, entryId);
    if (loaded.manifestEntry.relativePath !== record.relativePath) {
      throw new HttpError(409, 'The original moved since it was replaced', 'MANIFEST_OUT_OF_SYNC');
    }
    const backup = this.inGame(loaded.gameRoot, record.backupRelativePath);
    if (!(await exists(backup))) throw new HttpError(409, `The backup file is missing: ${record.backupRelativePath}`, 'BACKUP_MISSING');
    await this.assertRealInside(loaded.gameRoot, backup);
    const currentExists = await exists(loaded.target);
    const matches = currentExists && (await hashFile(loaded.target)) === record.hashAfter;
    const history = await this.storage.readHistory(project.path);
    const gen = history.find((h) => h.id === record.generationId);
    const aiStillInProject = Boolean(gen && (await exists(this.resolveSource(project, gen))));
    // Delete the replaced version only when it is exactly what Loopsmith wrote and the AI track is still
    // in the project. Otherwise keep it next to the original with the next numbered name.
    const keep = currentExists && (!matches || !aiStillInProject);
    const reserved = await this.reserved(loaded);
    reserved.add(backup.toLowerCase());
    const keepPath = keep ? await nextBackupName(loaded.target, reserved) : undefined;
    return { records, record, loaded, backup, currentExists, matches, keep, keepPath };
  }

  async revertPreview(project: Project, entryId: string): Promise<RevertPreview> {
    const c = await this.revertContext(project, entryId);
    return {
      entryId,
      record: c.record,
      target: { path: c.loaded.target, relativePath: c.record.relativePath, name: path.basename(c.loaded.target) },
      backup: { path: c.backup, relativePath: c.record.backupRelativePath, name: path.basename(c.backup) },
      current: {
        exists: c.currentExists,
        matchesReplacement: c.matches,
        action: c.keep ? 'keep' : 'delete',
        keepRelativePath: c.keepPath ? this.rel(c.loaded.gameRoot, c.keepPath) : undefined,
      },
    };
  }

  async revert(project: Project, entryId: string) {
    const gameKey = project.manifestPath ? path.dirname(project.manifestPath).toLowerCase() : project.path;
    return this.withLock(gameKey, async () => {
      const c = await this.revertContext(project, entryId);
      const { loaded, record, backup } = c;
      const dir = path.dirname(loaded.target);
      const aside = c.keep
        ? c.keepPath!
        : path.join(dir, `.${path.basename(loaded.target)}.loopsmith-revert-${randomBytes(4).toString('hex')}`);
      const registry = await this.readRegistry(loaded.gameRoot);

      // Move the replaced version out of the way first, then give the backup its name back.
      if (c.currentExists) {
        if (await exists(aside)) throw new HttpError(409, 'The temporary name is already taken', 'FILE_EXISTS');
        await this.ops.rename(loaded.target, aside);
      }
      try {
        await this.ops.rename(backup, loaded.target);
      } catch (error) {
        if (c.currentExists) await this.ops.rename(aside, loaded.target).catch(() => undefined);
        throw error;
      }
      if (c.currentExists && !c.keep) await this.ops.remove(aside);

      const hash = await hashFile(loaded.target);
      const duration = await this.audioTools.measure(loaded.target).catch(() => undefined);
      const current = await readManifestFile(loaded.manifestPath);
      await writeAtomic(loaded.manifestPath, patchManifestText(current.text, entryId, { hash, duration: record.durationBefore ?? duration }));
      registry.data.files = registry.data.files.filter((f) => f.path.toLowerCase() !== record.backupRelativePath.toLowerCase());
      if (c.keep && c.keepPath) {
        registry.data.files.push({ path: this.rel(loaded.gameRoot, c.keepPath), original: record.relativePath, kind: 'replaced-version', createdAt: new Date().toISOString() });
      }
      await this.writeRegistry(loaded.gameRoot, registry.data);
      await this.patchSnapshot(project, entryId, hash, record.durationBefore ?? duration);

      const stored = c.records.find((r) => r.id === record.id)!;
      stored.status = 'reverted';
      stored.revertedAt = new Date().toISOString();
      stored.revertResult = c.keep ? { action: 'kept', keptRelativePath: this.rel(loaded.gameRoot, c.keepPath!) } : { action: 'deleted' };
      await this.writeRecords(project.path, c.records);
      return { record: stored, restoredHash: hash, matchesOriginal: hash === record.hashBefore };
    });
  }
}
