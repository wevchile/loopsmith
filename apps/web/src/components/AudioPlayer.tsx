import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useTranslation } from 'react-i18next';
import { Link2, Pause, Play, Repeat, Square, Volume2 } from 'lucide-react';

/** Window events: the library toggles the open player; the player reports play/pause. */
export const TOGGLE_PLAY_EVENT = 'loopsmith:toggle-play';
export const PLAY_STATE_EVENT = 'loopsmith:play-state';

/** "Escuchar unión": seconds played from the end, then the same from the start. */
export const SEAM_PREVIEW_SECONDS = 3;

/** Last `seconds` of the track followed by its first `seconds`, sample by sample (what a loop sounds like at the wrap). */
export function buildSeamBuffer(ctx: BaseAudioContext, data: AudioBuffer, seconds = SEAM_PREVIEW_SECONDS): AudioBuffer {
  const n = Math.max(1, Math.min(Math.floor(seconds * data.sampleRate), Math.floor(data.length / 2)));
  const out = ctx.createBuffer(data.numberOfChannels, n * 2, data.sampleRate);
  for (let c = 0; c < data.numberOfChannels; c++) {
    const src = data.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(src.length - n), 0);
    dst.set(src.subarray(0, n), n);
  }
  return out;
}

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
  const [seamPlaying, setSeamPlaying] = useState(false);
  const volumeRef = useRef(volume);
  const seamRef = useRef<{ ctx: AudioContext; source: AudioBufferSourceNode; gain: GainNode } | null>(null);
  /** Full-quality decode for the seam preview (WaveSurfer decodes at a low rate for drawing). */
  const decodedRef = useRef<{ url: string; buffer: Promise<ArrayBuffer> } | null>(null);

  const stopSeam = () => {
    const seam = seamRef.current;
    seamRef.current = null;
    if (seam) {
      seam.source.onended = null;
      try {
        seam.source.stop();
      } catch {
        // already stopped
      }
      void seam.ctx.close().catch(() => undefined);
    }
    setSeamPlaying(false);
  };

  const playSeam = async () => {
    if (seamRef.current) return stopSeam();
    wsRef.current?.pause();
    try {
      if (decodedRef.current?.url !== url) {
        decodedRef.current = { url, buffer: fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`)))) };
      }
      const bytes = (await decodedRef.current.buffer).slice(0);
      const ctx = new AudioContext();
      const data = await ctx.decodeAudioData(bytes);
      const source = ctx.createBufferSource();
      source.buffer = buildSeamBuffer(ctx, data);
      const gain = ctx.createGain();
      gain.gain.value = volumeRef.current;
      source.connect(gain).connect(ctx.destination);
      source.onended = () => stopSeam();
      seamRef.current = { ctx, source, gain };
      setSeamPlaying(true);
      source.start();
    } catch (e) {
      stopSeam();
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;
    setReady(false);
    setError(null);
    const ws = WaveSurfer.create({
      container: containerRef.current,
      url,
      waveColor: '#3b4a63',
      progressColor: '#7c9cff',
      cursorColor: '#e8ecf4',
      height: 56,
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
    const report = (playing: boolean) => {
      setIsPlaying(playing);
      window.dispatchEvent(new CustomEvent(PLAY_STATE_EVENT, { detail: playing }));
    };
    ws.on('play', () => {
      stopSeam();
      report(true);
    });
    ws.on('pause', () => report(false));
    const onToggle = () => void ws.playPause();
    window.addEventListener(TOGGLE_PLAY_EVENT, onToggle);
    ws.on('finish', () => {
      if (loopRef.current) {
        ws.setTime(0);
        void ws.play();
      } else {
        report(false);
      }
    });
    wsRef.current = ws;
    return () => {
      stopSeam();
      window.removeEventListener(TOGGLE_PLAY_EVENT, onToggle);
      window.dispatchEvent(new CustomEvent(PLAY_STATE_EVENT, { detail: false }));
      ws.destroy();
      wsRef.current = null;
    };
    // volume and autoPlay are read once on load on purpose.
  }, [url]);

  useEffect(() => {
    wsRef.current?.setVolume(volume);
    volumeRef.current = volume;
    if (seamRef.current) seamRef.current.gain.gain.value = volume;
  }, [volume]);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  const stop = () => {
    stopSeam();
    wsRef.current?.stop();
    setIsPlaying(false);
  };

  return (
    <div className="player">
      <div ref={containerRef} className="waveform" />
      {error && <div className="error-text">{error}</div>}
      <div className="player-controls">
        <button className="icon-btn" onClick={() => wsRef.current?.playPause()} disabled={!ready} title={isPlaying ? t('pause') : t('play')}>
          {isPlaying ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button className="icon-btn" onClick={stop} disabled={!ready} title={t('stop')}>
          <Square size={13} />
        </button>
        <span className="time">{ready ? `${formatTime(time)} / ${formatTime(duration)}` : t('loading')}</span>
        <button className={`icon-btn ${loop ? 'active' : ''}`} aria-pressed={loop} onClick={() => setLoop((l) => !l)} title={t('loop')}>
          <Repeat size={14} />
        </button>
        <button
          className={`btn small seam-btn ${seamPlaying ? 'active' : ''}`}
          aria-pressed={seamPlaying}
          onClick={() => void playSeam()}
          disabled={!ready || duration < 1}
          title={t('seamPreviewHelp', { seconds: SEAM_PREVIEW_SECONDS })}
        >
          <Link2 size={13} /> {seamPlaying ? t('seamPreviewStop') : t('seamPreview')}
        </button>
        <label className="volume" title={t('volume')}>
          <Volume2 size={14} />
          <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} aria-label={t('volume')} />
        </label>
      </div>
    </div>
  );
}
