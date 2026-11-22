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
    updated: [],
    unchanged: 0,
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

      classifyPair(diff, oldEntryById, newEntry);
      continue;
    }

    if (newEntry.hash) {
      const oldEntryByHash = oldEntriesByHash.get(newEntry.hash);
      if (oldEntryByHash && !processedOldIds.has(oldEntryByHash.id)) {
        processedNewIds.add(newEntry.id);
        processedOldIds.add(oldEntryByHash.id);

        classifyPair(diff, oldEntryByHash, newEntry);
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

function hasContentChange(a: ManifestEntry, b: ManifestEntry): boolean {
  return (
    a.type !== b.type ||
    a.hash !== b.hash ||
    a.duration !== b.duration ||
    a.loopMarkers?.start !== b.loopMarkers?.start ||
    a.loopMarkers?.end !== b.loopMarkers?.end
  );
}

function classifyPair(diff: ManifestSyncDiff, oldEntry: ManifestEntry, newEntry: ManifestEntry): void {
  if (oldEntry.name !== newEntry.name) {
    diff.renamed.push({ old: oldEntry, new: newEntry });
  } else if (oldEntry.folder !== newEntry.folder || oldEntry.relativePath !== newEntry.relativePath) {
    diff.moved.push({ old: oldEntry, new: newEntry });
  } else if (hasContentChange(oldEntry, newEntry)) {
    diff.updated.push({ old: oldEntry, new: newEntry });
  } else {
    diff.unchanged += 1;
  }
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

  for (const { old, new: newEntry } of diff.updated) {
    entriesById.delete(old.id);
    entriesById.set(newEntry.id, newEntry);
  }

  for (const added of diff.added) {
    entriesById.set(added.id, added);
  }

  return Array.from(entriesById.values());
}
