import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from 'react-i18next';
import { AudioPlayer } from './AudioPlayer';
export function TrackList({ tracks, selectedTrack, onSelectTrack, onSetReference, }) {
    const { t } = useTranslation();
    if (tracks.length === 0) {
        return (_jsx("div", { style: { padding: '20px' }, children: _jsx("p", { style: { color: '#666' }, children: t('noTracks') }) }));
    }
    const groupedTracks = tracks.reduce((acc, track) => {
        if (!acc[track.type]) {
            acc[track.type] = [];
        }
        acc[track.type].push(track);
        return acc;
    }, {});
    return (_jsxs("div", { style: { padding: '20px' }, children: [_jsx("h3", { children: t('tracks') }), Object.entries(groupedTracks).map(([type, typeTracks]) => (_jsxs("div", { style: { marginBottom: '20px' }, children: [_jsx("h4", { style: { marginBottom: '10px', color: '#666' }, children: type }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: '10px' }, children: typeTracks.map((track) => (_jsxs("div", { style: {
                                padding: '10px',
                                background: selectedTrack?.id === track.id ? '#e3f2fd' : '#f9f9f9',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                            }, children: [_jsxs("div", { style: {
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: '10px',
                                    }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 'bold' }, children: track.name }), _jsx("div", { style: { fontSize: '12px', color: '#666' }, children: track.folder })] }), _jsx("button", { onClick: () => onSetReference(track), style: { fontSize: '12px' }, children: t('useAsReference') })] }), selectedTrack?.id === track.id && (_jsx(AudioPlayer, { audioPath: `file://${track.path}` })), selectedTrack?.id !== track.id && (_jsx("button", { onClick: () => onSelectTrack(track), style: { width: '100%' }, children: t('play') }))] }, track.id))) })] }, type)))] }));
}
