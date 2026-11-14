import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play } from 'lucide-react';
import { BeatTickEvent, synthEngine } from './audio/synthEngine';
import { MusicControls } from './components/MusicControls';
import { SnakeCanvas } from './components/SnakeCanvas';
import { StatsPanel } from './components/StatsPanel';
import { TrackList } from './components/TrackList';
import {
  Direction,
  FloatingCallout,
  GameStatus,
  GoldenFood,
  GRID_SIZE,
  GridPoint,
  Particle,
  TRACKS,
} from './types/game';

const HIGH_SCORE_STORAGE_KEY = 'neon-beat-snake-high-score';
const INITIAL_SNAKE: GridPoint[] = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 },
];

function loadHighScore(): number {
  try {
    const raw = window.localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(score: number): void {
  try {
    window.localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(score));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function isOppositeDirection(a: Direction, b: Direction): boolean {
  return (
    (a === 'UP' && b === 'DOWN') ||
    (a === 'DOWN' && b === 'UP') ||
    (a === 'LEFT' && b === 'RIGHT') ||
    (a === 'RIGHT' && b === 'LEFT')
  );
}

/**
 * Picks a free grid cell for food. Matches parity with `eighthIndex % 2`
 * so the player can always reach the food on an accented Combo Beat (beats 1 & 3).
 */
function spawnFreeFood(
  occupied: GridPoint[],
  head: GridPoint,
  eighthIndex: number,
  enforceParity: boolean,
): GridPoint {
  const occupiedSet = new Set(occupied.map((p) => `${p.x},${p.y}`));
  const matching: GridPoint[] = [];
  const fallback: GridPoint[] = [];

  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (occupiedSet.has(`${x},${y}`)) continue;
      const pt = { x, y };
      fallback.push(pt);
      const dist = Math.abs(x - head.x) + Math.abs(y - head.y);
      if (!enforceParity || (eighthIndex + dist) % 2 === 0) {
        matching.push(pt);
      }
    }
  }

  const pool = matching.length > 0 ? matching : fallback;
  if (pool.length === 0) return { x: 0, y: 0 };
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function App() {
  // Game state
  const [status, setStatus] = useState<GameStatus>('START');
  const [snake, setSnake] = useState<GridPoint[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<GridPoint>({ x: 14, y: 10 });
  const [goldenFood, setGoldenFood] = useState<GoldenFood | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => loadHighScore());
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [combo, setCombo] = useState(1);
  const [maxCombo, setMaxCombo] = useState(1);
  const [isShaking, setIsShaking] = useState(false);

  // Music & rhythm state
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [trackProgress, setTrackProgress] = useState(0);
  const [beatInBar, setBeatInBar] = useState(0);
  const [isComboBeat, setIsComboBeat] = useState(true);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Refs for synchronous game loop updates inside audio beat callbacks
  const statusRef = useRef<GameStatus>(status);
  const snakeRef = useRef<GridPoint[]>(snake);
  const foodRef = useRef<GridPoint>(food);
  const goldenRef = useRef<GoldenFood | null>(goldenFood);
  const scoreRef = useRef(score);
  const highScoreRef = useRef(highScore);
  const comboRef = useRef(combo);
  const maxComboRef = useRef(maxCombo);
  const directionRef = useRef<Direction>('RIGHT');
  const directionQueueRef = useRef<Direction[]>([]);
  const activeTrackIndexRef = useRef(activeTrackIndex);
  const totalEighthTicksRef = useRef(0);
  const currentEighthInLoopRef = useRef(0);
  const calloutIdRef = useRef(0);

  // Canvas animation refs
  const beatPulseRef = useRef(0);
  const screenFlashRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const calloutsRef = useRef<FloatingCallout[]>([]);

  const track = TRACKS[activeTrackIndex];

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    activeTrackIndexRef.current = activeTrackIndex;
  }, [activeTrackIndex]);

  const spawnBurst = useCallback((gridPt: GridPoint, color: string, count = 16) => {
    const cell = 560 / GRID_SIZE;
    const cx = gridPt.x * cell + cell / 2;
    const cy = gridPt.y * cell + cell / 2;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 1.8 + Math.random() * 4.2;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 2.8,
        color,
        alpha: 1,
        decay: 0.025 + Math.random() * 0.02,
      });
    }
  }, []);

  const spawnCallout = useCallback((gridPt: GridPoint, text: string, color: string) => {
    const cell = 560 / GRID_SIZE;
    const cx = Math.max(48, Math.min(512, gridPt.x * cell + cell / 2));
    const cy = Math.max(28, gridPt.y * cell);
    calloutIdRef.current += 1;
    calloutsRef.current.push({
      id: calloutIdRef.current,
      x: cx,
      y: cy,
      text,
      color,
      alpha: 1,
      vy: -1.05,
    });
  }, []);

  const triggerGameOver = useCallback(() => {
    statusRef.current = 'GAME_OVER';
    setStatus('GAME_OVER');
    setIsShaking(true);
    synthEngine.playGameOverSound();
    spawnBurst(snakeRef.current[0], TRACKS[activeTrackIndexRef.current].theme.secondary, 26);

    window.setTimeout(() => {
      setIsShaking(false);
    }, 450);
  }, [spawnBurst]);

  const resetGame = useCallback((initialDirection: Direction = 'RIGHT') => {
    const startSnake = INITIAL_SNAKE.map((p) => ({ ...p }));
    const initialDir = initialDirection === 'LEFT' ? 'RIGHT' : initialDirection;
    const initialFood = spawnFreeFood(
      startSnake,
      startSnake[0],
      currentEighthInLoopRef.current,
      true,
    );

    snakeRef.current = startSnake;
    foodRef.current = initialFood;
    goldenRef.current = null;
    scoreRef.current = 0;
    comboRef.current = 1;
    maxComboRef.current = 1;
    directionRef.current = initialDir;
    directionQueueRef.current = [];
    particlesRef.current = [];
    calloutsRef.current = [];

    setSnake(startSnake);
    setFood(initialFood);
    setGoldenFood(null);
    setScore(0);
    setCombo(1);
    setMaxCombo(1);
    setIsNewHighScore(false);
    setIsShaking(false);
    statusRef.current = 'PLAYING';
    setStatus('PLAYING');
  }, []);

  const startMusicIfIdle = useCallback(() => {
    if (!synthEngine.getIsPlaying()) {
      synthEngine.start(activeTrackIndexRef.current);
      setIsMusicPlaying(true);
      setAnalyser(synthEngine.getAnalyser());
    }
  }, []);

  const handleStartGame = useCallback(
    (initialDirection: Direction = 'RIGHT') => {
      startMusicIfIdle();
      resetGame(initialDirection);
    },
    [resetGame, startMusicIfIdle],
  );

  const handleReplay = useCallback(() => {
    startMusicIfIdle();
    resetGame('RIGHT');
  }, [resetGame, startMusicIfIdle]);

  const queueDirection = useCallback((nextDir: Direction) => {
    const queue = directionQueueRef.current;
    const reference = queue.length > 0 ? queue[queue.length - 1] : directionRef.current;
    if (nextDir === reference || isOppositeDirection(nextDir, reference)) {
      return;
    }
    if (queue.length < 2) {
      queue.push(nextDir);
    }
  }, []);

  /**
   * Advances the Snake by 1 cell, synchronized to the music's 8th-note grid.
   */
  const stepSnake = useCallback(
    (eighthIndex: number, comboBeatActive: boolean, isDropStep: boolean) => {
      totalEighthTicksRef.current += 1;
      currentEighthInLoopRef.current = eighthIndex;

      if (statusRef.current !== 'PLAYING') return;

      const curTrack = TRACKS[activeTrackIndexRef.current];
      const theme = curTrack.theme;

      // Pop buffered direction if available
      if (directionQueueRef.current.length > 0) {
        const nextDir = directionQueueRef.current.shift()!;
        if (!isOppositeDirection(nextDir, directionRef.current)) {
          directionRef.current = nextDir;
        }
      }

      const curSnake = snakeRef.current;
      const head = curSnake[0];
      const dir = directionRef.current;

      const nextHead: GridPoint = {
        x: head.x + (dir === 'RIGHT' ? 1 : dir === 'LEFT' ? -1 : 0),
        y: head.y + (dir === 'DOWN' ? 1 : dir === 'UP' ? -1 : 0),
      };

      // Wall collision check
      if (
        nextHead.x < 0 ||
        nextHead.x >= GRID_SIZE ||
        nextHead.y < 0 ||
        nextHead.y >= GRID_SIZE
      ) {
        triggerGameOver();
        return;
      }

      const eatingRegular =
        nextHead.x === foodRef.current.x && nextHead.y === foodRef.current.y;
      const eatingGolden =
        goldenRef.current !== null &&
        nextHead.x === goldenRef.current.x &&
        nextHead.y === goldenRef.current.y;

      // Tail moves out of the way unless growing this tick
      const bodyToCheck = eatingRegular || eatingGolden ? curSnake : curSnake.slice(0, -1);
      const hitSelf = bodyToCheck.some(
        (seg) => seg.x === nextHead.x && seg.y === nextHead.y,
      );
      if (hitSelf) {
        triggerGameOver();
        return;
      }

      const nextSnake = [nextHead, ...curSnake];
      if (!eatingRegular && !eatingGolden) {
        nextSnake.pop();
      }
      snakeRef.current = nextSnake;
      setSnake(nextSnake);

      // Handle regular food pickup & Beat Combo multiplier
      if (eatingRegular) {
        const nextCombo = comboBeatActive ? comboRef.current + 1 : 1;
        comboRef.current = nextCombo;
        setCombo(nextCombo);

        if (nextCombo > maxComboRef.current) {
          maxComboRef.current = nextCombo;
          setMaxCombo(nextCombo);
        }

        const gained = 10 * nextCombo;
        const nextScore = scoreRef.current + gained;
        scoreRef.current = nextScore;
        setScore(nextScore);

        if (nextScore > highScoreRef.current) {
          highScoreRef.current = nextScore;
          setHighScore(nextScore);
          setIsNewHighScore(true);
          saveHighScore(nextScore);
        }

        synthEngine.playEatSound(comboBeatActive, nextCombo);
        spawnBurst(nextHead, comboBeatActive ? theme.accent : theme.foodColor, comboBeatActive ? 20 : 12);
        spawnCallout(
          nextHead,
          comboBeatActive ? `ON BEAT x${nextCombo}! +${gained}` : `OFF BEAT +${gained}`,
          comboBeatActive ? theme.accent : '#94a3b8',
        );

        const occupied = goldenRef.current
          ? [...nextSnake, { x: goldenRef.current.x, y: goldenRef.current.y }]
          : nextSnake;
        const nextFood = spawnFreeFood(occupied, nextHead, eighthIndex, true);
        foodRef.current = nextFood;
        setFood(nextFood);
      }

      // Handle Golden Drop pickup
      if (eatingGolden && goldenRef.current) {
        const bonus = 50 * comboRef.current;
        const nextScore = scoreRef.current + bonus;
        scoreRef.current = nextScore;
        setScore(nextScore);

        if (nextScore > highScoreRef.current) {
          highScoreRef.current = nextScore;
          setHighScore(nextScore);
          setIsNewHighScore(true);
          saveHighScore(nextScore);
        }

        goldenRef.current = null;
        setGoldenFood(null);
        screenFlashRef.current = 1;
        synthEngine.playGoldenDropEatSound();
        spawnBurst(nextHead, '#fde047', 30);
        spawnCallout(nextHead, `DROP BONUS +${bonus}!`, '#fde047');
      } else if (
        goldenRef.current &&
        totalEighthTicksRef.current >= goldenRef.current.expiresAtStep
      ) {
        // Expire uncollected golden drop cleanly
        goldenRef.current = null;
        setGoldenFood(null);
      }

      // Spawn Golden Drop on track beat drops
      if (isDropStep && !goldenRef.current && !eatingGolden) {
        const dropLoc = spawnFreeFood(
          [...nextSnake, foodRef.current],
          nextHead,
          eighthIndex,
          false,
        );
        const newGolden: GoldenFood = {
          ...dropLoc,
          spawnedAtStep: totalEighthTicksRef.current,
          expiresAtStep: totalEighthTicksRef.current + 24,
        };
        goldenRef.current = newGolden;
        setGoldenFood(newGolden);
        screenFlashRef.current = 0.35;
      }
    },
    [spawnBurst, spawnCallout, triggerGameOver],
  );

  // Subscribe to Web Audio synth beat events
  useEffect(() => {
    const unsubscribe = synthEngine.subscribe((event: BeatTickEvent) => {
      setTrackProgress(event.progress);

      if (event.isQuarterBeat) {
        beatPulseRef.current = 1;
        setBeatInBar(Math.floor((event.step % 16) / 4));
      }

      if (event.step % 2 === 0) {
        const eighthIndex = Math.floor(event.step / 2);
        setIsComboBeat(event.isComboBeat);
        stepSnake(eighthIndex, event.isComboBeat, event.isDropStep);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [stepSnake]);

  // Fallback BPM clock if the user pauses music playback while actively playing Snake
  useEffect(() => {
    if (status !== 'PLAYING' || isMusicPlaying) return;

    const eighthMs = (60 / track.bpm / 2) * 1000;
    let fallbackEighth = currentEighthInLoopRef.current;

    const id = window.setInterval(() => {
      fallbackEighth = (fallbackEighth + 1) % (track.loopSteps / 2);
      const comboBeatNow = fallbackEighth % 4 === 0;
      if (fallbackEighth % 2 === 0) {
        beatPulseRef.current = 1;
        setBeatInBar(Math.floor((fallbackEighth % 8) / 2));
      }
      setIsComboBeat(comboBeatNow);
      stepSnake(fallbackEighth, comboBeatNow, false);
    }, eighthMs);

    return () => window.clearInterval(id);
  }, [status, isMusicPlaying, track.bpm, track.loopSteps, stepSnake]);

  // Keyboard controls (Arrows / WASD / Space / Enter + "Press any key to drop the beat")
  useEffect(() => {
    const keyToDirection = (key: string): Direction | null => {
      switch (key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          return 'UP';
        case 'ArrowDown':
        case 's':
        case 'S':
          return 'DOWN';
        case 'ArrowLeft':
        case 'a':
        case 'A':
          return 'LEFT';
        case 'ArrowRight':
        case 'd':
        case 'D':
          return 'RIGHT';
        default:
          return null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts when focused inside range slider
      if (
        e.target instanceof HTMLInputElement &&
        e.target.type === 'range'
      ) {
        return;
      }

      const dir = keyToDirection(e.key);
      if (dir) {
        e.preventDefault();
      }

      if (statusRef.current === 'START') {
        const ignoreKeys = ['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape', 'CapsLock'];
        if (ignoreKeys.includes(e.key)) return;
        e.preventDefault();
        handleStartGame(dir ?? 'RIGHT');
        return;
      }

      if (statusRef.current === 'GAME_OVER') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleReplay();
        }
        return;
      }

      if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (statusRef.current === 'PLAYING') {
          statusRef.current = 'PAUSED';
          setStatus('PAUSED');
        } else if (statusRef.current === 'PAUSED') {
          statusRef.current = 'PLAYING';
          setStatus('PLAYING');
        }
        return;
      }

      if (statusRef.current === 'PLAYING' && dir) {
        queueDirection(dir);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleReplay, handleStartGame, queueDirection]);

  // Music player controls
  const handleSelectTrack = useCallback((index: number) => {
    const normalized = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
    setActiveTrackIndex(normalized);
    activeTrackIndexRef.current = normalized;
    setTrackProgress(0);
    synthEngine.setTrack(normalized, true);
    setIsMusicPlaying(true);
    setAnalyser(synthEngine.getAnalyser());
  }, []);

  const handleToggleMusicPlay = useCallback(() => {
    if (synthEngine.getIsPlaying()) {
      synthEngine.pause();
      setIsMusicPlaying(false);
    } else {
      synthEngine.start(activeTrackIndexRef.current);
      setIsMusicPlaying(true);
      setAnalyser(synthEngine.getAnalyser());
    }
  }, []);

  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val);
    if (val > 0 && isMuted) {
      setIsMuted(false);
      synthEngine.setMuted(false);
    }
    synthEngine.setVolume(val);
  }, [isMuted]);

  const handleToggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    synthEngine.setMuted(next);
  }, [isMuted]);

  const handleSwipeOrPadDirection = useCallback(
    (dir: Direction) => {
      if (statusRef.current === 'START') {
        handleStartGame(dir);
        return;
      }
      if (statusRef.current === 'PLAYING') {
        queueDirection(dir);
      }
    },
    [handleStartGame, queueDirection],
  );

  const handleToggleGamePause = useCallback(() => {
    if (status === 'PLAYING') {
      statusRef.current = 'PAUSED';
      setStatus('PAUSED');
    } else if (status === 'PAUSED') {
      statusRef.current = 'PLAYING';
      setStatus('PLAYING');
    }
  }, [status]);

  const theme = track.theme;

  return (
    <div className="relative min-h-screen bg-[#05060b] text-slate-100 flex flex-col justify-between overflow-x-hidden">
      {/* Ambient cyberpunk background aura tied to active track */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-40 transition-all duration-700"
        style={{
          background: `radial-gradient(circle at 20% 20%, ${theme.primary}18 0%, transparent 45%), radial-gradient(circle at 80% 75%, ${theme.secondary}18 0%, transparent 48%)`,
        }}
      />

      {/* Top Header */}
      <header className="relative z-10 w-full max-w-[1320px] mx-auto px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between gap-4">
        <h1
          className="font-display text-lg sm:text-2xl font-black tracking-wider text-white whitespace-nowrap shrink-0"
          style={{ textShadow: `0 0 18px ${theme.primary}80` }}
        >
          NEON BEAT SNAKE
        </h1>

        <div className="flex items-center gap-4 shrink-0">
          <span className="hidden sm:inline font-mono text-xs text-slate-400 tabular-nums whitespace-nowrap">
            {track.title} · {track.bpm} BPM
          </span>
          {(status === 'PLAYING' || status === 'PAUSED') && (
            <button
              type="button"
              onClick={handleToggleGamePause}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {status === 'PAUSED' ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Main 3-Column Arena */}
      <main className="relative z-10 w-full max-w-[1320px] mx-auto px-4 sm:px-6 py-3 flex-1 flex flex-col justify-center gap-5">
        {/* Compact Mobile Score Strip (hidden on lg desktop where StatsPanel sits beside canvas) */}
        <div className="lg:hidden cyber-glass rounded-xl border border-white/10 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-slate-400">Score</span>
            <span className="font-mono text-lg font-bold tabular-nums text-white">{score}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-slate-400">Combo</span>
            <span
              className="font-mono text-lg font-bold tabular-nums"
              style={{ color: combo > 1 ? theme.secondary : '#e2e8f0' }}
            >
              x{combo}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-slate-400">Best</span>
            <span className="font-mono text-lg font-bold tabular-nums text-amber-300">{highScore}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[270px_minmax(0,560px)_270px] items-start justify-center gap-5 xl:gap-7">
          {/* Left Panel: Track List */}
          <div className="order-3 lg:order-1">
            <TrackList
              activeTrackIndex={activeTrackIndex}
              isMusicPlaying={isMusicPlaying}
              onSelectTrack={handleSelectTrack}
            />
          </div>

          {/* Center: Snake Canvas & Touch Controls */}
          <div className="order-1 lg:order-2 flex flex-col items-center gap-4">
            <SnakeCanvas
              snake={snake}
              food={food}
              goldenFood={goldenFood}
              track={track}
              status={status}
              score={score}
              highScore={highScore}
              combo={combo}
              maxCombo={maxCombo}
              isNewHighScore={isNewHighScore}
              beatPulseRef={beatPulseRef}
              isComboBeat={isComboBeat}
              screenFlashRef={screenFlashRef}
              isShaking={isShaking}
              particlesRef={particlesRef}
              calloutsRef={calloutsRef}
              analyser={analyser}
              onStart={() => handleStartGame('RIGHT')}
              onReplay={handleReplay}
              onResume={handleToggleGamePause}
              onSwipeDirection={handleSwipeOrPadDirection}
            />

            {/* Mobile D-Pad for responsive tap control alongside swipe */}
            <div className="grid grid-cols-3 gap-2 w-44 sm:hidden" aria-label="Touch direction pad">
              <div />
              <button
                type="button"
                onClick={() => handleSwipeOrPadDirection('UP')}
                aria-label="Move up"
                className="h-11 rounded-xl border border-white/15 bg-white/5 active:bg-white/15 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
              <div />
              <button
                type="button"
                onClick={() => handleSwipeOrPadDirection('LEFT')}
                aria-label="Move left"
                className="h-11 rounded-xl border border-white/15 bg-white/5 active:bg-white/15 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => handleSwipeOrPadDirection('DOWN')}
                aria-label="Move down"
                className="h-11 rounded-xl border border-white/15 bg-white/5 active:bg-white/15 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => handleSwipeOrPadDirection('RIGHT')}
                aria-label="Move right"
                className="h-11 rounded-xl border border-white/15 bg-white/5 active:bg-white/15 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Right Panel: Game Stats */}
          <div className="order-2 lg:order-3">
            <StatsPanel
              score={score}
              highScore={highScore}
              combo={combo}
              maxCombo={maxCombo}
              beatInBar={beatInBar}
              isComboBeat={isComboBeat}
              goldenActive={goldenFood !== null}
              track={track}
            />
          </div>
        </div>
      </main>

      {/* Bottom Music Player Dock */}
      <div className="relative z-10 w-full max-w-[1320px] mx-auto px-4 sm:px-6 pb-4 pt-1">
        <MusicControls
          track={track}
          isPlaying={isMusicPlaying}
          progress={trackProgress}
          volume={volume}
          isMuted={isMuted}
          onTogglePlay={handleToggleMusicPlay}
          onPrevTrack={() => handleSelectTrack(activeTrackIndex - 1)}
          onNextTrack={() => handleSelectTrack(activeTrackIndex + 1)}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
        />
      </div>
    </div>
  );
}
