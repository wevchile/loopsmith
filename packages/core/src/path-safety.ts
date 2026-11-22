import path from 'node:path';

const isCaseInsensitive = process.platform === 'win32' || process.platform === 'darwin';

function normalizeForCompare(p: string): string {
  const resolved = path.resolve(p);
  return isCaseInsensitive ? resolved.toLowerCase() : resolved;
}

/**
 * Returns true when `targetPath` is `basePath` itself or lives inside it.
 * Uses path.relative so that "C:\\data-other" is not treated as inside "C:\\data".
 */
export function isPathInside(targetPath: string, basePath: string): boolean {
  const target = normalizeForCompare(targetPath);
  const base = normalizeForCompare(basePath);
  if (target === base) return true;
  const rel = path.relative(base, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function isPathSafe(targetPath: string, allowedRoots: string[]): boolean {
  return allowedRoots.some((root) => isPathInside(targetPath, root));
}

export function validatePathSafety(targetPath: string, allowedRoots: string[]): void {
  if (!isPathSafe(targetPath, allowedRoots)) {
    throw new Error(`Path traversal attempt detected: ${targetPath}`);
  }
}

/**
 * Resolves a user supplied relative path (for example "SOUNDTRACK/boss") inside `basePath`.
 * Throws when the result would escape `basePath` or when the input is absolute.
 */
export function resolveInside(basePath: string, relativePath: string): string {
  const cleaned = (relativePath ?? '').replace(/\\/g, '/').trim();
  if (path.isAbsolute(cleaned) || /^[a-zA-Z]:/.test(cleaned)) {
    throw new Error(`Absolute paths are not allowed: ${relativePath}`);
  }
  const resolved = path.resolve(basePath, cleaned);
  if (!isPathInside(resolved, basePath)) {
    throw new Error(`Path traversal attempt detected: ${relativePath}`);
  }
  return resolved;
}

const INVALID_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** Validates a single folder or file name (no separators, no reserved names). */
export function isValidEntryName(name: string): boolean {
  if (!name || name.trim() !== name || name.length > 120) return false;
  if (name === '.' || name === '..') return false;
  if (name.endsWith('.')) return false;
  if (INVALID_NAME_CHARS.test(name)) return false;
  if (RESERVED_WINDOWS_NAMES.test(name)) return false;
  return true;
}

/** Turns arbitrary text into a safe file or folder name. */
export function toSafeName(input: string, fallback = 'untitled'): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_ .]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 80);
  return cleaned && isValidEntryName(cleaned) ? cleaned : fallback;
}
