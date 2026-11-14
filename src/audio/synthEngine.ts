import { TrackConfig, TRACKS } from '../types/game';

export interface BeatTickEvent {
  /** Current 16th-note step index within the loop (0..63) */
  step: number;
  /** Monotonic 8th-note game tick counter */
  gameTick: number;
  /** True on every quarter-note beat (kick/pulse) */
  isQuarterBeat: boolean;
  /** True on accented combo beats (beats 1 & 3 of each bar -> step % 8 === 0) */
  isComboBeat: boolean;
  /** True when the track hits a programmed drop step */
  isDropStep: boolean;
  /** Progress 0..1 through the current 64-step loop */
  progress: number;
}

type TickListener = (event: BeatTickEvent) => void;

/**
 * Pure Web Audio API lookahead synthesizer + beat clock.
 * Generates 3 original multi-instrument tracks (drums, bass, arpeggio/chords)
 * in real time with zero external audio files.
 */
class SynthEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  private currentTrackIndex = 0;
  private isPlaying = false;
  private volume = 0.7;
  private isMuted = false;

  private currentStep = 0;
  private gameTick = 0;
  private nextNoteTime = 0;
  private schedulerId: number | null = null;
  private pendingTimeouts: Set<number> = new Set();
  private listeners: Set<TickListener> = new Set();

  // Reusable noise buffer for snares & hi-hats
  private noiseBuffer: AudioBuffer | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.2;

      // Analyser sits BEFORE masterGain so the canvas visualizer still reacts when muted
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.volume;

      this.compressor.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const bufferSize = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public getCurrentTrack(): TrackConfig {
    return TRACKS[this.currentTrackIndex];
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public subscribe(listener: TickListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.masterGain && this.ctx) {
      const target = this.isMuted ? 0 : this.volume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      const target = this.isMuted ? 0 : this.volume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
    }
  }

  public start(trackIndex?: number): void {
    const ctx = this.ensureContext();
    if (typeof trackIndex === 'number' && trackIndex >= 0 && trackIndex < TRACKS.length) {
      this.currentTrackIndex = trackIndex;
    }

    if (this.isPlaying) return;

    this.isPlaying = true;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.schedulerId = window.setInterval(() => this.scheduler(), 25);
  }

  public pause(): void {
    this.isPlaying = false;
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    this.clearPendingTimeouts();
  }

  public resetProgress(): void {
    this.currentStep = 0;
    this.gameTick = 0;
  }

  public setTrack(index: number, keepPlaying = true): void {
    const normalized = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
    this.currentTrackIndex = normalized;
    this.currentStep = 0;
    this.clearPendingTimeouts();

    if (keepPlaying) {
      if (this.isPlaying && this.ctx) {
        this.nextNoteTime = this.ctx.currentTime + 0.04;
      } else {
        this.start(normalized);
      }
    }
  }

  private clearPendingTimeouts(): void {
    this.pendingTimeouts.forEach((id) => window.clearTimeout(id));
    this.pendingTimeouts.clear();
  }

  private scheduler(): void {
    if (!this.ctx || !this.isPlaying) return;
    const scheduleAheadTime = 0.11;

    while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      this.advanceStep();
    }
  }

  private advanceStep(): void {
    const track = TRACKS[this.currentTrackIndex];
    // 16th-note step duration in seconds
    const sixteenth = 60 / track.bpm / 4;
    this.nextNoteTime += sixteenth;
    this.currentStep = (this.currentStep + 1) % track.loopSteps;
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.ctx || !this.compressor) return;
    const track = TRACKS[this.currentTrackIndex];

    // Synthesize the track-specific instruments for this 16th-note step
    if (track.id === 'neon-pulse') {
      this.playNeonPulseStep(step, time);
    } else if (track.id === 'glitch-garden') {
      this.playGlitchGardenStep(step, time);
    } else {
      this.playMidnightCircuitStep(step, time);
    }

    // Fire game/UI tick synchronized to exact Web Audio playback time
    const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
    const isEighth = step % 2 === 0;
    const isQuarter = step % 4 === 0;
    const isComboBeat = step % 8 === 0;
    const isDropStep = track.dropSteps.includes(step);
    const progress = (step + 1) / track.loopSteps;

    const timeoutId = window.setTimeout(() => {
      this.pendingTimeouts.delete(timeoutId);
      if (!this.isPlaying) return;

      if (isEighth) {
        this.gameTick += 1;
      }

      const event: BeatTickEvent = {
        step,
        gameTick: this.gameTick,
        isQuarterBeat: isQuarter,
        isComboBeat,
        isDropStep,
        progress,
      };
      this.listeners.forEach((fn) => fn(event));
    }, delayMs);

    this.pendingTimeouts.add(timeoutId);
  }

  // =========================================================================
  // TRACK 1: "Neon Pulse" (110 BPM, Synthwave)
  // =========================================================================
  private playNeonPulseStep(step: number, time: number): void {
    const stepInBar = step % 16;
    const bar = Math.floor(step / 16);

    // Kick on 1, 2, 3, 4 (classic driving synthwave)
    if (stepInBar % 4 === 0) {
      this.triggerKick(time, 130, 42, 0.24, 0.85);
    }
    // Gated snare on 2 and 4
    if (stepInBar === 4 || stepInBar === 12) {
      this.triggerSnare(time, 0.18, 1200, 0.45);
    }
    // Crisp 8th off-beat hi-hat
    if (stepInBar % 2 === 1) {
      this.triggerHiHat(time, 0.05, 8500, 0.18);
    }

    // Driving 8th-note synthwave bass progression (A minor -> F -> C -> G)
    const bassRoots = [55.0, 43.65, 65.41, 49.0]; // A1, F1, C2, G1
    const root = bassRoots[bar % 4];
    if (step % 2 === 0) {
      const freq = stepInBar % 4 === 2 ? root * 2 : root;
      this.triggerBass(time, freq, 0.19, 'sawtooth', 950, 0.36);
    }

    // Bright retro 16th-note arpeggio
    const arpChords = [
      [220, 261.63, 329.63, 440], // Am
      [174.61, 220, 261.63, 349.23], // F
      [261.63, 329.63, 392.0, 523.25], // C
      [196.0, 246.94, 293.66, 392.0], // G
    ];
    const chord = arpChords[bar % 4];
    const note = chord[stepInBar % 4];
    // Accent the drop at bar 2 (step >= 32) with an octave lift
    const octaveMult = step >= 32 && stepInBar % 2 === 0 ? 1.5 : 1;
    this.triggerLead(time, note * octaveMult, 0.11, 'triangle', 2600, 0.16);
  }

  // =========================================================================
  // TRACK 2: "Glitch Garden" (128 BPM, Techno)
  // =========================================================================
  private playGlitchGardenStep(step: number, time: number): void {
    const stepInBar = step % 16;
    const bar = Math.floor(step / 16);

    // Punchy four-on-the-floor techno kick
    if (stepInBar % 4 === 0) {
      this.triggerKick(time, 165, 38, 0.2, 0.95);
    }
    // Sharp clap on 2 & 4 + glitch ghost on step 15
    if (stepInBar === 4 || stepInBar === 12) {
      this.triggerSnare(time, 0.13, 2200, 0.42);
    }
    // Open hat on off-beats, closed ticks on 16ths
    if (stepInBar % 4 === 2) {
      this.triggerHiHat(time, 0.11, 9500, 0.24);
    } else if (stepInBar % 2 === 1) {
      this.triggerHiHat(time, 0.03, 11000, 0.12);
    }

    // Acid rolling 16th bassline (E minor phrygian)
    const acidPattern = [
      82.41, 0, 82.41, 98.0,
      82.41, 0, 110.0, 82.41,
      82.41, 123.47, 82.41, 0,
      98.0, 82.41, 146.83, 110.0,
    ];
    const bassFreq = acidPattern[stepInBar];
    if (bassFreq > 0) {
      const filterCutoff = step >= 32 ? 1700 : 1150;
      this.triggerBass(time, bassFreq, 0.1, 'sawtooth', filterCutoff, 0.34, 8);
    }

    // Glitchy FM-style bleeps
    const glitchNotes = [659.25, 0, 783.99, 987.77, 0, 659.25, 1174.66, 0];
    const gNote = glitchNotes[(stepInBar + bar * 3) % glitchNotes.length];
    if (gNote > 0 && (step >= 16 || stepInBar % 2 === 0)) {
      this.triggerLead(time, gNote, 0.06, 'square', 3400, 0.1);
    }
  }

  // =========================================================================
  // TRACK 3: "Midnight Circuit" (90 BPM, Chill Lo-Fi)
  // =========================================================================
  private playMidnightCircuitStep(step: number, time: number): void {
    const stepInBar = step % 16;
    const bar = Math.floor(step / 16);

    // Boom-bap lo-fi kick pattern
    if (stepInBar === 0 || stepInBar === 7 || stepInBar === 10) {
      this.triggerKick(time, 105, 45, 0.28, 0.78);
    }
    // Dusty snare on 2 & 4
    if (stepInBar === 4 || stepInBar === 12) {
      this.triggerSnare(time, 0.14, 950, 0.3);
    }
    // Soft swung 8th hats
    if (stepInBar % 2 === 0) {
      const swingOffset = stepInBar % 4 === 2 ? 0.018 : 0;
      this.triggerHiHat(time + swingOffset, 0.04, 6200, 0.11);
    }

    // Warm sub bass
    const subRoots = [73.42, 65.41, 58.27, 65.41]; // D2, C2, Bb1, C2
    const root = subRoots[bar % 4];
    if (stepInBar === 0 || stepInBar === 6 || stepInBar === 10) {
      this.triggerBass(time, root, 0.32, 'sine', 500, 0.42);
    }

    // Warm lo-fi Rhodes chord stabs on bar downbeats & syncopations
    const chords = [
      [293.66, 349.23, 440.0, 523.25], // Dm7
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [233.08, 293.66, 349.23, 440.0], // Bbmaj7
      [261.63, 311.13, 392.0, 466.16], // Cm7
    ];
    if (stepInBar === 0 || stepInBar === 6) {
      const chord = chords[bar % 4];
      chord.forEach((freq) => {
        this.triggerLead(time, freq, 0.35, 'triangle', 1400, 0.08);
      });
    }
    // Gentle bell melody on top
    const melody = [587.33, 0, 523.25, 440.0, 0, 392.0, 440.0, 0];
    const mNote = melody[stepInBar % 8];
    if (mNote > 0 && stepInBar >= 8) {
      this.triggerLead(time, mNote, 0.18, 'sine', 2200, 0.12);
    }
  }

  // =========================================================================
  // SYNTHESIS PRIMITIVES
  // =========================================================================
  private triggerKick(
    time: number,
    startFreq: number,
    endFreq: number,
    duration: number,
    gainLevel: number,
  ): void {
    if (!this.ctx || !this.compressor) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.08);

    gain.gain.setValueAtTime(gainLevel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.compressor);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private triggerSnare(time: number, duration: number, cutoff: number, gainLevel: number): void {
    if (!this.ctx || !this.compressor || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(cutoff, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainLevel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);
    noise.start(time);
    noise.stop(time + duration + 0.02);
  }

  private triggerHiHat(time: number, duration: number, cutoff: number, gainLevel: number): void {
    if (!this.ctx || !this.compressor || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(cutoff, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainLevel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);
    noise.start(time);
    noise.stop(time + duration + 0.01);
  }

  private triggerBass(
    time: number,
    freq: number,
    duration: number,
    wave: OscillatorType,
    cutoff: number,
    gainLevel: number,
    q = 3,
  ): void {
    if (!this.ctx || !this.compressor) return;

    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.35), time + duration);
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(gainLevel, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private triggerLead(
    time: number,
    freq: number,
    duration: number,
    wave: OscillatorType,
    cutoff: number,
    gainLevel: number,
  ): void {
    if (!this.ctx || !this.compressor) return;

    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(gainLevel, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  // =========================================================================
  // GAME SOUND EFFECTS
  // =========================================================================
  public playEatSound(onBeat: boolean, combo: number): void {
    const ctx = this.ensureContext();
    if (!this.compressor) return;
    const now = ctx.currentTime;

    if (onBeat) {
      // Uplifting harmonic chime rising slightly with combo
      const base = 523.25 * Math.pow(1.05946, Math.min(combo, 12));
      this.triggerLead(now, base, 0.14, 'triangle', 4800, 0.25);
      this.triggerLead(now + 0.045, base * 1.5, 0.18, 'sine', 5200, 0.22);
    } else {
      // Muted off-beat blip
      this.triggerLead(now, 311.13, 0.09, 'triangle', 1400, 0.16);
    }
  }

  public playGoldenDropEatSound(): void {
    const ctx = this.ensureContext();
    if (!this.compressor) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      this.triggerLead(now + idx * 0.04, f, 0.24, 'triangle', 6000, 0.24);
    });
  }

  public playGameOverSound(): void {
    const ctx = this.ensureContext();
    if (!this.compressor) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.45);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    osc.connect(gain);
    gain.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.5);
  }
}

export const synthEngine = new SynthEngine();
