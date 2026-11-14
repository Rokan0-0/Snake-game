import React, { useEffect, useRef } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import {
  Direction,
  FloatingCallout,
  GameStatus,
  GoldenFood,
  GRID_SIZE,
  GridPoint,
  Particle,
  TrackConfig,
} from '../types/game';

interface SnakeCanvasProps {
  snake: GridPoint[];
  food: GridPoint;
  goldenFood: GoldenFood | null;
  track: TrackConfig;
  status: GameStatus;
  score: number;
  highScore: number;
  combo: number;
  maxCombo: number;
  isNewHighScore: boolean;
  /** 0..1 decaying pulse intensity triggered on every quarter-note beat */
  beatPulseRef: React.MutableRefObject<number>;
  /** True during the accented combo beat step */
  isComboBeat: boolean;
  /** 0..1 decaying white/gold flash intensity triggered on golden drop pickup */
  screenFlashRef: React.MutableRefObject<number>;
  isShaking: boolean;
  particlesRef: React.MutableRefObject<Particle[]>;
  calloutsRef: React.MutableRefObject<FloatingCallout[]>;
  analyser: AnalyserNode | null;
  onStart: () => void;
  onReplay: () => void;
  onResume: () => void;
  onSwipeDirection: (dir: Direction) => void;
}

const LOGICAL_SIZE = 560;

export const SnakeCanvas: React.FC<SnakeCanvasProps> = ({
  snake,
  food,
  goldenFood,
  track,
  status,
  score,
  highScore,
  combo,
  maxCombo,
  isNewHighScore,
  beatPulseRef,
  isComboBeat,
  screenFlashRef,
  isShaking,
  particlesRef,
  calloutsRef,
  analyser,
  onStart,
  onReplay,
  onResume,
  onSwipeDirection,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Keep latest render props in refs so the 60fps rAF loop never restarts needlessly
  const stateRef = useRef({
    snake,
    food,
    goldenFood,
    track,
    status,
    combo,
    isComboBeat,
    analyser,
  });

  useEffect(() => {
    stateRef.current = {
      snake,
      food,
      goldenFood,
      track,
      status,
      combo,
      isComboBeat,
      analyser,
    };
  }, [snake, food, goldenFood, track, status, combo, isComboBeat, analyser]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = LOGICAL_SIZE * dpr;
    canvas.height = LOGICAL_SIZE * dpr;

    let animId = 0;
    let freqData = new Uint8Array(128);
    let timeData = new Uint8Array(128);

    const drawLoop = (now: number) => {
      const {
        snake: curSnake,
        food: curFood,
        goldenFood: curGolden,
        track: curTrack,
        isComboBeat: curComboBeat,
        analyser: curAnalyser,
      } = stateRef.current;

      const theme = curTrack.theme;
      const cell = LOGICAL_SIZE / GRID_SIZE;

      // Decay beat pulse and screen flash smoothly
      beatPulseRef.current *= 0.9;
      if (beatPulseRef.current < 0.01) beatPulseRef.current = 0;

      screenFlashRef.current *= 0.88;
      if (screenFlashRef.current < 0.01) screenFlashRef.current = 0;

      // Sample Web Audio AnalyserNode
      let bassEnergy = 0;
      let midEnergy = 0;
      if (curAnalyser) {
        if (freqData.length !== curAnalyser.frequencyBinCount) {
          freqData = new Uint8Array(curAnalyser.frequencyBinCount);
          timeData = new Uint8Array(curAnalyser.frequencyBinCount);
        }
        curAnalyser.getByteFrequencyData(freqData);
        curAnalyser.getByteTimeDomainData(timeData);

        let bassSum = 0;
        const bassBins = Math.min(8, freqData.length);
        for (let i = 0; i < bassBins; i++) bassSum += freqData[i];
        bassEnergy = bassSum / (bassBins * 255);

        let midSum = 0;
        const midEnd = Math.min(32, freqData.length);
        for (let i = bassBins; i < midEnd; i++) midSum += freqData[i];
        midEnergy = midSum / (Math.max(1, midEnd - bassBins) * 255);
      } else {
        // Gentle idle shimmer before audio starts
        bassEnergy = 0.08 + 0.04 * Math.sin(now * 0.003);
        midEnergy = 0.06;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Deep dark cyberpunk canvas background
      ctx.fillStyle = '#060811';
      ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

      // Subtle ambient radial bloom driven by bass energy
      const bgGlow = ctx.createRadialGradient(
        LOGICAL_SIZE / 2,
        LOGICAL_SIZE / 2,
        20,
        LOGICAL_SIZE / 2,
        LOGICAL_SIZE / 2,
        LOGICAL_SIZE * 0.72,
      );
      bgGlow.addColorStop(0, hexWithAlpha(theme.primary, 0.06 + bassEnergy * 0.12));
      bgGlow.addColorStop(0.6, hexWithAlpha(theme.secondary, 0.03 + midEnergy * 0.06));
      bgGlow.addColorStop(1, 'rgba(6, 8, 17, 0)');
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

      // 2. Track-specific live audio visualizer behind the grid
      drawVisualizer(ctx, theme.visualizerStyle, freqData, timeData, theme.primary, theme.secondary, bassEnergy, now);

      // 3. Subtle cyberpunk grid lines (brighten gently on beat pulse)
      ctx.lineWidth = 1;
      ctx.strokeStyle = hexWithAlpha(theme.primary, 0.06 + beatPulseRef.current * 0.09);
      ctx.beginPath();
      for (let i = 1; i < GRID_SIZE; i++) {
        const pos = i * cell;
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, LOGICAL_SIZE);
        ctx.moveTo(0, pos);
        ctx.lineTo(LOGICAL_SIZE, pos);
      }
      ctx.stroke();

      // 4. Draw standard food with track-specific shape & beat combo target ring
      const fx = curFood.x * cell + cell / 2;
      const fy = curFood.y * cell + cell / 2;
      drawBeatTargetRing(ctx, fx, fy, cell, curComboBeat, beatPulseRef.current, theme.accent, theme.foodColor, now);
      drawTrackFood(ctx, fx, fy, cell, theme.foodShape, theme.foodColor, theme.foodGlow, now, beatPulseRef.current);

      // 5. Draw Golden "Drop" bonus food if active
      if (curGolden) {
        const gx = curGolden.x * cell + cell / 2;
        const gy = curGolden.y * cell + cell / 2;
        drawGoldenDropFood(ctx, gx, gy, cell, now);
      }

      // 6. Draw Snake with bass-reactive glowing trail
      drawSnake(ctx, curSnake, cell, theme.snakeHead, theme.snakeTail, theme.snakeGlow, bassEnergy, beatPulseRef.current);

      // 7. Update & draw neon particle bursts
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.alpha -= p.decay;
        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 8. Update & draw floating combo callouts
      const callouts = calloutsRef.current;
      for (let i = callouts.length - 1; i >= 0; i--) {
        const c = callouts[i];
        c.y += c.vy;
        c.alpha -= 0.022;
        if (c.alpha <= 0) {
          callouts.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = Math.max(0, c.alpha);
        ctx.font = '700 13px "Orbitron", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 10;
        ctx.shadowColor = c.color;
        ctx.fillStyle = c.color;
        ctx.fillText(c.text, c.x, c.y);
        ctx.restore();
      }

      // 9. Screen flash overlay on big golden drop
      if (screenFlashRef.current > 0.01) {
        ctx.fillStyle = `rgba(253, 224, 71, ${screenFlashRef.current * 0.42})`;
        ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
      }

      ctx.restore();
      animId = window.requestAnimationFrame(drawLoop);
    };

    animId = window.requestAnimationFrame(drawLoop);
    return () => window.cancelAnimationFrame(animId);
  }, [beatPulseRef, screenFlashRef, particlesRef, calloutsRef]);

  // Mobile swipe handlers on the canvas container
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 0) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      onSwipeDirection(dx > 0 ? 'RIGHT' : 'LEFT');
    } else {
      onSwipeDirection(dy > 0 ? 'DOWN' : 'UP');
    }
  };

  const theme = track.theme;
  const frameGlow = isComboBeat
    ? `0 0 42px ${hexWithAlpha(theme.primary, 0.55)}, 0 0 18px ${hexWithAlpha(theme.secondary, 0.45)}`
    : theme.frameShadow;

  return (
    <div
      className={`relative w-full max-w-[560px] aspect-square mx-auto rounded-2xl p-[2px] transition-shadow duration-150 ${
        isShaking ? 'animate-game-shake' : ''
      }`}
      style={{
        background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
        boxShadow: frameGlow,
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="relative w-full h-full rounded-[14px] overflow-hidden bg-[#060811]">
        <canvas
          ref={canvasRef}
          className="block w-full h-full touch-none"
          aria-label="Neon Beat Snake game board"
        />

        {/* Subtle CRT scanline texture over canvas */}
        <div className="crt-scanlines pointer-events-none absolute inset-0 opacity-35" />

        {/* START OVERLAY */}
        {status === 'START' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#05060d]/78 backdrop-blur-sm">
            <p
              className="font-mono text-xs tracking-[0.22em] uppercase mb-2"
              style={{ color: theme.primary }}
            >
              {track.title} · {track.bpm} BPM
            </p>
            <h2
              className="font-display text-2xl sm:text-3xl font-extrabold tracking-wide text-white mb-3"
              style={{ textShadow: `0 0 20px ${theme.snakeGlow}` }}
            >
              Press any key to drop the beat
            </h2>
            <p className="text-sm text-slate-300 max-w-sm leading-relaxed mb-6">
              Move on the rhythm of the track. Eat food on the accented beat ring to build your{' '}
              <span className="font-semibold text-white">x2, x3, x4</span> Beat Combo.
            </p>
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-display text-sm font-bold tracking-wider text-slate-950 transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                boxShadow: `0 0 24px ${hexWithAlpha(theme.primary, 0.5)}`,
              }}
            >
              <Play className="w-4 h-4 fill-current" />
              Drop the Beat
            </button>
            <p className="mt-5 text-xs text-slate-400">
              Arrow keys / WASD on desktop · Swipe on mobile
            </p>
          </div>
        )}

        {/* PAUSED OVERLAY */}
        {status === 'PAUSED' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#05060d]/72 backdrop-blur-sm">
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white mb-2">
              Game Paused
            </h2>
            <p className="text-sm text-slate-300 mb-6">
              Press Space or click Resume to jump back onto the beat.
            </p>
            <button
              type="button"
              onClick={onResume}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-display text-sm font-bold tracking-wider text-slate-950 transition-transform duration-150 hover:scale-[1.03] cursor-pointer"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                boxShadow: `0 0 20px ${hexWithAlpha(theme.primary, 0.45)}`,
              }}
            >
              <Play className="w-4 h-4 fill-current" />
              Resume
            </button>
          </div>
        )}

        {/* GAME OVER OVERLAY */}
        {status === 'GAME_OVER' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#05060d]/82 backdrop-blur-md">
            {isNewHighScore && (
              <p className="font-display text-xs font-bold tracking-[0.2em] uppercase text-amber-300 mb-1.5 drop-shadow-[0_0_10px_rgba(251,191,36,0.7)]">
                New High Score
              </p>
            )}
            <h2
              className="font-display text-3xl sm:text-4xl font-black tracking-wider text-white mb-4"
              style={{ textShadow: `0 0 24px ${hexWithAlpha(theme.secondary, 0.8)}` }}
            >
              Signal Lost
            </h2>

            <div className="grid grid-cols-3 gap-4 sm:gap-6 mb-7 px-5 py-3.5 rounded-xl border border-white/10 bg-white/[0.03]">
              <div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Score</div>
                <div className="font-mono text-xl font-bold tabular-nums text-white mt-0.5">
                  {score}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Max Combo</div>
                <div
                  className="font-mono text-xl font-bold tabular-nums mt-0.5"
                  style={{ color: theme.primary }}
                >
                  x{maxCombo}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Best</div>
                <div className="font-mono text-xl font-bold tabular-nums text-amber-300 mt-0.5">
                  {highScore}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onReplay}
              className="inline-flex items-center gap-2.5 px-7 py-3 rounded-xl font-display text-sm font-bold tracking-wider text-slate-950 transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                boxShadow: `0 0 26px ${hexWithAlpha(theme.primary, 0.55)}`,
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Replay
            </button>
            <p className="mt-4 text-xs text-slate-400">
              Music keeps rolling · Press Enter or Space to replay
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// CANVAS HELPER FUNCTIONS
// ============================================================================

function hexWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function drawVisualizer(
  ctx: CanvasRenderingContext2D,
  style: 'bars' | 'radial' | 'wave',
  freqData: Uint8Array,
  timeData: Uint8Array,
  primary: string,
  secondary: string,
  bassEnergy: number,
  now: number,
): void {
  ctx.save();

  if (style === 'bars') {
    // Synthwave horizon spectrum bars rising from bottom + subtle mirror at top
    const barCount = 32;
    const barWidth = LOGICAL_SIZE / barCount;
    for (let i = 0; i < barCount; i++) {
      const binIndex = Math.floor((i / barCount) * Math.min(48, freqData.length));
      const val = freqData[binIndex] / 255;
      const height = 14 + val * 165;
      const x = i * barWidth + 2;
      const grad = ctx.createLinearGradient(0, LOGICAL_SIZE, 0, LOGICAL_SIZE - height);
      grad.addColorStop(0, hexWithAlpha(secondary, 0.34));
      grad.addColorStop(1, hexWithAlpha(primary, 0.08 + val * 0.22));
      ctx.fillStyle = grad;
      ctx.fillRect(x, LOGICAL_SIZE - height, barWidth - 4, height);
    }
  } else if (style === 'radial') {
    // Techno pulsing radial equalizer rings centered behind the grid
    const cx = LOGICAL_SIZE / 2;
    const cy = LOGICAL_SIZE / 2;
    const rays = 40;
    const baseRadius = 90 + bassEnergy * 38;

    ctx.strokeStyle = hexWithAlpha(primary, 0.24);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 0.72, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < rays; i++) {
      const angle = (i / rays) * Math.PI * 2 + now * 0.00035;
      const bin = freqData[i % Math.min(40, freqData.length)] / 255;
      const r1 = baseRadius;
      const r2 = baseRadius + 18 + bin * 120;
      ctx.strokeStyle = i % 2 === 0 ? hexWithAlpha(primary, 0.26) : hexWithAlpha(secondary, 0.26);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
      ctx.stroke();
    }
  } else {
    // Chill Lo-Fi dual smooth aurora waveform ribbons
    const points = Math.min(64, timeData.length);
    for (let layer = 0; layer < 2; layer++) {
      ctx.beginPath();
      const baseY = LOGICAL_SIZE * (layer === 0 ? 0.5 : 0.62);
      const amp = layer === 0 ? 75 : 48;
      ctx.strokeStyle = layer === 0 ? hexWithAlpha(primary, 0.28) : hexWithAlpha(secondary, 0.22);
      ctx.lineWidth = layer === 0 ? 2.5 : 1.5;

      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * LOGICAL_SIZE;
        const sample = (timeData[i] - 128) / 128;
        const gentleWave = Math.sin(now * 0.002 + i * 0.22 + layer) * (10 + bassEnergy * 24);
        const y = baseY + sample * amp + gentleWave;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawBeatTargetRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  isComboBeat: boolean,
  beatPulse: number,
  accentColor: string,
  foodColor: string,
  now: number,
): void {
  ctx.save();
  const baseRadius = cell * 0.68;
  const ringRadius = isComboBeat
    ? baseRadius + beatPulse * 7
    : baseRadius * (0.78 + 0.12 * Math.sin(now * 0.01));

  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  if (isComboBeat) {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.4;
    ctx.shadowBlur = 14;
    ctx.shadowColor = accentColor;
  } else {
    ctx.strokeStyle = hexWithAlpha(foodColor, 0.35);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
  }
  ctx.stroke();
  ctx.restore();
}

function drawTrackFood(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  shape: 'diamond' | 'hexagon' | 'orb',
  color: string,
  glow: string,
  now: number,
  beatPulse: number,
): void {
  ctx.save();
  const r = cell * (0.32 + beatPulse * 0.06);
  ctx.translate(cx, cy);
  ctx.shadowBlur = 16 + beatPulse * 10;
  ctx.shadowColor = glow;
  ctx.fillStyle = color;

  if (shape === 'diamond') {
    ctx.rotate(Math.sin(now * 0.003) * 0.18);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 1.05, 0);
    ctx.lineTo(0, r * 1.15);
    ctx.lineTo(-r * 1.05, 0);
    ctx.closePath();
    ctx.fill();

    // Inner bright core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'hexagon') {
    ctx.rotate(now * 0.0014);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * r * 1.1;
      const py = Math.sin(a) * r * 1.1;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    // Glowing vinyl/orb for Chill Lo-Fi
    const grad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 1, 0, 0, r * 1.1);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, color);
    grad.addColorStop(1, hexWithAlpha(color, 0.4));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawGoldenDropFood(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  now: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(now * 0.004);

  const outer = cell * 0.48;
  const inner = cell * 0.22;

  ctx.shadowBlur = 22;
  ctx.shadowColor = '#fde047';
  ctx.fillStyle = '#fde047';

  // 4-point cyber star
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (i / 8) * Math.PI * 2;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, cell * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSnake(
  ctx: CanvasRenderingContext2D,
  snake: GridPoint[],
  cell: number,
  headColor: string,
  tailColor: string,
  glowColor: string,
  bassEnergy: number,
  beatPulse: number,
): void {
  const len = snake.length;
  if (len === 0) return;

  // Draw from tail to head so the head always sits cleanly on top
  for (let i = len - 1; i >= 0; i--) {
    const seg = snake[i];
    const t = len > 1 ? i / (len - 1) : 0; // 0 at head, 1 at tail
    const isHead = i === 0;

    const pad = isHead ? 2.2 : 3.4 + t * 2.2;
    const size = cell - pad * 2;
    const x = seg.x * cell + pad;
    const y = seg.y * cell + pad;
    const radius = isHead ? 7 : 5;

    ctx.save();
    // Bass-reactive trail glow
    const trailGlow = 8 + bassEnergy * 24 + beatPulse * 8;
    ctx.shadowBlur = isHead ? trailGlow + 8 : trailGlow * (1 - t * 0.45);
    ctx.shadowColor = isHead ? headColor : lerpColor(headColor, tailColor, t);
    ctx.fillStyle = isHead ? headColor : lerpColor(headColor, tailColor, t);
    ctx.globalAlpha = isHead ? 1 : 0.95 - t * 0.35;

    drawRoundedRect(ctx, x, y, size, size, radius);
    ctx.fill();

    // Subtle crisp cyber highlight on the head
    if (isHead) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(seg.x * cell + cell * 0.5, seg.y * cell + cell * 0.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function lerpColor(hexA: string, hexB: string, t: number): string {
  const a = hexA.replace('#', '');
  const b = hexB.replace('#', '');
  const ar = parseInt(a.slice(0, 2), 16);
  const ag = parseInt(a.slice(2, 4), 16);
  const ab = parseInt(a.slice(4, 6), 16);
  const br = parseInt(b.slice(0, 2), 16);
  const bg = parseInt(b.slice(2, 4), 16);
  const bb = parseInt(b.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}
