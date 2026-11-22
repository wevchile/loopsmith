import type { Manifest, ManifestEntry, ManifestSyncDiff } from './types.js';

export function computeManifestDiff(
  oldManifest: Manifest | null,
  newManifest: Manifest
): ManifestSyncDiff {
  const diff: ManifestSyncDiff = {
    added: [],
    removed: [],
    renamed: [],
    moved: [],
  };

  if (!oldManifest) {
    diff.added = [...newManifest.entries];
    return diff;
  }

  const oldEntriesById = new Map(oldManifest.entries.map(e => [e.id, e]));
  const newEntriesById = new Map(newManifest.entries.map(e => [e.id, e]));
  const oldEntriesByHash = new Map(
    oldManifest.entries.filter(e => e.hash).map(e => [e.hash!, e])
  );
  const newEntriesByHash = new Map(
    newManifest.entries.filter(e => e.hash).map(e => [e.hash!, e])
  );

  const processedNewIds = new Set<string>();
  const processedOldIds = new Set<string>();

  for (const newEntry of newManifest.entries) {
    const oldEntryById = oldEntriesById.get(newEntry.id);

    if (oldEntryById) {
      processedNewIds.add(newEntry.id);
      processedOldIds.add(oldEntryById.id);

      if (oldEntryById.name !== newEntry.name) {
        diff.renamed.push({ old: oldEntryById, new: newEntry });
      } else if (oldEntryById.folder !== newEntry.folder || oldEntryById.relativePath !== newEntry.relativePath) {
        diff.moved.push({ old: oldEntryById, new: newEntry });
      }
      continue;
    }

    if (newEntry.hash) {
      const oldEntryByHash = oldEntriesByHash.get(newEntry.hash);
      if (oldEntryByHash && !processedOldIds.has(oldEntryByHash.id)) {
        processedNewIds.add(newEntry.id);
        processedOldIds.add(oldEntryByHash.id);

        if (oldEntryByHash.name !== newEntry.name) {
          diff.renamed.push({ old: oldEntryByHash, new: newEntry });
        } else if (oldEntryByHash.folder !== newEntry.folder || oldEntryByHash.relativePath !== newEntry.relativePath) {
          diff.moved.push({ old: oldEntryByHash, new: newEntry });
        }
        continue;
      }
    }

    if (!processedNewIds.has(newEntry.id)) {
      diff.added.push(newEntry);
      processedNewIds.add(newEntry.id);
    }
  }

  for (const oldEntry of oldManifest.entries) {
    if (!processedOldIds.has(oldEntry.id)) {
      diff.removed.push(oldEntry);
    }
  }

  return diff;
}

export function applyManifestDiff(
  currentEntries: ManifestEntry[],
  diff: ManifestSyncDiff
): ManifestEntry[] {
  const entriesById = new Map(currentEntries.map(e => [e.id, e]));

  for (const removed of diff.removed) {
    entriesById.delete(removed.id);
  }

  for (const { old, new: newEntry } of diff.renamed) {
    entriesById.delete(old.id);
    entriesById.set(newEntry.id, newEntry);
  }

  for (const { old, new: newEntry } of diff.moved) {
    entriesById.delete(old.id);
    entriesById.set(newEntry.id, newEntry);
  }

  for (const added of diff.added) {
    entriesById.set(added.id, added);
  }

  return Array.from(entriesById.values());
}
