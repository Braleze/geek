/**
 * Host-0 CP-budget & WebRTC ICE/TURN utilities.
 *
 * REG.RU Host-0 shared hosting enforces an 80 CP/day compute quota and runs PHP
 * per-request (no persistent WebSocket daemon). To stay well within the CP budget:
 *  - WebRTC P2P media bypasses PHP completely once ICE/SDP handshake finishes,
 *    so HTTP polling slows down aggressively when WebRTC is live or the tab is hidden.
 *  - Optional TURN/STUN servers configured in api/config.php are merged cleanly
 *    with default public STUN servers.
 */

export const DEFAULT_ICE_SERVERS: readonly RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export type AdaptivePollAudioMode = 'idle' | 'waiting' | 'webrtc' | 'relay' | 'loopback';

export interface AdaptivePollInput {
  peerCount: number;
  audioMode: AdaptivePollAudioMode;
  negotiating: boolean;
  hidden: boolean;
  hasRecentActivity: boolean;
}

const VALID_ICE_SCHEME_RE = /^(stuns?|turns?):/i;

function normalizeUrlsField(urls: unknown): string | string[] | null {
  if (typeof urls === 'string') {
    const trimmed = urls.trim();
    return VALID_ICE_SCHEME_RE.test(trimmed) ? trimmed : null;
  }
  if (Array.isArray(urls)) {
    const cleaned: string[] = [];
    for (const item of urls) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (VALID_ICE_SCHEME_RE.test(trimmed)) {
          cleaned.push(trimmed);
        }
      }
    }
    return cleaned.length > 0 ? cleaned : null;
  }
  return null;
}

function serverSignature(server: RTCIceServer): string {
  const urlsKey = Array.isArray(server.urls)
    ? [...server.urls].sort().join(',')
    : String(server.urls);
  return `${urlsKey}|${server.username ?? ''}|${server.credential ?? ''}`;
}

/**
 * Validates and merges optional backend-provided ICE/TURN servers with the
 * built-in STUN defaults. Backend entries come first so custom TURN servers
 * configured in api/config.php take priority, and duplicates are removed.
 */
export function mergeIceServers(extra?: unknown): RTCIceServer[] {
  const merged: RTCIceServer[] = [];
  const seen = new Set<string>();

  const appendValid = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') return;
    const raw = candidate as Record<string, unknown>;
    const urls = normalizeUrlsField(raw.urls);
    if (!urls) return;

    const entry: RTCIceServer = { urls };
    if (typeof raw.username === 'string' && raw.username.trim().length > 0) {
      entry.username = raw.username.trim();
    }
    if (typeof raw.credential === 'string' && raw.credential.trim().length > 0) {
      entry.credential = raw.credential.trim();
    }

    const sig = serverSignature(entry);
    if (seen.has(sig)) return;
    seen.add(sig);
    merged.push(entry);
  };

  if (Array.isArray(extra)) {
    for (const item of extra) {
      appendValid(item);
    }
  }

  for (const fallback of DEFAULT_ICE_SERVERS) {
    appendValid(fallback);
  }

  return merged;
}

/**
 * Computes the adaptive HTTP polling interval (in milliseconds) tuned for
 * REG.RU Host-0's 80 CP/day shared-hosting budget:
 *  - Active PCM relay needs low latency (300ms foreground, 1200ms hidden).
 *  - WebRTC ICE/SDP negotiation stays snappy (550ms foreground, 1600ms hidden).
 *  - Recent chat or signal activity keeps UI responsive (900ms foreground, 2500ms hidden).
 *  - Once WebRTC P2P is connected and quiet, polling drops to 2400ms (4800ms hidden)
 *    to cut PHP/DB requests by ~70-85%.
 *  - Solo/waiting room polls calmly at 1800ms (4500ms hidden).
 */
export function computeAdaptivePollMs(input: AdaptivePollInput): number {
  const { peerCount, audioMode, negotiating, hidden, hasRecentActivity } = input;

  if (peerCount >= 2 && audioMode === 'relay') {
    return hidden ? 1200 : 300;
  }

  if (negotiating) {
    return hidden ? 1600 : 550;
  }

  if (hasRecentActivity) {
    return hidden ? 2500 : 900;
  }

  if (peerCount >= 2 && audioMode === 'webrtc') {
    return hidden ? 4800 : 2400;
  }

  return hidden ? 4500 : 1800;
}
