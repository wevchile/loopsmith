import path from 'node:path';

export function isPathSafe(targetPath: string, allowedRoots: string[]): boolean {
  const normalized = path.normalize(targetPath);
  const resolved = path.resolve(normalized);

  for (const root of allowedRoots) {
    const resolvedRoot = path.resolve(root);
    if (resolved.startsWith(resolvedRoot + path.sep) || resolved === resolvedRoot) {
      return true;
    }
  }

  return false;
}

export function validatePathSafety(targetPath: string, allowedRoots: string[]): void {
  if (!isPathSafe(targetPath, allowedRoots)) {
    throw new Error(`Path traversal attempt detected: ${targetPath}`);
  }
}
