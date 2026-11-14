import React from 'react';
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { TrackConfig } from '../types/game';

interface MusicControlsProps {
  track: TrackConfig;
  isPlaying: boolean;
  progress: number;
  volume: number;
  isMuted: boolean;
  onTogglePlay: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onVolumeChange: (value: number) => void;
  onToggleMute: () => void;
}

export const MusicControls: React.FC<MusicControlsProps> = ({
  track,
  isPlaying,
  progress,
  volume,
  isMuted,
  onTogglePlay,
  onPrevTrack,
  onNextTrack,
  onVolumeChange,
  onToggleMute,
}) => {
  const theme = track.theme;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const loopSeconds = Math.round((track.loopSteps / 4) * (60 / track.bpm));
  const elapsedSeconds = Math.floor(clampedProgress * loopSeconds);

  const formatSec = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <footer
      aria-label="Music player controls"
      className="cyber-glass rounded-2xl border border-white/10 px-4 py-3 sm:px-6 sm:py-3.5"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        {/* Track Identity */}
        <div className="flex items-center justify-between md:w-64 shrink-0">
          <div className="min-w-0">
            <div className="font-display text-sm font-bold text-white truncate">
              {track.title}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {track.generatedBy} · {track.bpm} BPM
            </div>
          </div>

          {/* Mobile quick play/skip */}
          <div className="flex md:hidden items-center gap-1.5">
            <button
              type="button"
              onClick={onPrevTrack}
              aria-label="Previous track"
              className="p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause music' : 'Play music'}
              className="p-2.5 rounded-xl text-slate-950 transition-transform active:scale-95 cursor-pointer"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
              }}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            </button>
            <button
              type="button"
              onClick={onNextTrack}
              aria-label="Next track"
              className="p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Transport & Progress Bar */}
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="hidden md:flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onPrevTrack}
              aria-label="Previous track"
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause music' : 'Play music'}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-950 transition-transform duration-150 hover:scale-105 active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                boxShadow: `0 0 18px ${theme.primary}66`,
              }}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onNextTrack}
              aria-label="Next track"
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-slate-400 tabular-nums w-8 text-right">
              {formatSec(elapsedSeconds)}
            </span>
            <div
              className="relative flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(clampedProgress * 100)}
              aria-label="Track loop progress"
            >
              <div
                className="h-full rounded-full transition-[width] duration-150 ease-linear"
                style={{
                  width: `${clampedProgress * 100}%`,
                  background: `linear-gradient(90deg, ${theme.primary}, ${theme.secondary})`,
                  boxShadow: `0 0 10px ${theme.primary}`,
                }}
              />
            </div>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums w-8">
              {formatSec(loopSeconds)}
            </span>
          </div>
        </div>

        {/* Volume Slider */}
        <div className="flex items-center gap-2.5 md:w-44 justify-end shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4" style={{ color: theme.primary }} />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            aria-label="Master volume"
            className="w-24 sm:w-28 accent-cyan-400 cursor-pointer"
          />
        </div>
      </div>
    </footer>
  );
};
