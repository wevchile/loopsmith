import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useTranslation } from 'react-i18next';

interface AudioPlayerProps {
  url: string;
  autoPlay?: boolean;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlayer({ url, autoPlay = false }: AudioPlayerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const loopRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [loop, setLoop] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    setReady(false);
    setError(null);
    const ws = WaveSurfer.create({
      container: containerRef.current,
      url,
      waveColor: '#8fb8e8',
      progressColor: '#1e73be',
      cursorColor: '#333',
      height: 64,
      barWidth: 2,
      barGap: 1,
      normalize: true,
    });
    ws.on('ready', (d) => {
      setReady(true);
      setDuration(d);
      ws.setVolume(volume);
      if (autoPlay) void ws.play().catch(() => undefined);
    });
    ws.on('error', (e) => setError(e instanceof Error ? e.message : String(e)));
    ws.on('timeupdate', (cur) => setTime(cur));
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => {
      if (loopRef.current) {
        ws.setTime(0);
        void ws.play();
      } else {
        setIsPlaying(false);
      }
    });
    wsRef.current = ws;
    return () => {
      ws.destroy();
      wsRef.current = null;
    };
    // volume and autoPlay are read once on load on purpose.
  }, [url]);

  useEffect(() => {
    wsRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  const stop = () => {
    wsRef.current?.stop();
    setIsPlaying(false);
  };

  return (
    <div className="player">
      <div ref={containerRef} className="waveform" />
      {error && <div className="error-text">{error}</div>}
      <div className="player-controls">
        <button onClick={() => wsRef.current?.playPause()} disabled={!ready}>
          {isPlaying ? t('pause') : t('play')}
        </button>
        <button className="secondary" onClick={stop} disabled={!ready}>
          {t('stop')}
        </button>
        <span className="time">
          {ready ? `${formatTime(time)} / ${formatTime(duration)}` : t('loading')}
        </span>
        <label className="inline">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          {t('loop')}
        </label>
        <label className="inline">
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
      </div>
    </div>
  );
}
