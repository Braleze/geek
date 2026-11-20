export const RELAY_SAMPLE_RATE = 16000;
export const RELAY_FALLBACK_DELAY_MS = 4200;
export const RELAY_DISCONNECT_GRACE_MS = 2000;
export const RELAY_MAX_QUEUE_AHEAD_S = 0.42;
export const RELAY_HARD_RESET_AHEAD_S = 0.7;
export const RELAY_LEAD_IN_S = 0.03;

export interface ResamplerState {
  phase: number;
  prevSample: number;
}

export function createResamplerState(): ResamplerState {
  return { phase: 0, prevSample: 0 };
}

export function resampleFloat32ToInt16(
  input: Float32Array,
  fromRate: number,
  toRate: number,
  state: ResamplerState,
): { pcm: Int16Array; peak: number } {
  if (input.length === 0 || fromRate <= 0 || toRate <= 0) {
    return { pcm: new Int16Array(0), peak: 0 };
  }

  const ratio = fromRate / toRate;
  const maxOut = Math.ceil((input.length + 1) / ratio) + 1;
  const temp = new Int16Array(maxOut);
  let outCount = 0;
  let peak = 0;
  let pos = state.phase;

  while (pos < input.length) {
    let sample: number;
    if (pos < 0) {
      const frac = pos + 1;
      const s0 = state.prevSample;
      const s1 = input[0] ?? s0;
      sample = s0 + (s1 - s0) * frac;
    } else {
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = input[idx] ?? state.prevSample;
      const s1 = input[Math.min(idx + 1, input.length - 1)] ?? s0;
      sample = s0 + (s1 - s0) * frac;
    }

    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    const clamped = Math.max(-1, Math.min(1, sample));
    temp[outCount] =
      clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    outCount += 1;
    pos += ratio;
  }

  state.phase = pos - input.length;
  state.prevSample = input[input.length - 1] ?? 0;

  return {
    pcm: temp.subarray(0, outCount),
    peak,
  };
}

export function encodeInt16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function decodeBase64ToFloat32(b64: string): Float32Array<ArrayBuffer> | null {
  try {
    const binary = atob(b64);
    const len = binary.length;
    if (len < 2) return null;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const sampleCount = Math.floor(len / 2);
    const view = new DataView(bytes.buffer, 0, sampleCount * 2);
    const out = new Float32Array(new ArrayBuffer(sampleCount * 4));
    for (let i = 0; i < sampleCount; i += 1) {
      out[i] = view.getInt16(i * 2, true) / 32768;
    }
    return out;
  } catch {
    return null;
  }
}

export type PcmSlotDecision =
  | { action: 'schedule'; startAt: number; nextPlayTime: number }
  | { action: 'reset-and-schedule'; startAt: number; nextPlayTime: number }
  | { action: 'drop'; nextPlayTime: number };

/**
 * Guarantees strictly non-overlapping scheduling of PCM frames.
 * Never rewinds `nextPlayTime` onto already-playing audio without triggering `reset-and-schedule`
 * so the caller stops any active AudioBufferSourceNodes first.
 */
export function computePcmPlaybackSlot(
  now: number,
  currentNextPlayTime: number,
  bufferDuration: number,
): PcmSlotDecision {
  if (bufferDuration <= 0 || !Number.isFinite(bufferDuration)) {
    return { action: 'drop', nextPlayTime: currentNextPlayTime };
  }

  if (currentNextPlayTime <= now) {
    const startAt = now + RELAY_LEAD_IN_S;
    return {
      action: 'schedule',
      startAt,
      nextPlayTime: startAt + bufferDuration,
    };
  }

  const ahead = currentNextPlayTime - now;
  if (ahead > RELAY_HARD_RESET_AHEAD_S) {
    const startAt = now + RELAY_LEAD_IN_S;
    return {
      action: 'reset-and-schedule',
      startAt,
      nextPlayTime: startAt + bufferDuration,
    };
  }

  if (ahead > RELAY_MAX_QUEUE_AHEAD_S) {
    return {
      action: 'drop',
      nextPlayTime: currentNextPlayTime,
    };
  }

  return {
    action: 'schedule',
    startAt: currentNextPlayTime,
    nextPlayTime: currentNextPlayTime + bufferDuration,
  };
}

export function isWebRtcAudioLive(
  pc: Pick<RTCPeerConnection, 'connectionState' | 'iceConnectionState'> | null | undefined,
  webrtcTrackReceived: boolean,
): boolean {
  if (!pc || !webrtcTrackReceived) return false;
  return (
    pc.connectionState === 'connected' ||
    pc.iceConnectionState === 'connected' ||
    pc.iceConnectionState === 'completed'
  );
}
