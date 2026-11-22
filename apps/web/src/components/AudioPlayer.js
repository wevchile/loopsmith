import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useTranslation } from 'react-i18next';
export function AudioPlayer({ audioPath }) {
    const { t } = useTranslation();
    const containerRef = useRef(null);
    const wavesurferRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(0.7);
    const [loop, setLoop] = useState(false);
    useEffect(() => {
        if (!containerRef.current)
            return;
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
            }
            else {
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
    return (_jsxs("div", { style: { padding: '10px', background: '#f5f5f5', borderRadius: '8px' }, children: [_jsx("div", { ref: containerRef, style: { marginBottom: '10px' } }), _jsxs("div", { style: { display: 'flex', gap: '10px', alignItems: 'center' }, children: [_jsx("button", { onClick: handlePlayPause, children: isPlaying ? t('pause') : t('play') }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: '5px' }, children: [t('volume'), _jsx("input", { type: "range", min: "0", max: "1", step: "0.01", value: volume, onChange: (e) => setVolume(parseFloat(e.target.value)) })] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: '5px' }, children: [_jsx("input", { type: "checkbox", checked: loop, onChange: (e) => setLoop(e.target.checked) }), t('loop')] })] })] }));
}
