// Pure Web Audio API synthesizers for:
// 1. Keypad feedback tones
// 2. "Never Gonna Give You Up" synthwave loop (code 2027)
// 3. Cyberpunk 2077 dark industrial synthwave loop (code 2077)

type NoteStep = {
  freq: number;
  bassFreq: number;
  durationSteps: number; // 1 step = 16th note
};

const NOTE: Record<string, number> = {
  R: 0,
  E2: 82.41,
  F2: 87.31,
  G2: 98.0,
  A2: 110.0,
  B2: 123.47,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  Bb3: 233.08,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  Eb4: 311.13,
  F4: 349.23,
  G4: 392.0,
  Ab4: 415.3,
  A4: 440.0,
  Bb4: 466.16,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
};

const CHORUS_SEQUENCE: NoteStep[] = [
  { freq: NOTE.C4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.D4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.F4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.D4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.A4, bassFreq: NOTE.C4 / 2, durationSteps: 3 },
  { freq: NOTE.A4, bassFreq: NOTE.C4 / 2, durationSteps: 3 },
  { freq: NOTE.G4, bassFreq: NOTE.C4 / 2, durationSteps: 4 },
  { freq: NOTE.R, bassFreq: NOTE.C4 / 2, durationSteps: 2 },

  { freq: NOTE.C4, bassFreq: NOTE.A3 / 2, durationSteps: 2 },
  { freq: NOTE.D4, bassFreq: NOTE.A3 / 2, durationSteps: 2 },
  { freq: NOTE.F4, bassFreq: NOTE.A3 / 2, durationSteps: 2 },
  { freq: NOTE.D4, bassFreq: NOTE.A3 / 2, durationSteps: 2 },
  { freq: NOTE.G4, bassFreq: NOTE.D4 / 2, durationSteps: 3 },
  { freq: NOTE.G4, bassFreq: NOTE.D4 / 2, durationSteps: 3 },
  { freq: NOTE.F4, bassFreq: NOTE.D4 / 2, durationSteps: 3 },
  { freq: NOTE.E4, bassFreq: NOTE.D4 / 2, durationSteps: 1 },
  { freq: NOTE.D4, bassFreq: NOTE.D4 / 2, durationSteps: 2 },

  { freq: NOTE.C4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.D4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.F4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.D4, bassFreq: NOTE.Bb3 / 2, durationSteps: 2 },
  { freq: NOTE.F4, bassFreq: NOTE.C4 / 2, durationSteps: 4 },
  { freq: NOTE.G4, bassFreq: NOTE.C4 / 2, durationSteps: 2 },
  { freq: NOTE.E4, bassFreq: NOTE.A3 / 2, durationSteps: 3 },
  { freq: NOTE.D4, bassFreq: NOTE.A3 / 2, durationSteps: 1 },
  { freq: NOTE.C4, bassFreq: NOTE.D4 / 2, durationSteps: 4 },
  { freq: NOTE.C4, bassFreq: NOTE.D4 / 2, durationSteps: 2 },
  { freq: NOTE.G4, bassFreq: NOTE.G3 / 2, durationSteps: 4 },
  { freq: NOTE.F4, bassFreq: NOTE.G3 / 2, durationSteps: 6 },
  { freq: NOTE.R, bassFreq: NOTE.G3 / 2, durationSteps: 4 },
];

// Driving Cyberpunk 2077 Phrygian / dark industrial synthwave motif (~132 BPM)
type CyberStep = {
  leadFreq: number;
  bassFreq: number;
  kick: boolean;
  snare: boolean;
};

const CYBERPUNK_SEQUENCE: CyberStep[] = [
  { leadFreq: NOTE.E4, bassFreq: NOTE.E2, kick: true, snare: false },
  { leadFreq: 0, bassFreq: NOTE.E2, kick: false, snare: false },
  { leadFreq: NOTE.G4, bassFreq: NOTE.E2, kick: false, snare: false },
  { leadFreq: NOTE.E4, bassFreq: NOTE.E2, kick: false, snare: false },
  { leadFreq: NOTE.A4, bassFreq: NOTE.E2, kick: false, snare: true },
  { leadFreq: 0, bassFreq: NOTE.G2, kick: false, snare: false },
  { leadFreq: NOTE.G4, bassFreq: NOTE.G2, kick: true, snare: false },
  { leadFreq: NOTE.F4, bassFreq: NOTE.F2, kick: false, snare: false },

  { leadFreq: NOTE.E4, bassFreq: NOTE.E2, kick: true, snare: false },
  { leadFreq: 0, bassFreq: NOTE.E2, kick: false, snare: false },
  { leadFreq: NOTE.B2 * 2, bassFreq: NOTE.E2, kick: false, snare: false },
  { leadFreq: NOTE.E4, bassFreq: NOTE.E2, kick: false, snare: false },
  { leadFreq: NOTE.C5, bassFreq: NOTE.A2, kick: false, snare: true },
  { leadFreq: NOTE.B2 * 2, bassFreq: NOTE.A2, kick: false, snare: false },
  { leadFreq: NOTE.A4, bassFreq: NOTE.G2, kick: true, snare: false },
  { leadFreq: NOTE.G4, bassFreq: NOTE.F2, kick: false, snare: false },
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

export class CyberpunkSynthPlayer {
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

    const step = CYBERPUNK_SEQUENCE[this.stepIndex % CYBERPUNK_SEQUENCE.length];
    const stepMs = 115;
    const durationSec = stepMs / 1000;

    if (!this.muted && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    if (!this.muted) {
      const now = this.ctx.currentTime;

      // Gritty lowpass-filtered industrial bass pulse
      const bass = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const bassGain = this.ctx.createGain();
      bass.type = 'sawtooth';
      bass.frequency.setValueAtTime(step.bassFreq, now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + durationSec * 0.9);
      bassGain.gain.setValueAtTime(0.16, now);
      bassGain.gain.exponentialRampToValueAtTime(0.02, now + durationSec * 0.92);
      bass.connect(filter);
      filter.connect(bassGain);
      bassGain.connect(this.ctx.destination);
      bass.start(now);
      bass.stop(now + durationSec * 0.95);

      // Cyberpunk guitar/lead synth stab
      if (step.leadFreq > 0) {
        const lead = this.ctx.createOscillator();
        const leadGain = this.ctx.createGain();
        lead.type = 'square';
        lead.frequency.setValueAtTime(step.leadFreq, now);
        leadGain.gain.setValueAtTime(0.08, now);
        leadGain.gain.exponentialRampToValueAtTime(0.006, now + durationSec * 1.4);
        lead.connect(leadGain);
        leadGain.connect(this.ctx.destination);
        lead.start(now);
        lead.stop(now + durationSec * 1.45);
      }

      // Punchy kick drum
      if (step.kick) {
        const kick = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(135, now);
        kick.frequency.exponentialRampToValueAtTime(36, now + 0.11);
        kickGain.gain.setValueAtTime(0.24, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        kick.connect(kickGain);
        kickGain.connect(this.ctx.destination);
        kick.start(now);
        kick.stop(now + 0.13);
      }

      // Industrial snare / clap
      if (step.snare) {
        const snare = this.ctx.createOscillator();
        const snareGain = this.ctx.createGain();
        snare.type = 'triangle';
        snare.frequency.setValueAtTime(220, now);
        snare.frequency.exponentialRampToValueAtTime(95, now + 0.08);
        snareGain.gain.setValueAtTime(0.14, now);
        snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        snare.connect(snareGain);
        snareGain.connect(this.ctx.destination);
        snare.start(now);
        snare.stop(now + 0.1);
      }
    }

    this.stepIndex = (this.stepIndex + 1) % CYBERPUNK_SEQUENCE.length;
    this.timerId = window.setTimeout(() => {
      this.scheduleNext();
    }, stepMs);
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
