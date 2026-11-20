export type TrackKey = 'l30nel';

export const TRACK_BASENAMES: Record<TrackKey, string> = {
  l30nel: 'l30nel',
};

export const TRACK_FILENAMES: Record<TrackKey, string> = {
  l30nel: 'l30nel.mp3',
};

const AUDIO_EXTENSIONS = ['mp3', 'ogg', 'wav', 'm4a'] as const;

export function getTrackCandidateUrls(track: TrackKey): string[] {
  const base = TRACK_BASENAMES[track];
  const urls: string[] = [];
  for (const ext of AUDIO_EXTENSIONS) {
    urls.push(`./audio/${base}.${ext}`);
    urls.push(`./public/audio/${base}.${ext}`);
  }
  return urls;
}

export interface AudioElementLike {
  src: string;
  loop: boolean;
  muted: boolean;
  volume: number;
  preload: string;
  paused: boolean;
  currentTime: number;
  onerror: ((event: string | Event) => unknown) | null;
  play: () => Promise<void> | void;
  pause: () => void;
}

export type AudioFactory = () => AudioElementLike | null;

function defaultAudioFactory(): AudioElementLike | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null;
  }
  return new Audio();
}

export class TrackAudioPlayer {
  private readonly candidates: string[];
  private readonly createAudio: AudioFactory;
  private audio: AudioElementLike | null = null;
  private candidateIndex = 0;
  private muted = false;
  private stopped = false;
  private exhausted = false;

  constructor(track: TrackKey, createAudio: AudioFactory = defaultAudioFactory) {
    this.candidates = getTrackCandidateUrls(track);
    this.createAudio = createAudio;
  }

  start(): void {
    if (this.audio || this.candidates.length === 0) return;

    const audio = this.createAudio();
    if (!audio) return;

    this.stopped = false;
    this.exhausted = false;
    this.candidateIndex = 0;
    this.audio = audio;

    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.85;
    audio.muted = this.muted;

    audio.onerror = () => {
      if (this.stopped || !this.audio) return;
      this.candidateIndex += 1;
      if (this.candidateIndex >= this.candidates.length) {
        this.exhausted = true;
        this.cleanupAudioOnly();
        return;
      }
      this.loadCurrentCandidate();
    };

    this.loadCurrentCandidate();
  }

  private loadCurrentCandidate(): void {
    if (!this.audio || this.stopped) return;
    const nextUrl = this.candidates[this.candidateIndex];
    if (!nextUrl) return;

    this.audio.src = nextUrl;
    this.tryPlay();
  }

  private tryPlay(): void {
    if (!this.audio || this.stopped || this.exhausted) return;
    try {
      const maybePromise = this.audio.play();
      if (maybePromise && typeof (maybePromise as Promise<void>).catch === 'function') {
        void (maybePromise as Promise<void>).catch(() => {
          // Ignore browser autoplay restrictions or missing audio files
        });
      }
    } catch {
      // Ignore synchronous playback errors
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.audio) return;

    this.audio.muted = muted;
    if (!muted && this.audio.paused && !this.stopped && !this.exhausted) {
      this.tryPlay();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  getCurrentUrl(): string | null {
    return this.audio?.src || null;
  }

  private cleanupAudioOnly(): void {
    if (!this.audio) return;
    this.audio.onerror = null;
    try {
      this.audio.pause();
    } catch {
      // Ignore cleanup errors
    }
    this.audio = null;
  }

  stop(): void {
    this.stopped = true;
    if (!this.audio) return;

    const audio = this.audio;
    this.audio = null;
    audio.onerror = null;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // Ignore cleanup errors
    }
    audio.src = '';
  }
}
