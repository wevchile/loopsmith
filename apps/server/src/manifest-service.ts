import path from 'node:path';
import { stat } from 'node:fs/promises';
import type { AudioTrack, Manifest, ManifestEntry, ManifestSyncDiff, Project } from '@loopsmith/core';
import { computeManifestDiff, manifestSchema, resolveInside } from '@loopsmith/core';
import { HttpError, isAudioFile, type Storage } from './storage.js';

export interface ManifestSummary {
  added: number;
  removed: number;
  renamed: number;
  moved: number;
  updated: number;
  unchanged: number;
  hasChanges: boolean;
}

export function summarize(diff: ManifestSyncDiff): ManifestSummary {
  const summary = {
    added: diff.added.length,
    removed: diff.removed.length,
    renamed: diff.renamed.length,
    moved: diff.moved.length,
    updated: diff.updated.length,
    unchanged: diff.unchanged,
  };
  return {
    ...summary,
    hasChanges: summary.added + summary.removed + summary.renamed + summary.moved + summary.updated > 0,
  };
}

/** Entry paths are relative to the folder that contains the manifest file. */
export function resolveManifestEntry(manifestPath: string, entry: ManifestEntry): string {
  return resolveInside(path.dirname(manifestPath), entry.relativePath);
}

/** Reads and validates a manifest. Rejects duplicate ids and entries that point outside the manifest folder. */
export async function loadManifest(storage: Storage, manifestPath: string): Promise<Manifest> {
  const raw = await storage.readExternalManifest(manifestPath);
  const result = manifestSchema.safeParse(raw);
  if (!result.success) {
    throw Object.assign(new HttpError(400, 'Invalid manifest format', 'MANIFEST_INVALID'), {
      details: result.error.errors,
    });
  }
  const manifest = result.data as Manifest;

  const seen = new Set<string>();
  for (const entry of manifest.entries) {
    if (seen.has(entry.id)) {
      throw new HttpError(400, `Duplicate manifest entry id: ${entry.id}`, 'MANIFEST_DUPLICATE_ID');
    }
    seen.add(entry.id);
    try {
      resolveManifestEntry(manifestPath, entry);
    } catch {
      throw new HttpError(
        400,
        `Entry "${entry.id}" points outside the manifest folder: ${entry.relativePath}`,
        'MANIFEST_PATH_OUTSIDE'
      );
    }
  }
  return manifest;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

export async function findMissingFiles(manifestPath: string, manifest: Manifest): Promise<string[]> {
  const missing: string[] = [];
  for (const entry of manifest.entries) {
    if (!(await fileExists(resolveManifestEntry(manifestPath, entry)))) missing.push(entry.id);
  }
  return missing;
}

export async function previewManifest(storage: Storage, project: Project, manifestPath: string) {
  const manifest = await loadManifest(storage, manifestPath);
  const snapshot = await storage.readManifestSnapshot(project.path);
  const samePath =
    project.manifestPath && path.resolve(project.manifestPath).toLowerCase() === path.resolve(manifestPath).toLowerCase();
  // A different manifest file is compared against the current snapshot too, so switching files shows what changes.
  const diff = computeManifestDiff(snapshot, manifest);
  return {
    manifestPath,
    isFirstLink: !snapshot,
    isSameFile: Boolean(samePath),
    diff,
    summary: summarize(diff),
    missingFiles: await findMissingFiles(manifestPath, manifest),
    entryCount: manifest.entries.length,
    gameRepo: manifest.gameRepo,
  };
}

export async function applyManifest(storage: Storage, project: Project, manifestPath: string) {
  const preview = await previewManifest(storage, project, manifestPath);
  const manifest = await loadManifest(storage, manifestPath);
  const now = new Date().toISOString();
  await storage.writeManifestSnapshot(project.path, { ...manifest, lastSync: now });
  const updated: Project = { ...project, manifestPath, manifestSyncedAt: now, updatedAt: now };
  await storage.writeProject(updated);
  return { ...preview, project: updated };
}

export async function listManifestTracks(storage: Storage, project: Project): Promise<AudioTrack[]> {
  if (!project.manifestPath) return [];
  const snapshot = await storage.readManifestSnapshot(project.path);
  if (!snapshot) return [];
  const tracks: AudioTrack[] = [];
  for (const entry of snapshot.entries) {
    let abs: string;
    try {
      abs = resolveManifestEntry(project.manifestPath, entry);
    } catch {
      continue;
    }
    tracks.push({
      id: `manifest:${entry.id}`,
      name: entry.name,
      path: abs,
      type: entry.type,
      folder: entry.folder,
      source: 'manifest',
      duration: entry.duration,
      hash: entry.hash,
      loopMarkers: entry.loopMarkers,
      isGenerated: false,
      exists: await fileExists(abs),
    });
  }
  return tracks;
}

/**
 * Resolves a track id to an absolute audio file path, enforcing that local tracks stay inside the
 * project folder and manifest tracks stay inside the manifest folder and are listed in the snapshot.
 */
export async function resolveTrackPath(storage: Storage, project: Project, trackId: string): Promise<string> {
  let abs: string;
  if (trackId.startsWith('local:')) {
    abs = storage.resolveProjectPath(project, trackId.slice('local:'.length));
  } else if (trackId.startsWith('manifest:')) {
    const entryId = trackId.slice('manifest:'.length);
    const snapshot = project.manifestPath ? await storage.readManifestSnapshot(project.path) : null;
    const entry = snapshot?.entries.find((e) => e.id === entryId);
    if (!entry || !project.manifestPath) throw new HttpError(404, 'Track not found', 'TRACK_NOT_FOUND');
    try {
      abs = resolveManifestEntry(project.manifestPath, entry);
    } catch {
      throw new HttpError(400, 'Track path not allowed', 'PATH_NOT_ALLOWED');
    }
  } else {
    throw new HttpError(400, 'Invalid track id', 'INVALID_TRACK_ID');
  }
  if (!isAudioFile(abs)) throw new HttpError(400, 'Not an audio file', 'NOT_AUDIO');
  if (!(await fileExists(abs))) throw new HttpError(404, 'Audio file not found on disk', 'FILE_NOT_FOUND');
  return abs;
}
