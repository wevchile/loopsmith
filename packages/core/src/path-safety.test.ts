import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { isPathSafe, validatePathSafety, isPathInside, resolveInside, isValidEntryName, toSafeName } from './path-safety.js';

describe('path-safety', () => {
  const allowedRoots = [
    path.resolve('/workspace/loopsmith-data'),
    path.resolve('/workspace/test-data'),
  ];

  describe('isPathSafe', () => {
    it('should allow paths within allowed roots', () => {
      expect(isPathSafe('/workspace/loopsmith-data/project1', allowedRoots)).toBe(true);
      expect(isPathSafe('/workspace/test-data/audio/file.mp3', allowedRoots)).toBe(true);
    });

    it('should allow exact root paths', () => {
      expect(isPathSafe('/workspace/loopsmith-data', allowedRoots)).toBe(true);
      expect(isPathSafe('/workspace/test-data', allowedRoots)).toBe(true);
    });

    it('should reject paths outside allowed roots', () => {
      expect(isPathSafe('/workspace/other-folder', allowedRoots)).toBe(false);
      expect(isPathSafe('/etc/passwd', allowedRoots)).toBe(false);
    });

    it('should reject path traversal attempts', () => {
      expect(isPathSafe('/workspace/loopsmith-data/../../../etc/passwd', allowedRoots)).toBe(false);
      expect(isPathSafe('/workspace/test-data/../secrets', allowedRoots)).toBe(false);
    });

    it.skipIf(process.platform !== 'win32')('should normalize paths correctly on Windows-style paths', () => {
      const winRoots = ['C:\\Users\\test\\loopsmith-data'];
      expect(isPathSafe('C:\\Users\\test\\loopsmith-data\\project', winRoots)).toBe(true);
      expect(isPathSafe('C:\\Users\\test\\other', winRoots)).toBe(false);
    });
  });

  describe('validatePathSafety', () => {
    it('should not throw for safe paths', () => {
      expect(() => validatePathSafety('/workspace/loopsmith-data/project', allowedRoots)).not.toThrow();
    });

    it('should throw for unsafe paths', () => {
      expect(() => validatePathSafety('/etc/passwd', allowedRoots)).toThrow('Path traversal attempt detected');
      expect(() => validatePathSafety('/workspace/loopsmith-data/../secrets', allowedRoots)).toThrow('Path traversal attempt detected');
    });
  });
});

describe('isPathInside', () => {
  it('does not treat sibling folders with a shared prefix as inside', () => {
    expect(isPathInside(path.resolve('/data-other/x'), path.resolve('/data'))).toBe(false);
    expect(isPathInside(path.resolve('/data/x'), path.resolve('/data'))).toBe(true);
  });
});

describe('resolveInside', () => {
  const base = path.resolve('/workspace/loopsmith-data/game');

  it('resolves nested relative paths', () => {
    expect(resolveInside(base, 'SOUNDTRACK/boss')).toBe(path.join(base, 'SOUNDTRACK', 'boss'));
    expect(resolveInside(base, 'SFX\\ui')).toBe(path.join(base, 'SFX', 'ui'));
    expect(resolveInside(base, '')).toBe(base);
  });

  it('rejects traversal and absolute paths', () => {
    expect(() => resolveInside(base, '../other')).toThrow();
    expect(() => resolveInside(base, 'a/../../other')).toThrow();
    expect(() => resolveInside(base, '/etc/passwd')).toThrow();
    expect(() => resolveInside(base, 'C:/Windows')).toThrow();
  });
});

describe('isValidEntryName / toSafeName', () => {
  it('validates names', () => {
    expect(isValidEntryName('boss-music')).toBe(true);
    expect(isValidEntryName('a/b')).toBe(false);
    expect(isValidEntryName('..')).toBe(false);
    expect(isValidEntryName('CON')).toBe(false);
    expect(isValidEntryName('')).toBe(false);
  });

  it('creates safe names', () => {
    expect(toSafeName('Canción del jefe!')).toBe('Cancion_del_jefe');
    expect(toSafeName('../../etc')).toBe('etc');
    expect(toSafeName('???')).toBe('untitled');
  });
});
