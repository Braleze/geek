import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  generateLivePreviewPeerReply,
  isPreviewGeminiConfigured,
} from './src/utils/previewGeminiService.ts';
import {
  PRE_BETA_MAX_PARTICIPANTS,
  appendPreBetaMessage,
  buildPublicRoomSnapshot,
  createEmptyPreBetaStore,
  expireElapsedRooms,
  getClientQuotaStatus,
  getClientRoomRemainingMs,
  getRoomRemainingMs,
  hydratePreBetaStore,
  isClientTimerPaused,
  issueOneTimePreBetaCode,
  joinPreBetaRoom,
  leavePreBetaRoom,
  normalizePreBetaCode,
  pruneStaleHttpParticipants,
  sanitizeClientId,
  serializePreBetaStore,
  updatePreBetaPeerState,
  type PreBetaStoreState,
} from './src/utils/preBetaSession.ts';

const PORT = Number(process.env.PORT) || 3000;
const STATE_FILE = path.resolve(process.cwd(), '.prebeta-state.json');

function loadStore(): PreBetaStoreState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return hydratePreBetaStore(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {
    // Fall back to fresh store if corrupted
  }
  return createEmptyPreBetaStore();
}

const store: PreBetaStoreState = loadStore();

function saveStore(): void {
  try {
    fs.writeFileSync(STATE_FILE, serializePreBetaStore(store), 'utf8');
  } catch {
    // Best-effort disk persistence
  }
}

interface ActiveSocketMeta {
  ws: WebSocket;
  peerId: string;
  roomCode: string | null;
}

interface QueuedRtcSignal {
  signalType: 'initiate' | 'offer' | 'answer' | 'ice' | 'audio';
  fromPeerId: string;
  payload: unknown;
}

const socketsByPeerId = new Map<string, ActiveSocketMeta>();
const pendingSignalsByPeerId = new Map<string, QueuedRtcSignal[]>();

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function enqueueHttpSignal(toPeerId: string, signal: QueuedRtcSignal): void {
  const existing = pendingSignalsByPeerId.get(toPeerId) ?? [];
  existing.push(signal);
  if (existing.length > 96) {
    // Keep critical signaling packets (initiate/offer/answer/ice) and trim oldest audio frames first
    const trimmed: QueuedRtcSignal[] = [];
    let audioDropped = 0;
    const toDrop = existing.length - 96;
    for (const item of existing) {
      if (item.signalType === 'audio' && audioDropped < toDrop) {
        audioDropped += 1;
      } else {
        trimmed.push(item);
      }
    }
    pendingSignalsByPeerId.set(toPeerId, trimmed.slice(-96));
    return;
  }
  pendingSignalsByPeerId.set(toPeerId, existing);
}

function deliverRtcInitiate(firstPeerId: string, secondPeerId: string): void {
  const firstMeta = socketsByPeerId.get(firstPeerId);
  if (firstMeta && firstMeta.ws.readyState === WebSocket.OPEN) {
    sendJson(firstMeta.ws, {
      type: 'rtc:initiate',
      targetPeerId: secondPeerId,
    });
  } else {
    enqueueHttpSignal(firstPeerId, {
      signalType: 'initiate',
      fromPeerId: secondPeerId,
      payload: { targetPeerId: secondPeerId },
    });
  }
}

function deliverRtcSignal(
  roomCode: string,
  fromPeerId: string,
  signalType: 'offer' | 'answer' | 'ice' | 'audio',
  payload: unknown,
): void {
  const room = store.rooms[roomCode];
  if (!room) return;
  for (const participant of room.participants) {
    if (participant.peerId === fromPeerId) continue;
    const meta = socketsByPeerId.get(participant.peerId);
    if (meta && meta.ws.readyState === WebSocket.OPEN) {
      if (signalType === 'audio' && payload && typeof payload === 'object') {
        const p = payload as { sr?: unknown; data?: unknown };
        sendJson(meta.ws, {
          type: 'audio:frame',
          fromPeerId,
          sr: typeof p.sr === 'number' ? p.sr : 16000,
          data: typeof p.data === 'string' ? p.data : '',
        });
      } else {
        sendJson(meta.ws, {
          type: 'rtc:signal',
          fromPeerId,
          signalType,
          payload: payload ?? null,
        });
      }
    } else {
      enqueueHttpSignal(participant.peerId, {
        signalType,
        fromPeerId,
        payload: payload ?? null,
      });
    }
  }
}

function broadcastToRoom(
  roomCode: string,
  payload: Record<string, unknown>,
  excludePeerId?: string,
): void {
  const room = store.rooms[roomCode];
  if (!room) return;
  for (const participant of room.participants) {
    if (excludePeerId && participant.peerId === excludePeerId) continue;
    const meta = socketsByPeerId.get(participant.peerId);
    if (meta) {
      sendJson(meta.ws, payload);
    }
  }
}

function broadcastRoomState(
  roomCode: string,
  excludePeerId?: string,
  now: number = Date.now(),
): void {
  const room = store.rooms[roomCode];
  if (!room) return;
  for (const participant of room.participants) {
    if (excludePeerId && participant.peerId === excludePeerId) continue;
    const meta = socketsByPeerId.get(participant.peerId);
    if (meta) {
      sendJson(meta.ws, {
        type: 'room:state',
        snapshot: buildPublicRoomSnapshot(room, now, participant.clientId),
      });
    }
  }
}

function detachPeerFromCurrentRoom(meta: ActiveSocketMeta): void {
  if (!meta.roomCode) return;
  const code = meta.roomCode;
  meta.roomCode = null;
  pendingSignalsByPeerId.delete(meta.peerId);
  const now = Date.now();
  const { removedPeer, snapshot } = leavePreBetaRoom(store, code, meta.peerId, now);
  if (removedPeer && snapshot) {
    broadcastToRoom(code, { type: 'peer:left', peerId: meta.peerId, nick: removedPeer.nick });
    broadcastRoomState(code, undefined, now);
  }
}

function parseBodyObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore invalid text payload
    }
  }
  return {};
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '128kb' }));
  app.use(express.text({ type: 'text/plain', limit: '128kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/preview/status', (_req, res) => {
    res.json({
      ok: true,
      liveEnabled: isPreviewGeminiConfigured(),
    });
  });

  app.post('/api/preview/reply', async (req, res) => {
    const body = parseBodyObj(req.body);
    const result = await generateLivePreviewPeerReply({
      question: body.question,
      serverId: body.serverId,
      channelId: body.channelId,
      history: body.history,
    });
    if (!result.ok) {
      res.status(result.status).json({
        ok: false,
        reason: result.reason,
        error: result.message,
      });
      return;
    }
    res.json({
      ok: true,
      reply: result.reply,
    });
  });

  app.get('/api/prebeta/status', (req, res) => {
    const rawClientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
    const status = getClientQuotaStatus(store, rawClientId, Date.now());
    res.json({ ok: true, ...status });
  });

  app.post('/api/prebeta/issue', (req, res) => {
    const body = parseBodyObj(req.body);
    const rawClientId = typeof body.clientId === 'string' ? body.clientId : '';
    const result = issueOneTimePreBetaCode(store, rawClientId, Date.now());
    saveStore();

    if (!result.ok) {
      const code = result.reason === 'QUOTA_EXHAUSTED' ? 403 : 400;
      res.status(code).json(result);
      return;
    }

    res.json(result);
  });

  app.get('/api/prebeta/room/:code', (req, res) => {
    const normalized = normalizePreBetaCode(req.params.code || '');
    if (!normalized) {
      res.status(400).json({ ok: false, message: 'Неверный формат кода.' });
      return;
    }
    const room = store.rooms[normalized];
    if (!room) {
      res.status(404).json({ ok: false, message: 'Комната не найдена.' });
      return;
    }
    const rawCid = typeof req.query.clientId === 'string' ? sanitizeClientId(req.query.clientId) : '';
    const now = Date.now();
    const remainingMs = rawCid
      ? getClientRoomRemainingMs(room, rawCid, now)
      : getRoomRemainingMs(room, now);
    const paused = rawCid
      ? isClientTimerPaused(room, rawCid)
      : isClientTimerPaused(room, room.hostClientId);
    res.json({
      ok: true,
      code: room.code,
      remainingMs,
      paused,
      expired: remainingMs <= 0,
      participantsCount: room.participants.length,
      maxParticipants: PRE_BETA_MAX_PARTICIPANTS,
    });
  });

  // HTTP polling fallback endpoints (work identically behind proxies without WS upgrade)
  app.post('/api/prebeta/join', (req, res) => {
    const body = parseBodyObj(req.body);
    const now = Date.now();
    const peerId =
      typeof body.peerId === 'string' && body.peerId.trim().length >= 8
        ? body.peerId.trim().slice(0, 64)
        : crypto.randomUUID();
    const joinResult = joinPreBetaRoom(
      store,
      {
        code: typeof body.code === 'string' ? body.code : '',
        peerId,
        clientId: typeof body.clientId === 'string' ? body.clientId : '',
        nick: typeof body.nick === 'string' ? body.nick : '',
        hasAudio: Boolean(body.hasAudio),
        transport: 'http',
      },
      now,
    );

    if (!joinResult.ok) {
      const statusCode =
        joinResult.reason === 'ROOM_NOT_FOUND'
          ? 404
          : joinResult.reason === 'ROOM_FULL' || joinResult.reason === 'ROOM_EXPIRED'
            ? 409
            : 400;
      res.status(statusCode).json(joinResult);
      return;
    }

    saveStore();
    broadcastRoomState(joinResult.snapshot.code, peerId, now);

    if (joinResult.snapshot.participants.length === 2) {
      const [firstPeer, secondPeer] = joinResult.snapshot.participants;
      deliverRtcInitiate(firstPeer.peerId, secondPeer.peerId);
    }

    res.json({
      ok: true,
      peerId,
      snapshot: joinResult.snapshot,
    });
  });

  app.post('/api/prebeta/poll', (req, res) => {
    const body = parseBodyObj(req.body);
    const code = normalizePreBetaCode(typeof body.code === 'string' ? body.code : '');
    const peerId = typeof body.peerId === 'string' ? body.peerId : '';
    const now = Date.now();

    if (!code || !peerId) {
      res.status(400).json({ ok: false, reason: 'INVALID_PARAMS', message: 'Неверные параметры.' });
      return;
    }

    const room = store.rooms[code];
    if (!room) {
      res.status(404).json({ ok: false, reason: 'ROOM_NOT_FOUND', message: 'Комната не найдена.' });
      return;
    }

    const peer = room.participants.find((p) => p.peerId === peerId);
    if (!peer) {
      res.status(409).json({ ok: false, reason: 'NOT_IN_ROOM', message: 'Сессия участника завершена.' });
      return;
    }

    const remainingMs = getClientRoomRemainingMs(room, peer.clientId, now);
    if (remainingMs <= 0) {
      expireElapsedRooms(store, now);
      saveStore();
      res.status(410).json({
        ok: false,
        reason: 'ROOM_EXPIRED',
        message: '30-минутный pre-beta лимит до релиза истёк. Связь завершена.',
      });
      return;
    }

    peer.lastSeenAt = now;
    const signals = pendingSignalsByPeerId.get(peerId) ?? [];
    if (signals.length > 0) {
      pendingSignalsByPeerId.delete(peerId);
    }

    res.json({
      ok: true,
      snapshot: buildPublicRoomSnapshot(room, now, peer.clientId),
      signals,
    });
  });

  app.post('/api/prebeta/send', (req, res) => {
    const body = parseBodyObj(req.body);
    const code = normalizePreBetaCode(typeof body.code === 'string' ? body.code : '');
    const peerId = typeof body.peerId === 'string' ? body.peerId : '';
    const text = typeof body.text === 'string' ? body.text : '';
    const now = Date.now();

    const chatResult = appendPreBetaMessage(store, { code, peerId, rawText: text }, now);
    if (!chatResult.ok) {
      const statusCode = chatResult.reason === 'ROOM_EXPIRED' ? 410 : 400;
      res.status(statusCode).json(chatResult);
      return;
    }

    saveStore();
    broadcastToRoom(code, { type: 'chat:message', message: chatResult.message });
    res.json({ ok: true, message: chatResult.message });
  });

  app.post('/api/prebeta/leave', (req, res) => {
    const body = parseBodyObj(req.body);
    const code = normalizePreBetaCode(typeof body.code === 'string' ? body.code : '');
    const peerId = typeof body.peerId === 'string' ? body.peerId : '';
    const now = Date.now();

    if (!code || !peerId) {
      res.json({ ok: true });
      return;
    }

    pendingSignalsByPeerId.delete(peerId);
    const { removedPeer, snapshot } = leavePreBetaRoom(store, code, peerId, now);
    saveStore();

    if (removedPeer && snapshot) {
      broadcastToRoom(code, { type: 'peer:left', peerId, nick: removedPeer.nick });
      broadcastRoomState(code, undefined, now);
    }
    res.json({ ok: true, snapshot });
  });

  app.post('/api/prebeta/peer', (req, res) => {
    const body = parseBodyObj(req.body);
    const code = normalizePreBetaCode(typeof body.code === 'string' ? body.code : '');
    const peerId = typeof body.peerId === 'string' ? body.peerId : '';
    const now = Date.now();
    const snapshot = updatePreBetaPeerState(
      store,
      {
        code,
        peerId,
        micMuted: typeof body.micMuted === 'boolean' ? body.micMuted : undefined,
        hasAudio: typeof body.hasAudio === 'boolean' ? body.hasAudio : undefined,
      },
      now,
    );
    if (snapshot) {
      broadcastRoomState(code, undefined, now);
    }
    res.json({ ok: Boolean(snapshot), snapshot });
  });

  app.post('/api/prebeta/signal', (req, res) => {
    const body = parseBodyObj(req.body);
    const code = normalizePreBetaCode(typeof body.code === 'string' ? body.code : '');
    const peerId = typeof body.peerId === 'string' ? body.peerId : '';
    const signalType = typeof body.signalType === 'string' ? body.signalType : '';
    const now = Date.now();

    const room = store.rooms[code];
    const sender = room?.participants.find((p) => p.peerId === peerId);
    if (!room || !sender || getClientRoomRemainingMs(room, sender.clientId, now) <= 0) {
      res.status(410).json({ ok: false, reason: 'ROOM_EXPIRED', message: 'Время сессии истекло.' });
      return;
    }
    if (signalType !== 'offer' && signalType !== 'answer' && signalType !== 'ice' && signalType !== 'audio') {
      res.status(400).json({ ok: false, reason: 'BAD_SIGNAL' });
      return;
    }
    if (signalType === 'audio') {
      const p = body.payload as { sr?: unknown; data?: unknown } | null;
      if (!p || typeof p.data !== 'string' || p.data.length === 0 || p.data.length > 32768) {
        res.status(400).json({ ok: false, reason: 'BAD_AUDIO_FRAME' });
        return;
      }
      deliverRtcSignal(code, peerId, 'audio', {
        sr: typeof p.sr === 'number' && p.sr >= 8000 && p.sr <= 48000 ? p.sr : 16000,
        data: p.data,
      });
      res.json({ ok: true });
      return;
    }
    deliverRtcSignal(code, peerId, signalType, body.payload ?? null);
    res.json({ ok: true });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/prebeta' });

  wss.on('connection', (ws) => {
    const peerId = crypto.randomUUID();
    const meta: ActiveSocketMeta = {
      ws,
      peerId,
      roomCode: null,
    };
    socketsByPeerId.set(peerId, meta);
    sendJson(ws, { type: 'ws:welcome', peerId });

    ws.on('message', (rawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(rawData)) as Record<string, unknown>;
      } catch {
        sendJson(ws, { type: 'room:error', reason: 'BAD_JSON', message: 'Неверный формат пакета.' });
        return;
      }

      const type = typeof msg.type === 'string' ? msg.type : '';
      const now = Date.now();

      if (type === 'room:join') {
        detachPeerFromCurrentRoom(meta);

        const joinResult = joinPreBetaRoom(
          store,
          {
            code: typeof msg.code === 'string' ? msg.code : '',
            peerId,
            clientId: typeof msg.clientId === 'string' ? msg.clientId : '',
            nick: typeof msg.nick === 'string' ? msg.nick : '',
            hasAudio: Boolean(msg.hasAudio),
            transport: 'ws',
          },
          now,
        );

        if (!joinResult.ok) {
          sendJson(ws, {
            type: 'room:error',
            reason: joinResult.reason,
            message: joinResult.message,
          });
          return;
        }

        meta.roomCode = joinResult.snapshot.code;
        saveStore();

        sendJson(ws, {
          type: 'room:joined',
          peerId,
          snapshot: joinResult.snapshot,
        });

        broadcastRoomState(meta.roomCode, peerId, now);

        if (joinResult.snapshot.participants.length === 2) {
          const [firstPeer, secondPeer] = joinResult.snapshot.participants;
          deliverRtcInitiate(firstPeer.peerId, secondPeer.peerId);
        }
        return;
      }

      if (type === 'room:leave') {
        detachPeerFromCurrentRoom(meta);
        saveStore();
        sendJson(ws, { type: 'room:left' });
        return;
      }

      if (type === 'peer:update') {
        if (!meta.roomCode) return;
        const snapshot = updatePreBetaPeerState(
          store,
          {
            code: meta.roomCode,
            peerId,
            micMuted: typeof msg.micMuted === 'boolean' ? msg.micMuted : undefined,
            hasAudio: typeof msg.hasAudio === 'boolean' ? msg.hasAudio : undefined,
          },
          now,
        );
        if (snapshot) {
          broadcastRoomState(meta.roomCode, undefined, now);
        }
        return;
      }

      if (type === 'chat:send') {
        if (!meta.roomCode) {
          sendJson(ws, {
            type: 'room:error',
            reason: 'NOT_IN_ROOM',
            message: 'Сначала подключитесь к комнате по коду.',
          });
          return;
        }
        const chatResult = appendPreBetaMessage(
          store,
          {
            code: meta.roomCode,
            peerId,
            rawText: typeof msg.text === 'string' ? msg.text : '',
          },
          now,
        );
        if (!chatResult.ok) {
          if (chatResult.reason === 'ROOM_EXPIRED') {
            sendJson(ws, {
              type: 'session:expired',
              code: meta.roomCode,
              message: chatResult.message,
            });
            meta.roomCode = null;
          } else {
            sendJson(ws, {
              type: 'room:error',
              reason: chatResult.reason,
              message: chatResult.message,
            });
          }
          return;
        }
        saveStore();
        broadcastToRoom(meta.roomCode, { type: 'chat:message', message: chatResult.message });
        return;
      }

      if (type === 'rtc:signal') {
        if (!meta.roomCode) return;
        const room = store.rooms[meta.roomCode];
        const sender = room?.participants.find((p) => p.peerId === peerId);
        if (!room || !sender || getClientRoomRemainingMs(room, sender.clientId, now) <= 0) {
          sendJson(ws, {
            type: 'session:expired',
            code: meta.roomCode,
            message: 'Время pre-beta сессии (30 минут) истекло.',
          });
          meta.roomCode = null;
          return;
        }
        const signalType = typeof msg.signalType === 'string' ? msg.signalType : '';
        if (signalType !== 'offer' && signalType !== 'answer' && signalType !== 'ice') {
          return;
        }
        deliverRtcSignal(meta.roomCode, peerId, signalType, msg.payload ?? null);
        return;
      }

      if (type === 'audio:frame') {
        if (!meta.roomCode) return;
        const room = store.rooms[meta.roomCode];
        const sender = room?.participants.find((p) => p.peerId === peerId);
        if (!room || !sender || getClientRoomRemainingMs(room, sender.clientId, now) <= 0) {
          return;
        }
        const data = typeof msg.data === 'string' ? msg.data : '';
        const sr = typeof msg.sr === 'number' && msg.sr >= 8000 && msg.sr <= 48000 ? msg.sr : 16000;
        if (!data || data.length > 32768) return;
        deliverRtcSignal(meta.roomCode, peerId, 'audio', { sr, data });
      }
    });

    ws.on('close', () => {
      detachPeerFromCurrentRoom(meta);
      saveStore();
      socketsByPeerId.delete(peerId);
    });
  });

  // Authoritative server timer: prune stale HTTP peers (pauses clock), sync active rooms, expire when 0
  setInterval(() => {
    const now = Date.now();
    let dirty = false;

    const pruned = pruneStaleHttpParticipants(store, now);
    if (pruned.length > 0) {
      dirty = true;
      for (const item of pruned) {
        const room = store.rooms[item.code];
        if (room) {
          for (const removedId of item.removedPeerIds) {
            pendingSignalsByPeerId.delete(removedId);
            broadcastToRoom(item.code, { type: 'peer:left', peerId: removedId });
          }
          broadcastRoomState(item.code, undefined, now);
        }
      }
    }

    const expiredRooms = expireElapsedRooms(store, now);
    if (expiredRooms.length > 0) {
      dirty = true;
      for (const item of expiredRooms) {
        for (const kickedPeerId of item.kickedPeerIds) {
          pendingSignalsByPeerId.delete(kickedPeerId);
          const meta = socketsByPeerId.get(kickedPeerId);
          if (meta) {
            meta.roomCode = null;
            sendJson(meta.ws, {
              type: 'session:expired',
              code: item.code,
              message: '30-минутный pre-beta лимит до релиза истёк. Связь завершена.',
            });
          }
        }
      }
    }

    if (dirty) {
      saveStore();
    }

    for (const room of Object.values(store.rooms)) {
      if (room.participants.length === 0) continue;
      for (const participant of room.participants) {
        if (isClientTimerPaused(room, participant.clientId)) continue;
        const meta = socketsByPeerId.get(participant.peerId);
        if (meta && meta.ws.readyState === WebSocket.OPEN) {
          sendJson(meta.ws, {
            type: 'room:tick',
            remainingMs: getClientRoomRemainingMs(room, participant.clientId, now),
          });
        }
      }
    }
  }, 1000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Geek server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
