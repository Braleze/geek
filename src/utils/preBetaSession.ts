export const PRE_BETA_DURATION_MS = 30 * 60 * 1000;
export const PRE_BETA_MAX_PARTICIPANTS = 2;
export const PRE_BETA_MAX_MESSAGES = 80;
export const PRE_BETA_HTTP_IDLE_MS = 18_000;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface PreBetaParticipant {
  peerId: string;
  clientId: string;
  nick: string;
  joinedAt: number;
  micMuted: boolean;
  hasAudio: boolean;
  transport?: 'ws' | 'http';
  lastSeenAt?: number;
}

export interface PreBetaChatMessage {
  id: string;
  authorPeerId: string;
  authorNick: string;
  text: string;
  timestamp: number;
  system?: boolean;
}

export interface PreBetaRoom {
  code: string;
  hostClientId: string;
  createdAt: number;
  remainingMs: number;
  timerRunningSince: number | null;
  expiresAt: number | null;
  participants: PreBetaParticipant[];
  messages: PreBetaChatMessage[];
}

export interface ClientQuotaRecord {
  clientId: string;
  issuedCode: string;
  createdAt: number;
  remainingMs: number;
  expiresAt?: number | null;
}

export interface PreBetaStoreState {
  rooms: Record<string, PreBetaRoom>;
  quotasByClientId: Record<string, ClientQuotaRecord>;
}

export interface PublicRoomSnapshot {
  code: string;
  createdAt: number;
  expiresAt: number | null;
  remainingMs: number;
  paused: boolean;
  maxParticipants: number;
  participants: Array<{
    peerId: string;
    nick: string;
    micMuted: boolean;
    hasAudio: boolean;
    isHost: boolean;
  }>;
  messages: PreBetaChatMessage[];
}

export type IssueCodeResult =
  | {
      ok: true;
      alreadyIssued: boolean;
      code: string;
      createdAt: number;
      expiresAt: number | null;
      remainingMs: number;
      paused: boolean;
    }
  | {
      ok: false;
      reason: 'INVALID_CLIENT' | 'QUOTA_EXHAUSTED';
      message: string;
      remainingMs: 0;
    };

export type JoinRoomResult =
  | {
      ok: true;
      peer: PreBetaParticipant;
      snapshot: PublicRoomSnapshot;
      resumed: boolean;
    }
  | {
      ok: false;
      reason: 'INVALID_CODE' | 'ROOM_NOT_FOUND' | 'ROOM_EXPIRED' | 'ROOM_FULL' | 'INVALID_CLIENT';
      message: string;
    };

export function createEmptyPreBetaStore(): PreBetaStoreState {
  return {
    rooms: {},
    quotasByClientId: {},
  };
}

export function normalizePreBetaCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = cleaned.startsWith('GK') ? cleaned.slice(2) : cleaned;
  if (body.length !== 8) {
    return '';
  }
  return `GK-${body.slice(0, 4)}-${body.slice(4, 8)}`;
}

export function sanitizeClientId(raw: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleaned.length < 6 || cleaned.length > 64) {
    return '';
  }
  return cleaned;
}

export function sanitizeNick(raw: string, fallback: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, 22);
  return cleaned || fallback;
}

export function generateUniqueRoomCode(
  existingRooms: Record<string, PreBetaRoom>,
  randomFloat: () => number = Math.random,
): string {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    let partA = '';
    let partB = '';
    for (let i = 0; i < 4; i += 1) {
      partA += CODE_ALPHABET[Math.floor(randomFloat() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
      partB += CODE_ALPHABET[Math.floor(randomFloat() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
    }
    const candidate = `GK-${partA}-${partB}`;
    if (!existingRooms[candidate]) {
      return candidate;
    }
  }
  throw new Error('Failed to generate unique pre-beta room code');
}

export function getRemainingMs(expiresAt: number | null, now: number): number {
  if (typeof expiresAt !== 'number') return 0;
  return Math.max(0, expiresAt - now);
}

export function getRoomRemainingMs(room: PreBetaRoom, now: number): number {
  if (room.timerRunningSince === null) {
    return Math.max(0, room.remainingMs);
  }
  const elapsed = Math.max(0, now - room.timerRunningSince);
  return Math.max(0, room.remainingMs - elapsed);
}

export function pauseRoomTimer(room: PreBetaRoom, now: number): boolean {
  const left = getRoomRemainingMs(room, now);
  room.remainingMs = left;
  room.expiresAt = null;
  if (room.timerRunningSince !== null) {
    room.timerRunningSince = null;
    return true;
  }
  return false;
}

export function resumeRoomTimer(room: PreBetaRoom, now: number): boolean {
  const left = getRoomRemainingMs(room, now);
  if (left <= 0) {
    room.remainingMs = 0;
    room.timerRunningSince = null;
    room.expiresAt = null;
    return false;
  }
  if (room.timerRunningSince === null) {
    room.remainingMs = left;
    room.timerRunningSince = now;
    room.expiresAt = now + left;
    return true;
  }
  room.expiresAt = room.timerRunningSince + room.remainingMs;
  return false;
}

export function formatCountdownMs(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function syncHostQuotaRecord(store: PreBetaStoreState, room: PreBetaRoom, now: number): void {
  const rec = store.quotasByClientId[room.hostClientId];
  if (rec) {
    const left = getRoomRemainingMs(room, now);
    rec.remainingMs = left;
    rec.expiresAt = room.timerRunningSince !== null && left > 0 ? now + left : null;
  }
}

export function getClientQuotaStatus(
  store: PreBetaStoreState,
  rawClientId: string,
  now: number = Date.now(),
): {
  status: 'AVAILABLE' | 'ACTIVE' | 'EXHAUSTED';
  code: string | null;
  expiresAt: number | null;
  remainingMs: number;
  paused: boolean;
} {
  const clientId = sanitizeClientId(rawClientId);
  if (!clientId) {
    return {
      status: 'AVAILABLE',
      code: null,
      expiresAt: null,
      remainingMs: PRE_BETA_DURATION_MS,
      paused: true,
    };
  }

  const record = store.quotasByClientId[clientId];
  if (!record) {
    return {
      status: 'AVAILABLE',
      code: null,
      expiresAt: null,
      remainingMs: PRE_BETA_DURATION_MS,
      paused: true,
    };
  }

  const room = store.rooms[record.issuedCode];
  const remainingMs = room
    ? getRoomRemainingMs(room, now)
    : Math.max(0, record.remainingMs);
  const paused = room ? room.timerRunningSince === null : true;

  if (remainingMs <= 0) {
    return {
      status: 'EXHAUSTED',
      code: record.issuedCode,
      expiresAt: null,
      remainingMs: 0,
      paused: false,
    };
  }

  return {
    status: 'ACTIVE',
    code: record.issuedCode,
    expiresAt: !paused ? now + remainingMs : null,
    remainingMs,
    paused,
  };
}

export function issueOneTimePreBetaCode(
  store: PreBetaStoreState,
  rawClientId: string,
  now: number = Date.now(),
  randomFloat: () => number = Math.random,
): IssueCodeResult {
  const clientId = sanitizeClientId(rawClientId);
  if (!clientId) {
    return {
      ok: false,
      reason: 'INVALID_CLIENT',
      message: 'Некорректный идентификатор устройства.',
      remainingMs: 0,
    };
  }

  const existing = store.quotasByClientId[clientId];
  if (existing) {
    const room = store.rooms[existing.issuedCode];
    const remainingMs = room
      ? getRoomRemainingMs(room, now)
      : Math.max(0, existing.remainingMs);
    const paused = room ? room.timerRunningSince === null : true;

    if (remainingMs <= 0) {
      return {
        ok: false,
        reason: 'QUOTA_EXHAUSTED',
        message: '30-минутный pre-beta лимит до релиза полностью исчерпан для этого устройства.',
        remainingMs: 0,
      };
    }

    return {
      ok: true,
      alreadyIssued: true,
      code: existing.issuedCode,
      createdAt: existing.createdAt,
      expiresAt: !paused ? now + remainingMs : null,
      remainingMs,
      paused,
    };
  }

  const code = generateUniqueRoomCode(store.rooms, randomFloat);

  store.quotasByClientId[clientId] = {
    clientId,
    issuedCode: code,
    createdAt: now,
    remainingMs: PRE_BETA_DURATION_MS,
    expiresAt: null,
  };

  store.rooms[code] = {
    code,
    hostClientId: clientId,
    createdAt: now,
    remainingMs: PRE_BETA_DURATION_MS,
    timerRunningSince: null,
    expiresAt: null,
    participants: [],
    messages: [
      {
        id: `sys-create-${now}`,
        authorPeerId: 'system',
        authorNick: 'PRE-BETA ЯДРО',
        text: 'Создан приватный канал 1-на-1. Лимит: 30:00 (время ставится на паузу, когда в комнате никого нет).',
        timestamp: now,
        system: true,
      },
    ],
  };

  return {
    ok: true,
    alreadyIssued: false,
    code,
    createdAt: now,
    expiresAt: null,
    remainingMs: PRE_BETA_DURATION_MS,
    paused: true,
  };
}

export function buildPublicRoomSnapshot(
  room: PreBetaRoom,
  now: number = Date.now(),
): PublicRoomSnapshot {
  const remainingMs = getRoomRemainingMs(room, now);
  const paused = room.timerRunningSince === null;
  return {
    code: room.code,
    createdAt: room.createdAt,
    expiresAt: !paused && remainingMs > 0 ? now + remainingMs : null,
    remainingMs,
    paused,
    maxParticipants: PRE_BETA_MAX_PARTICIPANTS,
    participants: room.participants.map((p) => ({
      peerId: p.peerId,
      nick: p.nick,
      micMuted: p.micMuted,
      hasAudio: p.hasAudio,
      isHost: p.clientId === room.hostClientId,
    })),
    messages: room.messages.slice(-PRE_BETA_MAX_MESSAGES),
  };
}

export function joinPreBetaRoom(
  store: PreBetaStoreState,
  params: {
    code: string;
    peerId: string;
    clientId: string;
    nick?: string;
    hasAudio?: boolean;
    transport?: 'ws' | 'http';
  },
  now: number = Date.now(),
): JoinRoomResult {
  const clientId = sanitizeClientId(params.clientId);
  if (!clientId) {
    return {
      ok: false,
      reason: 'INVALID_CLIENT',
      message: 'Некорректный идентификатор сессии клиента.',
    };
  }

  const normalizedCode = normalizePreBetaCode(params.code);
  if (!normalizedCode) {
    return {
      ok: false,
      reason: 'INVALID_CODE',
      message: 'Введите корректный код формата GK-XXXX-XXXX.',
    };
  }

  const room = store.rooms[normalizedCode];
  if (!room) {
    return {
      ok: false,
      reason: 'ROOM_NOT_FOUND',
      message: 'Комната с таким кодом не найдена.',
    };
  }

  if (getRoomRemainingMs(room, now) <= 0) {
    room.remainingMs = 0;
    room.timerRunningSince = null;
    room.expiresAt = null;
    room.participants = [];
    syncHostQuotaRecord(store, room, now);
    return {
      ok: false,
      reason: 'ROOM_EXPIRED',
      message: 'Время pre-beta сессии (30 минут) истекло до релиза.',
    };
  }

  // Replace stale connection from the exact same peerId or same clientId reconnect
  const existingIndex = room.participants.findIndex(
    (p) => p.peerId === params.peerId || p.clientId === clientId,
  );
  if (existingIndex === -1 && room.participants.length >= PRE_BETA_MAX_PARTICIPANTS) {
    return {
      ok: false,
      reason: 'ROOM_FULL',
      message: 'Комната заполнена: в одном диалоге максимум 2 участника (2/2).',
    };
  }

  const isHost = clientId === room.hostClientId;
  const fallbackNick = isHost ? 'Создатель' : 'Собеседник';
  const peer: PreBetaParticipant = {
    peerId: params.peerId,
    clientId,
    nick: sanitizeNick(params.nick ?? '', fallbackNick),
    joinedAt: now,
    micMuted: false,
    hasAudio: Boolean(params.hasAudio),
    transport: params.transport ?? 'ws',
    lastSeenAt: now,
  };

  if (existingIndex >= 0) {
    room.participants[existingIndex] = peer;
  } else {
    room.participants.push(peer);
  }

  const wasPausedWithPriorUsage =
    room.timerRunningSince === null && room.remainingMs < PRE_BETA_DURATION_MS;
  const resumed = resumeRoomTimer(room, now);
  syncHostQuotaRecord(store, room, now);

  if (existingIndex === -1) {
    const leftText = formatCountdownMs(getRoomRemainingMs(room, now));
    const resumeSuffix = wasPausedWithPriorUsage
      ? ` Таймер продолжен с ${leftText}.`
      : '';
    room.messages = [
      ...room.messages,
      {
        id: `sys-join-${now}-${params.peerId}`,
        authorPeerId: 'system',
        authorNick: 'PRE-BETA ЯДРО',
        text: `${peer.nick} подключился к диалогу (${room.participants.length}/${PRE_BETA_MAX_PARTICIPANTS}).${resumeSuffix}`,
        timestamp: now,
        system: true,
      },
    ].slice(-PRE_BETA_MAX_MESSAGES);
  }

  return {
    ok: true,
    peer,
    snapshot: buildPublicRoomSnapshot(room, now),
    resumed,
  };
}

export function leavePreBetaRoom(
  store: PreBetaStoreState,
  code: string,
  peerId: string,
  now: number = Date.now(),
): { removedPeer: PreBetaParticipant | null; snapshot: PublicRoomSnapshot | null; pausedNow: boolean } {
  const room = store.rooms[code];
  if (!room) {
    return { removedPeer: null, snapshot: null, pausedNow: false };
  }

  const index = room.participants.findIndex((p) => p.peerId === peerId);
  if (index === -1) {
    return {
      removedPeer: null,
      snapshot: buildPublicRoomSnapshot(room, now),
      pausedNow: false,
    };
  }

  const [removedPeer] = room.participants.splice(index, 1);
  let pausedNow = false;
  if (room.participants.length === 0) {
    pausedNow = pauseRoomTimer(room, now);
  }
  syncHostQuotaRecord(store, room, now);

  const leftText = formatCountdownMs(getRoomRemainingMs(room, now));
  const pauseText =
    room.participants.length === 0
      ? ` Время остановлено на ${leftText} до повторного входа.`
      : '';

  room.messages = [
    ...room.messages,
    {
      id: `sys-leave-${now}-${peerId}`,
      authorPeerId: 'system',
      authorNick: 'PRE-BETA ЯДРО',
      text: `${removedPeer.nick} вышел из диалога (${room.participants.length}/${PRE_BETA_MAX_PARTICIPANTS}).${pauseText}`,
      timestamp: now,
      system: true,
    },
  ].slice(-PRE_BETA_MAX_MESSAGES);

  return {
    removedPeer,
    snapshot: buildPublicRoomSnapshot(room, now),
    pausedNow,
  };
}

export function pruneStaleHttpParticipants(
  store: PreBetaStoreState,
  now: number = Date.now(),
  maxIdleMs: number = PRE_BETA_HTTP_IDLE_MS,
): Array<{ code: string; removedPeerIds: string[] }> {
  const results: Array<{ code: string; removedPeerIds: string[] }> = [];
  for (const room of Object.values(store.rooms)) {
    const stalePeers = room.participants.filter(
      (p) =>
        p.transport === 'http' &&
        typeof p.lastSeenAt === 'number' &&
        now - p.lastSeenAt > maxIdleMs,
    );
    if (stalePeers.length === 0) continue;
    const removedPeerIds: string[] = [];
    for (const stale of stalePeers) {
      leavePreBetaRoom(store, room.code, stale.peerId, now);
      removedPeerIds.push(stale.peerId);
    }
    results.push({ code: room.code, removedPeerIds });
  }
  return results;
}

export function appendPreBetaMessage(
  store: PreBetaStoreState,
  params: {
    code: string;
    peerId: string;
    rawText: string;
  },
  now: number = Date.now(),
):
  | { ok: true; message: PreBetaChatMessage }
  | { ok: false; reason: 'ROOM_NOT_FOUND' | 'ROOM_EXPIRED' | 'NOT_IN_ROOM' | 'EMPTY'; message: string } {
  const room = store.rooms[params.code];
  if (!room) {
    return { ok: false, reason: 'ROOM_NOT_FOUND', message: 'Комната не найдена.' };
  }
  if (getRoomRemainingMs(room, now) <= 0) {
    room.remainingMs = 0;
    room.timerRunningSince = null;
    room.expiresAt = null;
    room.participants = [];
    syncHostQuotaRecord(store, room, now);
    return {
      ok: false,
      reason: 'ROOM_EXPIRED',
      message: '30-минутный лимит pre-beta сессии истёк.',
    };
  }
  const peer = room.participants.find((p) => p.peerId === params.peerId);
  if (!peer) {
    return { ok: false, reason: 'NOT_IN_ROOM', message: 'Вы не подключены к комнате.' };
  }

  peer.lastSeenAt = now;
  const cleanText = params.rawText.trim().slice(0, 500);
  if (!cleanText) {
    return { ok: false, reason: 'EMPTY', message: 'Пустое сообщение.' };
  }

  const message: PreBetaChatMessage = {
    id: `msg-${now}-${Math.random().toString(36).slice(2, 8)}`,
    authorPeerId: peer.peerId,
    authorNick: peer.nick,
    text: cleanText,
    timestamp: now,
  };

  room.messages = [...room.messages, message].slice(-PRE_BETA_MAX_MESSAGES);
  return { ok: true, message };
}

export function updatePreBetaPeerState(
  store: PreBetaStoreState,
  params: {
    code: string;
    peerId: string;
    micMuted?: boolean;
    hasAudio?: boolean;
  },
  now: number = Date.now(),
): PublicRoomSnapshot | null {
  const room = store.rooms[params.code];
  if (!room || getRoomRemainingMs(room, now) <= 0) {
    return null;
  }
  const peer = room.participants.find((p) => p.peerId === params.peerId);
  if (!peer) {
    return null;
  }
  peer.lastSeenAt = now;
  if (typeof params.micMuted === 'boolean') {
    peer.micMuted = params.micMuted;
  }
  if (typeof params.hasAudio === 'boolean') {
    peer.hasAudio = params.hasAudio;
  }
  return buildPublicRoomSnapshot(room, now);
}

export function expireElapsedRooms(
  store: PreBetaStoreState,
  now: number = Date.now(),
): Array<{ code: string; kickedPeerIds: string[] }> {
  const expired: Array<{ code: string; kickedPeerIds: string[] }> = [];
  for (const room of Object.values(store.rooms)) {
    if (getRoomRemainingMs(room, now) <= 0 && (room.participants.length > 0 || room.timerRunningSince !== null)) {
      const kickedPeerIds = room.participants.map((p) => p.peerId);
      room.remainingMs = 0;
      room.timerRunningSince = null;
      room.expiresAt = null;
      room.participants = [];
      syncHostQuotaRecord(store, room, now);
      if (kickedPeerIds.length > 0) {
        expired.push({ code: room.code, kickedPeerIds });
      }
    }
  }
  return expired;
}

export function serializePreBetaStore(store: PreBetaStoreState, now: number = Date.now()): string {
  const sanitizedRooms: Record<string, PreBetaRoom> = {};
  const sanitizedQuotas: Record<string, ClientQuotaRecord> = {};

  for (const [code, room] of Object.entries(store.rooms)) {
    const left = getRoomRemainingMs(room, now);
    sanitizedRooms[code] = {
      ...room,
      remainingMs: left,
      // Active WebSocket participants are transient across server restarts; pause clock safely
      timerRunningSince: null,
      expiresAt: null,
      participants: [],
    };
  }

  for (const [clientId, rec] of Object.entries(store.quotasByClientId)) {
    const room = sanitizedRooms[rec.issuedCode];
    sanitizedQuotas[clientId] = {
      ...rec,
      remainingMs: room ? room.remainingMs : Math.max(0, rec.remainingMs),
      expiresAt: null,
    };
  }

  return JSON.stringify(
    {
      rooms: sanitizedRooms,
      quotasByClientId: sanitizedQuotas,
    },
    null,
    2,
  );
}

export function hydratePreBetaStore(rawJson: string, now: number = Date.now()): PreBetaStoreState {
  try {
    const parsed = JSON.parse(rawJson) as Partial<PreBetaStoreState>;
    const rooms: Record<string, PreBetaRoom> = {};
    if (parsed.rooms && typeof parsed.rooms === 'object') {
      for (const [code, room] of Object.entries(parsed.rooms)) {
        if (
          room &&
          typeof room.code === 'string' &&
          typeof room.hostClientId === 'string' &&
          typeof room.createdAt === 'number'
        ) {
          let remainingMs = PRE_BETA_DURATION_MS;
          if (typeof room.remainingMs === 'number') {
            remainingMs = Math.max(0, Math.min(PRE_BETA_DURATION_MS, room.remainingMs));
          } else if (typeof room.expiresAt === 'number') {
            remainingMs = Math.max(0, room.expiresAt - now);
          }

          rooms[code] = {
            code: room.code,
            hostClientId: room.hostClientId,
            createdAt: room.createdAt,
            remainingMs,
            timerRunningSince: null,
            expiresAt: null,
            participants: [],
            messages: Array.isArray(room.messages) ? room.messages.slice(-PRE_BETA_MAX_MESSAGES) : [],
          };
        }
      }
    }

    const quotasByClientId: Record<string, ClientQuotaRecord> = {};
    if (parsed.quotasByClientId && typeof parsed.quotasByClientId === 'object') {
      for (const [clientId, rec] of Object.entries(parsed.quotasByClientId)) {
        if (
          rec &&
          typeof rec.clientId === 'string' &&
          typeof rec.issuedCode === 'string' &&
          typeof rec.createdAt === 'number'
        ) {
          const linkedRoom = rooms[rec.issuedCode];
          const remainingMs = linkedRoom
            ? linkedRoom.remainingMs
            : typeof rec.remainingMs === 'number'
              ? Math.max(0, rec.remainingMs)
              : typeof rec.expiresAt === 'number'
                ? Math.max(0, rec.expiresAt - now)
                : PRE_BETA_DURATION_MS;
          quotasByClientId[clientId] = {
            clientId: rec.clientId,
            issuedCode: rec.issuedCode,
            createdAt: rec.createdAt,
            remainingMs,
            expiresAt: null,
          };
        }
      }
    }

    return { rooms, quotasByClientId };
  } catch {
    return createEmptyPreBetaStore();
  }
}
