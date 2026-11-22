import { describe, it, expect } from 'vitest';
import type { Manifest } from './types.js';
import { computeManifestDiff, applyManifestDiff } from './manifest-sync.js';

describe('manifest-sync', () => {
  describe('computeManifestDiff', () => {
    it('should detect all entries as added when old manifest is null', () => {
      const newManifest: Manifest = {
        version: '1.0',
        gameRepo: 'game',
        entries: [
          { id: '1', name: 'track1.mp3', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/track1.mp3' },
          { id: '2', name: 'click.wav', type: 'SFX', folder: 'sfx', relativePath: 'sfx/click.wav' },
        ],
      };

      const diff = computeManifestDiff(null, newManifest);

      expect(diff.added).toHaveLength(2);
      expect(diff.removed).toHaveLength(0);
      expect(diff.renamed).toHaveLength(0);
      expect(diff.moved).toHaveLength(0);
    });

    it('should detect added entries', () => {
      const oldManifest: Manifest = {
        version: '1.0',
        gameRepo: 'game',
        entries: [
          { id: '1', name: 'track1.mp3', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/track1.mp3' },
        ],
      };

      const newManifest: Manifest = {
        version: '1.0',
        gameRepo: 'game',
        entries: [
          { id: '1', name: 'track1.mp3', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/track1.mp3' },
          { id: '2', name: 'click.wav', type: 'SFX', folder: 'sfx', relativePath: 'sfx/click.wav' },
        ],
      };

      const diff = computeManifestDiff(oldManifest, newManifest);

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].id).toBe('2');
    });

    it('should detect removed entries', () => {
      const oldManifest: Manifest = {
        version: '1.0',
        gameRepo: 'game',
        entries: [
          { id: '1', name: 'track1.mp3', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/track1.mp3' },
          { id: '2', name: 'click.wav', type: 'SFX', folder: 'sfx', relativePath: 'sfx/click.wav' },
        ],
      };

      const newManifest: Manifest = {
        version: '1.0',
        gameRepo: 'game',
        entries: [
          { id: '1', name: 'track1.mp3', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/track1.mp3' },
        ],
      };

      const diff = computeManifestDiff(oldManifest, newManifest);

      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0].id).toBe('2');
    });

    it('should detect renamed entries by id', () => {
      const oldManifest: Manifest = {
        version: '1.0',
        gameRepo: 'game',
        entries: [
          { id: '1', name: 'old_name.mp3', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/old_name.mp3' },
        ],
      };

      const newManifest: Manifest = {
        version: '1.0',
        gameRepo: 'game',
        entries: [
          { id: '1', name: 'new_name.mp3', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/new_name.mp3' },
        ],
      };

      const diff = computeManifestDiff(oldManifest, newManifest);

      expect(diff.renamed).toHaveLength(1);
      expect(diff.renamed[0].old.name).toBe('old_name.mp3');
      expect(diff.renamed[0].new.name).toBe('new_name.mp3');
    });

    it('should detect moved entries', () => {
      const oldManifest: Manifest = {
        version: '1.0',
        gameRepo: 'game',
        entries: [
          { id: '1', name: 'track.mp3', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/track.mp3' },
        ],
      };

      const newManifest: Manifest = {
        version: '1.0',
        gameRepo: 'game',
        entries: [
          { id: '1', name: 'track.mp3', type: 'SOUNDTRACK', folder: 'music/boss', relativePath: 'music/boss/track.mp3' },
        ],
      };

      const diff = computeManifestDiff(oldManifest, newManifest);

      expect(diff.moved).toHaveLength(1);
      expect(diff.moved[0].old.folder).toBe('music');
      expect(diff.moved[0].new.folder).toBe('music/boss');
    });

    it('should detect renamed entries by hash when id changed', () => {
      const oldManifest: Manifest = {
        version: '1.0',
        gameRepo: 'game',
        entries: [
          { id: '1', name: 'track.mp3', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/track.mp3', hash: 'abc123' },
        ],
      };

      const newManifest: Manifest = {
        version: '1.0',
        gameRepo: 'game',
        entries: [
          { id: '2', name: 'renamed.mp3', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/renamed.mp3', hash: 'abc123' },
        ],
      };

      const diff = computeManifestDiff(oldManifest, newManifest);

      expect(diff.renamed).toHaveLength(1);
      expect(diff.renamed[0].old.name).toBe('track.mp3');
      expect(diff.renamed[0].new.name).toBe('renamed.mp3');
    });
  });

  describe('applyManifestDiff', () => {
    it('should apply added entries', () => {
      const current = [
        { id: '1', name: 'track1.mp3', type: 'SOUNDTRACK' as const, folder: 'music', relativePath: 'music/track1.mp3' },
      ];

      const diff = {
        added: [
          { id: '2', name: 'click.wav', type: 'SFX' as const, folder: 'sfx', relativePath: 'sfx/click.wav' },
        ],
        removed: [],
        renamed: [],
        moved: [],
      };

      const result = applyManifestDiff(current, diff);

      expect(result).toHaveLength(2);
      expect(result.find(e => e.id === '2')).toBeDefined();
    });

    it('should apply removed entries', () => {
      const current = [
        { id: '1', name: 'track1.mp3', type: 'SOUNDTRACK' as const, folder: 'music', relativePath: 'music/track1.mp3' },
        { id: '2', name: 'click.wav', type: 'SFX' as const, folder: 'sfx', relativePath: 'sfx/click.wav' },
      ];

      const diff = {
        added: [],
        removed: [
          { id: '2', name: 'click.wav', type: 'SFX' as const, folder: 'sfx', relativePath: 'sfx/click.wav' },
        ],
        renamed: [],
        moved: [],
      };

      const result = applyManifestDiff(current, diff);

      expect(result).toHaveLength(1);
      expect(result.find(e => e.id === '2')).toBeUndefined();
    });

    it('should apply renamed entries', () => {
      const current = [
        { id: '1', name: 'old.mp3', type: 'SOUNDTRACK' as const, folder: 'music', relativePath: 'music/old.mp3' },
      ];

      const diff = {
        added: [],
        removed: [],
        renamed: [
          {
            old: { id: '1', name: 'old.mp3', type: 'SOUNDTRACK' as const, folder: 'music', relativePath: 'music/old.mp3' },
            new: { id: '1', name: 'new.mp3', type: 'SOUNDTRACK' as const, folder: 'music', relativePath: 'music/new.mp3' },
          },
        ],
        moved: [],
      };

      const result = applyManifestDiff(current, diff);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('new.mp3');
    });
  });
});
