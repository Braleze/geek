import {
  PRE_BETA_DURATION_MS,
  appendPreBetaMessage,
  buildPublicRoomSnapshot,
  createEmptyPreBetaStore,
  expireElapsedRooms,
  getClientQuotaStatus,
  hydratePreBetaStore,
  issueOneTimePreBetaCode,
  joinPreBetaRoom,
  leavePreBetaRoom,
  normalizePreBetaCode,
  serializePreBetaStore,
  updatePreBetaPeerState,
  type PreBetaStoreState,
  type PublicRoomSnapshot,
} from './preBetaSession';

export type PreBetaTransportKind = 'node-ws' | 'node-http' | 'php-http' | 'local';

export interface QuotaResponse {
  ok: boolean;
  status: 'AVAILABLE' | 'ACTIVE' | 'EXHAUSTED';
  code: string | null;
  expiresAt: number | null;
  remainingMs: number;
  paused: boolean;
  transport: PreBetaTransportKind;
}

export interface QueuedSignal {
  signalType: 'initiate' | 'offer' | 'answer' | 'ice';
  fromPeerId: string;
  payload: unknown;
}

const LOCAL_STORE_KEY = 'geek_prebeta_local_store_v2';
const LOCAL_SIGNALS_KEY = 'geek_prebeta_local_signals_v2';
const LOCAL_CHANNEL_NAME = 'geek_prebeta_ipc_v2';

async function fetchJsonSafe(
  url: string,
  init?: RequestInit,
  timeoutMs: number = 5000,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const ct = res.headers.get('content-type') || '';
    if (!ct.toLowerCase().includes('application/json')) {
      return { ok: false, status: res.status, data: null };
    }
    const parsed = (await res.json()) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data: parsed };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function probePreBetaBackend(clientId: string): Promise<QuotaResponse> {
  // 1. Try Node Express server (./api/prebeta/status)
  const nodeRes = await fetchJsonSafe(
    `./api/prebeta/status?clientId=${encodeURIComponent(clientId)}`,
  );
  if (nodeRes.ok && nodeRes.data && nodeRes.data.ok === true) {
    return {
      ok: true,
      status: (nodeRes.data.status as QuotaResponse['status']) ?? 'AVAILABLE',
      code: (nodeRes.data.code as string | null) ?? null,
      expiresAt: (nodeRes.data.expiresAt as number | null) ?? null,
      remainingMs:
        typeof nodeRes.data.remainingMs === 'number'
          ? nodeRes.data.remainingMs
          : PRE_BETA_DURATION_MS,
      paused: typeof nodeRes.data.paused === 'boolean' ? nodeRes.data.paused : true,
      transport: 'node-ws',
    };
  }

  // 2. Try PHP endpoint (./api/prebeta.php?action=status)
  const phpRes = await fetchJsonSafe(
    `./api/prebeta.php?action=status&clientId=${encodeURIComponent(clientId)}`,
  );
  if (phpRes.ok && phpRes.data && phpRes.data.ok === true) {
    return {
      ok: true,
      status: (phpRes.data.status as QuotaResponse['status']) ?? 'AVAILABLE',
      code: (phpRes.data.code as string | null) ?? null,
      expiresAt: (phpRes.data.expiresAt as number | null) ?? null,
      remainingMs:
        typeof phpRes.data.remainingMs === 'number'
          ? phpRes.data.remainingMs
          : PRE_BETA_DURATION_MS,
      paused: typeof phpRes.data.paused === 'boolean' ? phpRes.data.paused : true,
      transport: 'php-http',
    };
  }

  // 3. Fallback: local browser BroadcastChannel + localStorage (same-browser multi-tab)
  const store = readLocalStore();
  const st = getClientQuotaStatus(store, clientId, Date.now());
  return {
    ok: true,
    status: st.status,
    code: st.code,
    expiresAt: st.expiresAt,
    remainingMs: st.remainingMs,
    paused: st.paused,
    transport: 'local',
  };
}

// --- Local BroadcastChannel + localStorage helpers (used only when no Node/PHP server is present) ---

function readLocalStore(): PreBetaStoreState {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORE_KEY);
    if (!raw) return createEmptyPreBetaStore();
    const parsed = JSON.parse(raw) as Partial<PreBetaStoreState>;
    const hydrated = hydratePreBetaStore(raw);
    // Preserve live timerRunningSince & active participants across same-browser tabs
    if (parsed.rooms) {
      for (const [code, room] of Object.entries(parsed.rooms)) {
        if (hydrated.rooms[code] && room) {
          hydrated.rooms[code].timerRunningSince =
            typeof room.timerRunningSince === 'number' ? room.timerRunningSince : null;
          hydrated.rooms[code].remainingMs =
            typeof room.remainingMs === 'number'
              ? room.remainingMs
              : hydrated.rooms[code].remainingMs;
          hydrated.rooms[code].participants = Array.isArray(room.participants)
            ? room.participants
            : [];
        }
      }
    }
    return hydrated;
  } catch {
    return createEmptyPreBetaStore();
  }
}

function writeLocalStore(store: PreBetaStoreState): void {
  try {
    const payload = {
      rooms: store.rooms,
      quotasByClientId: store.quotasByClientId,
    };
    window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

function broadcastLocalPing(type: string, code?: string): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(LOCAL_CHANNEL_NAME);
      ch.postMessage({ type, code: code ?? null, ts: Date.now() });
      ch.close();
    }
  } catch {
    // Ignore if BroadcastChannel unsupported
  }
}

export function subscribeLocalIpc(onEvent: () => void): () => void {
  let ch: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      ch = new BroadcastChannel(LOCAL_CHANNEL_NAME);
      ch.onmessage = () => onEvent();
    }
  } catch {
    ch = null;
  }
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === LOCAL_STORE_KEY || ev.key === LOCAL_SIGNALS_KEY) {
      onEvent();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('storage', onStorage);
    if (ch) {
      ch.close();
    }
  };
}

function readLocalSignalsMap(): Record<string, QueuedSignal[]> {
  try {
    const raw = window.localStorage.getItem(LOCAL_SIGNALS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, QueuedSignal[]>) : {};
  } catch {
    return {};
  }
}

function enqueueLocalSignal(toPeerId: string, signal: QueuedSignal): void {
  const map = readLocalSignalsMap();
  const list = map[toPeerId] ?? [];
  list.push(signal);
  map[toPeerId] = list.slice(-32);
  try {
    window.localStorage.setItem(LOCAL_SIGNALS_KEY, JSON.stringify(map));
  } catch {
    // Ignore
  }
}

function popLocalSignals(peerId: string): QueuedSignal[] {
  const map = readLocalSignalsMap();
  const list = map[peerId] ?? [];
  if (list.length > 0) {
    delete map[peerId];
    try {
      window.localStorage.setItem(LOCAL_SIGNALS_KEY, JSON.stringify(map));
    } catch {
      // Ignore
    }
  }
  return list;
}

export const localPreBetaApi = {
  issue(clientId: string) {
    const store = readLocalStore();
    const res = issueOneTimePreBetaCode(store, clientId, Date.now());
    writeLocalStore(store);
    broadcastLocalPing('store:update');
    return res;
  },
  join(params: { code: string; peerId: string; clientId: string; nick: string; hasAudio: boolean }) {
    const store = readLocalStore();
    const res = joinPreBetaRoom(store, { ...params, transport: 'http' }, Date.now());
    if (res.ok && res.snapshot.participants.length === 2) {
      const [first, second] = res.snapshot.participants;
      enqueueLocalSignal(first.peerId, {
        signalType: 'initiate',
        fromPeerId: second.peerId,
        payload: { targetPeerId: second.peerId },
      });
    }
    writeLocalStore(store);
    broadcastLocalPing('room:update', params.code);
    return res;
  },
  poll(code: string, peerId: string): { ok: boolean; snapshot?: PublicRoomSnapshot; signals: QueuedSignal[]; reason?: string; message?: string } {
    const store = readLocalStore();
    const now = Date.now();
    const normalized = normalizePreBetaCode(code);
    const room = store.rooms[normalized];
    if (!room) {
      return { ok: false, signals: [], reason: 'ROOM_NOT_FOUND', message: 'Комната не найдена.' };
    }
    const expired = expireElapsedRooms(store, now);
    const peer = room.participants.find((p) => p.peerId === peerId);
    if (expired.some((e) => e.code === normalized)) {
      writeLocalStore(store);
      return { ok: false, signals: [], reason: 'ROOM_EXPIRED', message: '30-минутный pre-beta лимит до релиза истёк.' };
    }
    if (!peer) {
      return { ok: false, signals: [], reason: 'NOT_IN_ROOM', message: 'Сессия участника завершена.' };
    }
    peer.lastSeenAt = now;
    writeLocalStore(store);
    return {
      ok: true,
      snapshot: buildPublicRoomSnapshot(room, now),
      signals: popLocalSignals(peerId),
    };
  },
  send(code: string, peerId: string, text: string) {
    const store = readLocalStore();
    const res = appendPreBetaMessage(store, { code: normalizePreBetaCode(code), peerId, rawText: text }, Date.now());
    writeLocalStore(store);
    broadcastLocalPing('room:update', code);
    return res;
  },
  leave(code: string, peerId: string) {
    const store = readLocalStore();
    const res = leavePreBetaRoom(store, normalizePreBetaCode(code), peerId, Date.now());
    writeLocalStore(store);
    broadcastLocalPing('room:update', code);
    return res;
  },
  updatePeer(code: string, peerId: string, micMuted?: boolean, hasAudio?: boolean) {
    const store = readLocalStore();
    const snap = updatePreBetaPeerState(store, { code: normalizePreBetaCode(code), peerId, micMuted, hasAudio }, Date.now());
    writeLocalStore(store);
    broadcastLocalPing('room:update', code);
    return snap;
  },
  signal(code: string, peerId: string, signalType: 'offer' | 'answer' | 'ice', payload: unknown) {
    const store = readLocalStore();
    const room = store.rooms[normalizePreBetaCode(code)];
    if (!room) return;
    for (const p of room.participants) {
      if (p.peerId !== peerId) {
        enqueueLocalSignal(p.peerId, { signalType, fromPeerId: peerId, payload });
      }
    }
    broadcastLocalPing('signal:update', code);
  },
  serializeSnapshotForSafety() {
    return serializePreBetaStore(readLocalStore());
  },
};

export function httpApiUrls(transport: PreBetaTransportKind) {
  if (transport === 'php-http') {
    return {
      status: (clientId: string) => `./api/prebeta.php?action=status&clientId=${encodeURIComponent(clientId)}`,
      issue: './api/prebeta.php?action=issue',
      join: './api/prebeta.php?action=join',
      poll: './api/prebeta.php?action=poll',
      send: './api/prebeta.php?action=send',
      leave: './api/prebeta.php?action=leave',
      peer: './api/prebeta.php?action=peer',
      signal: './api/prebeta.php?action=signal',
    };
  }
  return {
    status: (clientId: string) => `./api/prebeta/status?clientId=${encodeURIComponent(clientId)}`,
    issue: './api/prebeta/issue',
    join: './api/prebeta/join',
    poll: './api/prebeta/poll',
    send: './api/prebeta/send',
    leave: './api/prebeta/leave',
    peer: './api/prebeta/peer',
    signal: './api/prebeta/signal',
  };
}
