import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useTranslation } from 'react-i18next';

interface AudioPlayerProps {
  audioPath: string;
}

export function AudioPlayer({ audioPath }: AudioPlayerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [loop, setLoop] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4a9eff',
      progressColor: '#1e73be',
      cursorColor: '#333',
      height: 80,
      barWidth: 2,
      barGap: 1,
    });

    wavesurfer.on('finish', () => {
      if (loop) {
        wavesurfer.play();
      } else {
        setIsPlaying(false);
      }
    });

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));

    wavesurfer.load(audioPath);
    wavesurfer.setVolume(volume);

    wavesurferRef.current = wavesurfer;

    return () => {
      wavesurfer.destroy();
    };
  }, [audioPath, loop]);

  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(volume);
    }
  }, [volume]);

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  return (
    <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '8px' }}>
      <div ref={containerRef} style={{ marginBottom: '10px' }} />
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button onClick={handlePlayPause}>
          {isPlaying ? t('pause') : t('play')}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {t('volume')}
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
          />
          {t('loop')}
        </label>
      </div>
    </div>
  );
}
