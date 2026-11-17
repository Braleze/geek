export const PRE_BETA_DURATION_MS = 30 * 60 * 1000;
export const PRE_BETA_MAX_PARTICIPANTS = 2;
export const PRE_BETA_MAX_MESSAGES = 80;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface PreBetaParticipant {
  peerId: string;
  clientId: string;
  nick: string;
  joinedAt: number;
  micMuted: boolean;
  hasAudio: boolean;
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
  expiresAt: number;
  participants: PreBetaParticipant[];
  messages: PreBetaChatMessage[];
}

export interface ClientQuotaRecord {
  clientId: string;
  issuedCode: string;
  createdAt: number;
  expiresAt: number;
}

export interface PreBetaStoreState {
  rooms: Record<string, PreBetaRoom>;
  quotasByClientId: Record<string, ClientQuotaRecord>;
}

export interface PublicRoomSnapshot {
  code: string;
  createdAt: number;
  expiresAt: number;
  remainingMs: number;
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
      expiresAt: number;
      remainingMs: number;
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

export function getRemainingMs(expiresAt: number, now: number): number {
  return Math.max(0, expiresAt - now);
}

export function formatCountdownMs(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
} {
  const clientId = sanitizeClientId(rawClientId);
  if (!clientId) {
    return {
      status: 'AVAILABLE',
      code: null,
      expiresAt: null,
      remainingMs: PRE_BETA_DURATION_MS,
    };
  }

  const record = store.quotasByClientId[clientId];
  if (!record) {
    return {
      status: 'AVAILABLE',
      code: null,
      expiresAt: null,
      remainingMs: PRE_BETA_DURATION_MS,
    };
  }

  const remainingMs = getRemainingMs(record.expiresAt, now);
  if (remainingMs <= 0) {
    return {
      status: 'EXHAUSTED',
      code: record.issuedCode,
      expiresAt: record.expiresAt,
      remainingMs: 0,
    };
  }

  return {
    status: 'ACTIVE',
    code: record.issuedCode,
    expiresAt: record.expiresAt,
    remainingMs,
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
    const remainingMs = getRemainingMs(existing.expiresAt, now);
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
      expiresAt: existing.expiresAt,
      remainingMs,
    };
  }

  const code = generateUniqueRoomCode(store.rooms, randomFloat);
  const expiresAt = now + PRE_BETA_DURATION_MS;

  store.quotasByClientId[clientId] = {
    clientId,
    issuedCode: code,
    createdAt: now,
    expiresAt,
  };

  store.rooms[code] = {
    code,
    hostClientId: clientId,
    createdAt: now,
    expiresAt,
    participants: [],
    messages: [
      {
        id: `sys-create-${now}`,
        authorPeerId: 'system',
        authorNick: 'PRE-BETA ЯДРО',
        text: 'Создан приватный канал 1-на-1. Таймер на 30 минут до релиза запущен.',
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
    expiresAt,
    remainingMs: PRE_BETA_DURATION_MS,
  };
}

export function buildPublicRoomSnapshot(
  room: PreBetaRoom,
  now: number = Date.now(),
): PublicRoomSnapshot {
  return {
    code: room.code,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    remainingMs: getRemainingMs(room.expiresAt, now),
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

  if (getRemainingMs(room.expiresAt, now) <= 0) {
    room.participants = [];
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
  };

  if (existingIndex >= 0) {
    room.participants[existingIndex] = peer;
  } else {
    room.participants.push(peer);
    room.messages = [
      ...room.messages,
      {
        id: `sys-join-${now}-${params.peerId}`,
        authorPeerId: 'system',
        authorNick: 'PRE-BETA ЯДРО',
        text: `${peer.nick} подключился к диалогу (${room.participants.length}/${PRE_BETA_MAX_PARTICIPANTS}).`,
        timestamp: now,
        system: true,
      },
    ].slice(-PRE_BETA_MAX_MESSAGES);
  }

  return {
    ok: true,
    peer,
    snapshot: buildPublicRoomSnapshot(room, now),
  };
}

export function leavePreBetaRoom(
  store: PreBetaStoreState,
  code: string,
  peerId: string,
  now: number = Date.now(),
): { removedPeer: PreBetaParticipant | null; snapshot: PublicRoomSnapshot | null } {
  const room = store.rooms[code];
  if (!room) {
    return { removedPeer: null, snapshot: null };
  }

  const index = room.participants.findIndex((p) => p.peerId === peerId);
  if (index === -1) {
    return { removedPeer: null, snapshot: buildPublicRoomSnapshot(room, now) };
  }

  const [removedPeer] = room.participants.splice(index, 1);
  room.messages = [
    ...room.messages,
    {
      id: `sys-leave-${now}-${peerId}`,
      authorPeerId: 'system',
      authorNick: 'PRE-BETA ЯДРО',
      text: `${removedPeer.nick} покинул диалог (${room.participants.length}/${PRE_BETA_MAX_PARTICIPANTS}).`,
      timestamp: now,
      system: true,
    },
  ].slice(-PRE_BETA_MAX_MESSAGES);

  return {
    removedPeer,
    snapshot: buildPublicRoomSnapshot(room, now),
  };
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
  if (getRemainingMs(room.expiresAt, now) <= 0) {
    room.participants = [];
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
  if (!room || getRemainingMs(room.expiresAt, now) <= 0) {
    return null;
  }
  const peer = room.participants.find((p) => p.peerId === params.peerId);
  if (!peer) {
    return null;
  }
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
    if (getRemainingMs(room.expiresAt, now) <= 0 && room.participants.length > 0) {
      const kickedPeerIds = room.participants.map((p) => p.peerId);
      room.participants = [];
      expired.push({ code: room.code, kickedPeerIds });
    }
  }
  return expired;
}

export function serializePreBetaStore(store: PreBetaStoreState): string {
  const sanitizedRooms: Record<string, PreBetaRoom> = {};
  for (const [code, room] of Object.entries(store.rooms)) {
    sanitizedRooms[code] = {
      ...room,
      // Active WebSocket participants are transient across server restarts
      participants: [],
    };
  }
  return JSON.stringify(
    {
      rooms: sanitizedRooms,
      quotasByClientId: store.quotasByClientId,
    },
    null,
    2,
  );
}

export function hydratePreBetaStore(rawJson: string): PreBetaStoreState {
  try {
    const parsed = JSON.parse(rawJson) as Partial<PreBetaStoreState>;
    const rooms: Record<string, PreBetaRoom> = {};
    if (parsed.rooms && typeof parsed.rooms === 'object') {
      for (const [code, room] of Object.entries(parsed.rooms)) {
        if (
          room &&
          typeof room.code === 'string' &&
          typeof room.hostClientId === 'string' &&
          typeof room.createdAt === 'number' &&
          typeof room.expiresAt === 'number'
        ) {
          rooms[code] = {
            code: room.code,
            hostClientId: room.hostClientId,
            createdAt: room.createdAt,
            expiresAt: room.expiresAt,
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
          typeof rec.createdAt === 'number' &&
          typeof rec.expiresAt === 'number'
        ) {
          quotasByClientId[clientId] = rec;
        }
      }
    }

    return { rooms, quotasByClientId };
  } catch {
    return createEmptyPreBetaStore();
  }
}
