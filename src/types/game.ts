export type GameStatus = 'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface GridPoint {
  x: number;
  y: number;
}

export type FoodShape = 'diamond' | 'hexagon' | 'orb';

export type VisualizerStyle = 'bars' | 'radial' | 'wave';

export interface TrackTheme {
  primary: string;
  secondary: string;
  accent: string;
  snakeHead: string;
  snakeTail: string;
  snakeGlow: string;
  gridLine: string;
  foodColor: string;
  foodGlow: string;
  foodShape: FoodShape;
  visualizerStyle: VisualizerStyle;
  frameShadow: string;
}

export interface TrackConfig {
  id: string;
  index: number;
  title: string;
  genre: string;
  bpm: number;
  generatedBy: string;
  description: string;
  /** Length of one full looping arrangement in 16th-note steps (e.g., 64 = 4 bars) */
  loopSteps: number;
  /** Step indices (0-based 16th notes) that trigger a "beat drop" golden food spawn */
  dropSteps: number[];
  theme: TrackTheme;
}

export interface GoldenFood extends GridPoint {
  expiresAtStep: number;
  spawnedAtStep: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
}

export interface FloatingCallout {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
}

export const GRID_SIZE = 20;

export const TRACKS: TrackConfig[] = [
  {
    id: 'neon-pulse',
    index: 0,
    title: 'Neon Pulse',
    genre: 'Synthwave',
    bpm: 110,
    generatedBy: 'SynthCore Alpha',
    description: 'Analog sawtooth basslines & gated snare arpeggios.',
    loopSteps: 64,
    dropSteps: [32],
    theme: {
      primary: '#00f5ff',
      secondary: '#ff00aa',
      accent: '#fde047',
      snakeHead: '#00f5ff',
      snakeTail: '#ff00aa',
      snakeGlow: 'rgba(0, 245, 255, 0.85)',
      gridLine: 'rgba(0, 245, 255, 0.08)',
      foodColor: '#ff00aa',
      foodGlow: 'rgba(255, 0, 170, 0.9)',
      foodShape: 'diamond',
      visualizerStyle: 'bars',
      frameShadow: '0 0 36px rgba(0, 245, 255, 0.3), inset 0 0 24px rgba(255, 0, 170, 0.14)',
    },
  },
  {
    id: 'glitch-garden',
    index: 1,
    title: 'Glitch Garden',
    genre: 'Techno',
    bpm: 128,
    generatedBy: 'NeuroBeat Studio',
    description: 'Four-on-the-floor acid kicks & razor FM percussion.',
    loopSteps: 64,
    dropSteps: [32, 48],
    theme: {
      primary: '#a3ff12',
      secondary: '#a855f7',
      accent: '#22d3ee',
      snakeHead: '#a3ff12',
      snakeTail: '#a855f7',
      snakeGlow: 'rgba(163, 255, 18, 0.85)',
      gridLine: 'rgba(163, 255, 18, 0.075)',
      foodColor: '#a855f7',
      foodGlow: 'rgba(168, 85, 247, 0.9)',
      foodShape: 'hexagon',
      visualizerStyle: 'radial',
      frameShadow: '0 0 36px rgba(163, 255, 18, 0.26), inset 0 0 24px rgba(168, 85, 247, 0.16)',
    },
  },
  {
    id: 'midnight-circuit',
    index: 2,
    title: 'Midnight Circuit',
    genre: 'Chill Lo-Fi',
    bpm: 90,
    generatedBy: 'DreamLoop Engine',
    description: 'Warm Rhodes chords, vinyl dust & sub-bass grooves.',
    loopSteps: 64,
    dropSteps: [32],
    theme: {
      primary: '#fbbf24',
      secondary: '#2dd4bf',
      accent: '#fb7185',
      snakeHead: '#fbbf24',
      snakeTail: '#2dd4bf',
      snakeGlow: 'rgba(251, 191, 36, 0.8)',
      gridLine: 'rgba(45, 212, 191, 0.08)',
      foodColor: '#2dd4bf',
      foodGlow: 'rgba(45, 212, 191, 0.9)',
      foodShape: 'orb',
      visualizerStyle: 'wave',
      frameShadow: '0 0 36px rgba(251, 191, 36, 0.25), inset 0 0 24px rgba(45, 212, 191, 0.14)',
    },
  },
];
