export const LIVE_VOICE_MAX_PARTICIPANTS = 8;
export const LIVE_VOICE_HTTP_STALE_MS = 30_000;

export interface LiveVoicePeer {
  peerId: string;
  nick: string;
  initials: string;
  avatarColor: string;
  micMuted: boolean;
  deafened: boolean;
  hasAudio: boolean;
  camActive: boolean;
  screenActive: boolean;
  speaking: boolean;
  transport: 'ws' | 'http';
  joinedAt: number;
  lastSeenAt: number;
}

export interface LiveVoicePublicPeer {
  peerId: string;
  nick: string;
  initials: string;
  avatarColor: string;
  micMuted: boolean;
  deafened: boolean;
  hasAudio: boolean;
  camActive: boolean;
  screenActive: boolean;
  speaking: boolean;
}

const AVATAR_PALETTE = [
  '#00f0ff',
  '#ff2a85',
  '#3b82f6',
  '#10b981',
  '#b829ff',
  '#f59e0b',
];

export function sanitizeLiveVoiceNick(rawNick: unknown, fallbackIndex: number): string {
  const cleaned = String(rawNick ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 22);
  return cleaned || `Участник-${fallbackIndex}`;
}

export function computeLiveVoiceInitials(nick: string): string {
  const parts = nick
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-zА-Яа-яЁё0-9]/g, ''))
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase().slice(0, 2) || 'ГК';
  }
  return nick.replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').slice(0, 2).toUpperCase() || 'ГК';
}

export function pickLiveVoiceColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function toPublicLiveVoicePeer(peer: LiveVoicePeer): LiveVoicePublicPeer {
  return {
    peerId: peer.peerId,
    nick: peer.nick,
    initials: peer.initials,
    avatarColor: peer.avatarColor,
    micMuted: peer.micMuted,
    deafened: peer.deafened,
    hasAudio: peer.hasAudio,
    camActive: peer.camActive,
    screenActive: peer.screenActive,
    speaking: peer.speaking && !peer.micMuted && !peer.deafened,
  };
}

export function buildLiveVoiceSnapshot(peers: Map<string, LiveVoicePeer>): LiveVoicePublicPeer[] {
  return Array.from(peers.values())
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(toPublicLiveVoicePeer);
}

export function joinLiveVoiceRoom(
  peers: Map<string, LiveVoicePeer>,
  input: {
    peerId: string;
    nick?: unknown;
    hasAudio?: boolean;
    micMuted?: boolean;
    deafened?: boolean;
    camActive?: boolean;
    screenActive?: boolean;
    transport?: 'ws' | 'http';
  },
  now: number = Date.now(),
):
  | { ok: true; peer: LiveVoicePeer; snapshot: LiveVoicePublicPeer[] }
  | { ok: false; reason: 'ROOM_FULL'; message: string } {
  const existing = peers.get(input.peerId);
  if (!existing && peers.size >= LIVE_VOICE_MAX_PARTICIPANTS) {
    return {
      ok: false,
      reason: 'ROOM_FULL',
      message: `В тестовом голосовом канале уже максимум (${LIVE_VOICE_MAX_PARTICIPANTS}) участников.`,
    };
  }

  const nick = sanitizeLiveVoiceNick(input.nick, peers.size + 1);
  const peer: LiveVoicePeer = {
    peerId: input.peerId,
    nick,
    initials: computeLiveVoiceInitials(nick),
    avatarColor: existing?.avatarColor ?? pickLiveVoiceColor(input.peerId),
    micMuted: Boolean(input.micMuted),
    deafened: Boolean(input.deafened),
    hasAudio: Boolean(input.hasAudio),
    camActive: Boolean(input.camActive),
    screenActive: Boolean(input.screenActive),
    speaking: false,
    transport: input.transport === 'http' ? 'http' : 'ws',
    joinedAt: existing?.joinedAt ?? now,
    lastSeenAt: now,
  };

  peers.set(input.peerId, peer);
  return {
    ok: true,
    peer,
    snapshot: buildLiveVoiceSnapshot(peers),
  };
}

export function updateLiveVoicePeer(
  peers: Map<string, LiveVoicePeer>,
  peerId: string,
  patch: {
    nick?: string;
    micMuted?: boolean;
    deafened?: boolean;
    hasAudio?: boolean;
    camActive?: boolean;
    screenActive?: boolean;
    speaking?: boolean;
  },
  now: number = Date.now(),
): LiveVoicePublicPeer[] | null {
  const peer = peers.get(peerId);
  if (!peer) return null;

  if (typeof patch.nick === 'string') {
    const nextNick = sanitizeLiveVoiceNick(patch.nick, 1);
    peer.nick = nextNick;
    peer.initials = computeLiveVoiceInitials(nextNick);
  }
  if (typeof patch.micMuted === 'boolean') peer.micMuted = patch.micMuted;
  if (typeof patch.deafened === 'boolean') peer.deafened = patch.deafened;
  if (typeof patch.hasAudio === 'boolean') peer.hasAudio = patch.hasAudio;
  if (typeof patch.camActive === 'boolean') peer.camActive = patch.camActive;
  if (typeof patch.screenActive === 'boolean') peer.screenActive = patch.screenActive;
  if (typeof patch.speaking === 'boolean') peer.speaking = patch.speaking;
  peer.lastSeenAt = now;

  return buildLiveVoiceSnapshot(peers);
}

export function leaveLiveVoiceRoom(
  peers: Map<string, LiveVoicePeer>,
  peerId: string,
): { removedPeer: LiveVoicePeer | null; snapshot: LiveVoicePublicPeer[] } {
  const existing = peers.get(peerId) ?? null;
  if (existing) {
    peers.delete(peerId);
  }
  return {
    removedPeer: existing,
    snapshot: buildLiveVoiceSnapshot(peers),
  };
}

export function pruneStaleLiveVoicePeers(
  peers: Map<string, LiveVoicePeer>,
  now: number = Date.now(),
  staleMs: number = LIVE_VOICE_HTTP_STALE_MS,
): string[] {
  const removed: string[] = [];
  for (const [peerId, peer] of peers.entries()) {
    if (peer.transport === 'http' && now - peer.lastSeenAt > staleMs) {
      peers.delete(peerId);
      removed.push(peerId);
    }
  }
  return removed;
}

export function shouldInitiateRtcMesh(myPeerId: string, remotePeerId: string): boolean {
  return myPeerId !== remotePeerId && myPeerId < remotePeerId;
}

export function filterActiveRemoteVideos<T extends { peerId: string }>(
  entries: Iterable<T>,
  peers: readonly LiveVoicePublicPeer[],
): T[] {
  const activeVideoPeerIds = new Set<string>();
  for (const peer of peers) {
    if (peer.camActive || peer.screenActive) {
      activeVideoPeerIds.add(peer.peerId);
    }
  }
  const active: T[] = [];
  for (const entry of entries) {
    if (activeVideoPeerIds.has(entry.peerId)) {
      active.push(entry);
    }
  }
  return active;
}
