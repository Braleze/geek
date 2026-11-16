// Pure Web Audio API synthesizer for keypad feedback and a synthwave
// rendition of the "Never Gonna Give You Up" chorus melody (~113 BPM).

type NoteStep = {
  freq: number;
  bassFreq: number;
  durationSteps: number; // 1 step = 16th note (~132ms at 113 BPM)
};

// Frequencies (Hz)
const NOTE: Record<string, number> = {
  R: 0,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  Bb3: 233.08,
  C4: 261.63,
  D4: 293.66,
  Eb4: 311.13,
  F4: 349.23,
  G4: 392.0,
  Ab4: 415.3,
  A4: 440.0,
  Bb4: 466.16,
  C5: 523.25,
  D5: 587.33,
  Eb5: 622.25,
  F5: 698.46,
  G5: 783.99,
};

// Classic "Never gonna give you up..." chorus phrase loop
const CHORUS_SEQUENCE: NoteStep[] = [
  // "Ne-ver gon-na give you up"
  { freq: NOTE.C4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.D4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.F4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.D4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.A4, bassFreq: NOTE.C4 / 2, durationSteps: 3 },
  { freq: NOTE.A4, bassFreq: NOTE.C4 / 2, durationSteps: 3 },
  { freq: NOTE.G4, bassFreq: NOTE.C4 / 2, durationSteps: 4 },
  { freq: NOTE.R, bassFreq: NOTE.C4 / 2, durationSteps: 2 },

  // "Ne-ver gon-na let you down"
  { freq: NOTE.C4, bassFreq: NOTE.A3 / 2, durationSteps: 2 },
  { freq: NOTE.D4, bassFreq: NOTE.A3 / 2, durationSteps: 2 },
  { freq: NOTE.F4, bassFreq: NOTE.A3 / 2, durationSteps: 2 },
  { freq: NOTE.D4, bassFreq: NOTE.A3 / 2, durationSteps: 2 },
  { freq: NOTE.G4, bassFreq: NOTE.D4 / 2, durationSteps: 3 },
  { freq: NOTE.G4, bassFreq: NOTE.D4 / 2, durationSteps: 3 },
  { freq: NOTE.F4, bassFreq: NOTE.D4 / 2, durationSteps: 3 },
  { freq: NOTE.E4 ?? 329.63, bassFreq: NOTE.D4 / 2, durationSteps: 1 },
  { freq: NOTE.D4, bassFreq: NOTE.D4 / 2, durationSteps: 2 },

  // "Ne-ver gon-na run a-round and de-sert you"
  { freq: NOTE.C4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.D4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.F4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.D4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.F4, bassFreq: NOTE.C4 / 2, durationSteps: 4 },
  { freq: NOTE.G4, bassFreq: NOTE.C4 / 2, durationSteps: 2 },
  { freq: NOTE.E4 ?? 329.63, bassFreq: NOTE.A3 / 2, durationSteps: 3 },
  { freq: NOTE.D4, bassFreq: NOTE.A3 / 2, durationSteps: 1 },
  { freq: NOTE.C4, bassFreq: NOTE.D4 / 2, durationSteps: 4 },
  { freq: NOTE.C4, bassFreq: NOTE.D4 / 2, durationSteps: 2 },
  { freq: NOTE.G4, bassFreq: NOTE.G3 / 2, durationSteps: 4 },
  { freq: NOTE.F4, bassFreq: NOTE.G3 / 2, durationSteps: 6 },
  { freq: NOTE.R, bassFreq: NOTE.G3 / 2, durationSteps: 4 },
];

export function playKeypadTone(type: 'digit' | 'error' | 'unlock'): void {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'digit') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.06);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.setValueAtTime(140, now + 0.1);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      osc.frequency.setValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.start(now);
      osc.stop(now + 0.35);
    }

    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 500);
  } catch {
    // Ignore audio context restrictions
  }
}

export class RickrollSynthPlayer {
  private ctx: AudioContext | null = null;
  private timerId: number | null = null;
  private stepIndex = 0;
  private muted = false;
  private playing = false;

  start(): void {
    if (this.playing || typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
      this.playing = true;
      this.stepIndex = 0;
      this.scheduleNext();
    } catch {
      this.playing = false;
    }
  }

  private scheduleNext(): void {
    if (!this.playing || !this.ctx) return;

    const note = CHORUS_SEQUENCE[this.stepIndex % CHORUS_SEQUENCE.length];
    const stepMs = 132;
    const durationSec = (note.durationSteps * stepMs) / 1000;

    if (!this.muted && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    if (!this.muted) {
      const now = this.ctx.currentTime;

      if (note.freq > 0) {
        const lead = this.ctx.createOscillator();
        const leadGain = this.ctx.createGain();
        lead.type = 'triangle';
        lead.frequency.setValueAtTime(note.freq, now);
        leadGain.gain.setValueAtTime(0.14, now);
        leadGain.gain.exponentialRampToValueAtTime(0.01, now + durationSec * 0.92);
        lead.connect(leadGain);
        leadGain.connect(this.ctx.destination);
        lead.start(now);
        lead.stop(now + durationSec * 0.95);
      }

      if (note.bassFreq > 0) {
        const bass = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bass.type = 'sawtooth';
        bass.frequency.setValueAtTime(note.bassFreq, now);
        bassGain.gain.setValueAtTime(0.05, now);
        bassGain.gain.exponentialRampToValueAtTime(0.005, now + durationSec * 0.85);
        bass.connect(bassGain);
        bassGain.connect(this.ctx.destination);
        bass.start(now);
        bass.stop(now + durationSec * 0.9);
      }
    }

    this.stepIndex = (this.stepIndex + 1) % CHORUS_SEQUENCE.length;
    this.timerId = window.setTimeout(() => {
      this.scheduleNext();
    }, note.durationSteps * stepMs);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  stop(): void {
    this.playing = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
