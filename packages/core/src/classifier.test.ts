import { describe, it, expect } from 'vitest';
import { classifyAudioFile } from './classifier.js';

describe('classifyAudioFile', () => {
  it('should classify soundtrack by keyword in filename', () => {
    expect(classifyAudioFile('main_theme.mp3', 'music', 60)).toBe('SOUNDTRACK');
    expect(classifyAudioFile('bgm_01.wav', 'audio', 120)).toBe('SOUNDTRACK');
    expect(classifyAudioFile('boss_ost.ogg', 'sounds', 90)).toBe('SOUNDTRACK');
  });

  it('should classify SFX by keyword in filename', () => {
    expect(classifyAudioFile('button_click.wav', 'ui', 0.5)).toBe('SFX');
    expect(classifyAudioFile('explosion_sfx.mp3', 'effects', 2)).toBe('SFX');
    expect(classifyAudioFile('jump_sound.wav', 'audio', 1)).toBe('SFX');
  });

  it('should classify VO by keyword in filename', () => {
    expect(classifyAudioFile('character_dialog_01.wav', 'voice', 10)).toBe('VO');
    expect(classifyAudioFile('narration_intro.mp3', 'vo', 15)).toBe('VO');
  });

  it('should classify AMBIENCE by keyword in filename', () => {
    expect(classifyAudioFile('forest_ambient.wav', 'environment', 120)).toBe('AMBIENCE');
    expect(classifyAudioFile('wind_loop.ogg', 'amb', 60)).toBe('AMBIENCE');
  });

  it('should classify by duration when keywords are absent', () => {
    expect(classifyAudioFile('audio_01.mp3', 'misc', 60)).toBe('SOUNDTRACK');
    expect(classifyAudioFile('audio_02.wav', 'misc', 2)).toBe('SFX');
    expect(classifyAudioFile('audio_03.mp3', 'misc', 10)).toBe('VO');
  });

  it('should classify as SOUNDTRACK when loop markers are present', () => {
    expect(classifyAudioFile('unknown.mp3', 'audio', undefined, true)).toBe('SOUNDTRACK');
  });

  it('should default to OTHER when no classification criteria match', () => {
    expect(classifyAudioFile('unknown.mp3', 'misc')).toBe('OTHER');
  });

  it('should classify by folder path keywords', () => {
    expect(classifyAudioFile('track_01.mp3', 'music/boss', 45)).toBe('SOUNDTRACK');
    expect(classifyAudioFile('01.wav', 'sfx/ui', 1)).toBe('SFX');
    expect(classifyAudioFile('line_01.wav', 'voice/character', 8)).toBe('VO');
  });
});
