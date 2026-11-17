import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  PRE_BETA_MAX_PARTICIPANTS,
  appendPreBetaMessage,
  createEmptyPreBetaStore,
  expireElapsedRooms,
  getClientQuotaStatus,
  getRemainingMs,
  hydratePreBetaStore,
  issueOneTimePreBetaCode,
  joinPreBetaRoom,
  leavePreBetaRoom,
  normalizePreBetaCode,
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

const socketsByPeerId = new Map<string, ActiveSocketMeta>();

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
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

function detachPeerFromCurrentRoom(meta: ActiveSocketMeta): void {
  if (!meta.roomCode) return;
  const code = meta.roomCode;
  meta.roomCode = null;
  const { removedPeer, snapshot } = leavePreBetaRoom(store, code, meta.peerId, Date.now());
  if (removedPeer && snapshot) {
    broadcastToRoom(code, { type: 'peer:left', peerId: meta.peerId, nick: removedPeer.nick });
    broadcastToRoom(code, { type: 'room:state', snapshot });
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/prebeta/status', (req, res) => {
    const rawClientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
    const status = getClientQuotaStatus(store, rawClientId, Date.now());
    res.json({ ok: true, ...status });
  });

  app.post('/api/prebeta/issue', (req, res) => {
    const rawClientId =
      req.body && typeof req.body.clientId === 'string' ? req.body.clientId : '';
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
    const remainingMs = getRemainingMs(room.expiresAt, Date.now());
    res.json({
      ok: true,
      code: room.code,
      remainingMs,
      expired: remainingMs <= 0,
      participantsCount: room.participants.length,
      maxParticipants: PRE_BETA_MAX_PARTICIPANTS,
    });
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

        broadcastToRoom(
          meta.roomCode,
          { type: 'room:state', snapshot: joinResult.snapshot },
          peerId,
        );

        // If 2 peers are now present, coordinate WebRTC offer/answer cleanly
        if (joinResult.snapshot.participants.length === 2) {
          const [firstPeer, secondPeer] = joinResult.snapshot.participants;
          const firstMeta = socketsByPeerId.get(firstPeer.peerId);
          if (firstMeta) {
            sendJson(firstMeta.ws, {
              type: 'rtc:initiate',
              targetPeerId: secondPeer.peerId,
            });
          }
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
          broadcastToRoom(meta.roomCode, { type: 'room:state', snapshot });
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
        if (!room || getRemainingMs(room.expiresAt, now) <= 0) {
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
        broadcastToRoom(
          meta.roomCode,
          {
            type: 'rtc:signal',
            fromPeerId: peerId,
            signalType,
            payload: msg.payload ?? null,
          },
          peerId,
        );
      }
    });

    ws.on('close', () => {
      detachPeerFromCurrentRoom(meta);
      socketsByPeerId.delete(peerId);
    });
  });

  // Authoritative server timer for 30-minute countdown sync and cutoff
  setInterval(() => {
    const now = Date.now();
    const expiredRooms = expireElapsedRooms(store, now);
    if (expiredRooms.length > 0) {
      saveStore();
      for (const item of expiredRooms) {
        for (const kickedPeerId of item.kickedPeerIds) {
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

    for (const room of Object.values(store.rooms)) {
      if (room.participants.length === 0) continue;
      const remainingMs = getRemainingMs(room.expiresAt, now);
      broadcastToRoom(room.code, {
        type: 'room:tick',
        remainingMs,
      });
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
