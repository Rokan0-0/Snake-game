import React from 'react';
import { TrackConfig } from '../types/game';

interface StatsPanelProps {
  score: number;
  highScore: number;
  combo: number;
  maxCombo: number;
  /** 0..3 quarter beat index inside the 4-beat bar */
  beatInBar: number;
  isComboBeat: boolean;
  goldenActive: boolean;
  track: TrackConfig;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
  score,
  highScore,
  combo,
  maxCombo,
  beatInBar,
  isComboBeat,
  goldenActive,
  track,
}) => {
  const theme = track.theme;

  return (
    <section
      aria-label="Game stats"
      className="cyber-glass rounded-2xl border border-white/10 p-5 flex flex-col gap-5"
    >
      <div className="flex items-center justify-between border-b border-white/8 pb-3">
        <h2 className="font-display text-sm font-bold tracking-wider text-white">
          Telemetry
        </h2>
        <span
          className="font-mono text-xs font-semibold tabular-nums"
          style={{ color: theme.primary }}
        >
          {track.bpm} BPM
        </span>
      </div>

      {/* Primary Score & High Score */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-slate-400 mb-1">Score</div>
          <div
            className="font-mono text-3xl font-bold tabular-nums text-white"
            style={{ textShadow: `0 0 18px ${theme.primary}66` }}
          >
            {score}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400 mb-1">High Score</div>
          <div className="font-mono text-3xl font-bold tabular-nums text-amber-300">
            {highScore}
          </div>
        </div>
      </div>

      {/* Beat Combo Multiplier */}
      <div className="pt-4 border-t border-white/8">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-slate-400">Beat Combo</span>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            Best x{maxCombo}
          </span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-2.5">
          <span
            className="font-display text-3xl font-black tabular-nums transition-transform duration-150"
            style={{
              color: combo > 1 ? theme.secondary : '#e2e8f0',
              textShadow: combo > 1 ? `0 0 20px ${theme.secondary}aa` : 'none',
            }}
          >
            x{combo}
          </span>
          <span className="text-xs text-slate-400">
            {combo > 1 ? 'On-beat streak active' : 'Eat on beat 1 or 3 to multiply'}
          </span>
        </div>
      </div>

      {/* Live 4-Beat Rhythm Strip */}
      <div className="pt-4 border-t border-white/8">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs text-slate-400">Beat Timing</span>
          <span
            className="font-mono text-xs font-bold tracking-wider"
            style={{ color: isComboBeat ? theme.accent : '#94a3b8' }}
          >
            {isComboBeat ? 'COMBO HIT' : 'GROOVE'}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2" aria-hidden="true">
          {[0, 1, 2, 3].map((beat) => {
            const isCurrent = beat === beatInBar;
            const isAccentBeat = beat === 0 || beat === 2;
            return (
              <div
                key={beat}
                className="h-9 rounded-lg border flex flex-col items-center justify-center transition-all duration-100"
                style={{
                  borderColor: isCurrent
                    ? isAccentBeat
                      ? theme.accent
                      : theme.primary
                    : 'rgba(255,255,255,0.08)',
                  backgroundColor: isCurrent
                    ? isAccentBeat
                      ? `${theme.accent}24`
                      : `${theme.primary}18`
                    : 'rgba(255,255,255,0.02)',
                  boxShadow:
                    isCurrent && isAccentBeat
                      ? `0 0 14px ${theme.accent}55`
                      : 'none',
                }}
              >
                <span
                  className="font-mono text-xs font-bold tabular-nums"
                  style={{
                    color: isCurrent
                      ? isAccentBeat
                        ? theme.accent
                        : '#ffffff'
                      : '#64748b',
                  }}
                >
                  {beat + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Golden Drop Notice or Track Details */}
      <div className="pt-4 border-t border-white/8 text-xs text-slate-400 space-y-1.5">
        {goldenActive ? (
          <div className="font-display font-bold text-amber-300 tracking-wide">
            Golden Drop active on board — +50x bonus
          </div>
        ) : (
          <div className="text-slate-300 font-medium">
            {track.title} · {track.genre}
          </div>
        )}
        <p className="leading-relaxed">{track.description}</p>
        <p className="text-slate-500 pt-1">
          Controls: Arrows / WASD · Space to pause
        </p>
      </div>
    </section>
  );
};
