import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  generateLivePreviewPeerReply,
  getVoiceUnlockHmacSecret,
  isPreviewGeminiConfigured,
  tryVerifyVoiceUnlockCode,
} from './src/utils/previewGeminiService.ts';
import { verifyPreviewUnlockToken } from './src/utils/previewChatGuard.ts';
import {
  LIVE_VOICE_MAX_PARTICIPANTS,
  buildLiveVoiceSnapshot,
  joinLiveVoiceRoom,
  leaveLiveVoiceRoom,
  pruneStaleLiveVoicePeers,
  shouldInitiateRtcMesh,
  updateLiveVoicePeer,
  type LiveVoicePeer,
} from './src/utils/liveVoiceRoom.ts';
const PORT = Number(process.env.PORT) || 3000;

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
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
      voiceUnlockEnabled: true,
    });
  });

  app.post('/api/preview/voice-unlock', (req, res) => {
    const body = parseBodyObj(req.body);
    const rawCode =
      typeof body.code === 'string'
        ? body.code
        : typeof body.question === 'string'
          ? body.question
          : '';
    const check = tryVerifyVoiceUnlockCode(rawCode);
    if (!check.matched) {
      res.json({ ok: true, matched: false });
      return;
    }
    res.json({
      ok: true,
      matched: true,
      voiceUnlockToken: check.voiceUnlockToken,
      reply: check.reply,
    });
  });

  app.post('/api/preview/reply', async (req, res) => {
    const body = parseBodyObj(req.body);
    const result = await generateLivePreviewPeerReply({
      question: body.question,
      serverId: body.serverId,
      channelId: body.channelId,
      history: body.history,
      unlockToken: body.unlockToken,
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
      ...(result.unlocked ? { unlocked: true, unlockToken: result.unlockToken } : {}),
      ...(result.voiceUnlocked
        ? { voiceUnlocked: true, voiceUnlockToken: result.voiceUnlockToken }
        : {}),
    });
  });

  // Multi-user Live Voice Room (gated behind secret chat code token)
  const liveVoicePeers = new Map<string, LiveVoicePeer>();
  const liveVoiceSockets = new Map<string, WebSocket>();
  const liveVoicePendingSignals = new Map<string, Array<Record<string, unknown>>>();

  function enqueueLiveVoiceHttpSignal(toPeerId: string, packet: Record<string, unknown>): void {
    const existing = liveVoicePendingSignals.get(toPeerId) ?? [];
    existing.push(packet);
    if (existing.length > 120) {
      const trimmed: Array<Record<string, unknown>> = [];
      let audioDropped = 0;
      const toDrop = existing.length - 120;
      for (const item of existing) {
        if (item.type === 'voice:audio' && audioDropped < toDrop) {
          audioDropped += 1;
        } else {
          trimmed.push(item);
        }
      }
      liveVoicePendingSignals.set(toPeerId, trimmed.slice(-120));
      return;
    }
    liveVoicePendingSignals.set(toPeerId, existing);
  }

  function deliverLiveVoicePacket(toPeerId: string, packet: Record<string, unknown>): void {
    const ws = liveVoiceSockets.get(toPeerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendJson(ws, packet);
    } else if (liveVoicePeers.has(toPeerId)) {
      enqueueLiveVoiceHttpSignal(toPeerId, packet);
    }
  }

  function broadcastLiveVoiceSnapshot(excludePeerId?: string): void {
    const peers = buildLiveVoiceSnapshot(liveVoicePeers);
    const msg = { type: 'voice:state', peers };
    for (const peer of liveVoicePeers.values()) {
      if (excludePeerId && peer.peerId === excludePeerId) continue;
      const ws = liveVoiceSockets.get(peer.peerId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendJson(ws, msg);
      }
    }
  }

  function initiateLiveVoiceMeshForNewcomer(newPeerId: string): void {
    for (const other of liveVoicePeers.values()) {
      if (other.peerId === newPeerId) continue;
      if (shouldInitiateRtcMesh(newPeerId, other.peerId)) {
        deliverLiveVoicePacket(newPeerId, {
          type: 'voice:rtc-initiate',
          targetPeerId: other.peerId,
        });
      } else {
        deliverLiveVoicePacket(other.peerId, {
          type: 'voice:rtc-initiate',
          targetPeerId: newPeerId,
        });
      }
    }
  }

  function detachLiveVoicePeer(peerId: string): void {
    liveVoicePendingSignals.delete(peerId);
    liveVoiceSockets.delete(peerId);
    const { removedPeer, snapshot } = leaveLiveVoiceRoom(liveVoicePeers, peerId);
    if (removedPeer) {
      const leftMsg = { type: 'voice:peer-left', peerId };
      for (const peer of liveVoicePeers.values()) {
        deliverLiveVoicePacket(peer.peerId, leftMsg);
      }
      for (const peer of liveVoicePeers.values()) {
        const ws = liveVoiceSockets.get(peer.peerId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          sendJson(ws, { type: 'voice:state', peers: snapshot });
        }
      }
    }
  }

  app.get('/api/voice/status', (_req, res) => {
    res.json({
      ok: true,
      peersCount: liveVoicePeers.size,
      maxParticipants: LIVE_VOICE_MAX_PARTICIPANTS,
      voiceUnlockEnabled: true,
    });
  });

  app.post('/api/voice/unlock', (req, res) => {
    const body = parseBodyObj(req.body);
    const rawCode =
      typeof body.code === 'string'
        ? body.code
        : typeof body.question === 'string'
          ? body.question
          : '';
    const check = tryVerifyVoiceUnlockCode(rawCode);
    if (!check.matched) {
      res.json({ ok: true, matched: false });
      return;
    }
    res.json({
      ok: true,
      matched: true,
      voiceUnlockToken: check.voiceUnlockToken,
      reply: check.reply,
    });
  });

  app.post('/api/voice/join', (req, res) => {
    const body = parseBodyObj(req.body);
    if (!verifyPreviewUnlockToken(body.token, getVoiceUnlockHmacSecret())) {
      res.status(401).json({
        ok: false,
        reason: 'UNAUTHORIZED',
        message: 'Требуется секретный код доступа к голосовому каналу.',
      });
      return;
    }
    const peerId =
      typeof body.peerId === 'string' && body.peerId.trim().length >= 8
        ? body.peerId.trim().slice(0, 64)
        : crypto.randomUUID();
    const joinResult = joinLiveVoiceRoom(
      liveVoicePeers,
      {
        peerId,
        nick: body.nick,
        hasAudio: Boolean(body.hasAudio),
        micMuted: Boolean(body.micMuted),
        deafened: Boolean(body.deafened),
        camActive: Boolean(body.camActive),
        screenActive: Boolean(body.screenActive),
        transport: 'http',
      },
      Date.now(),
    );
    if (!joinResult.ok) {
      res.status(409).json(joinResult);
      return;
    }
    broadcastLiveVoiceSnapshot(peerId);
    initiateLiveVoiceMeshForNewcomer(peerId);
    const signals = liveVoicePendingSignals.get(peerId) ?? [];
    if (signals.length > 0) {
      liveVoicePendingSignals.delete(peerId);
    }
    res.json({
      ok: true,
      peerId,
      peers: joinResult.snapshot,
      signals,
    });
  });

  app.post('/api/voice/poll', (req, res) => {
    const body = parseBodyObj(req.body);
    if (!verifyPreviewUnlockToken(body.token, getVoiceUnlockHmacSecret())) {
      res.status(401).json({ ok: false, reason: 'UNAUTHORIZED', message: 'Доступ запрещён.' });
      return;
    }
    const peerId = typeof body.peerId === 'string' ? body.peerId : '';
    const peer = liveVoicePeers.get(peerId);
    if (!peer) {
      res.status(409).json({ ok: false, reason: 'NOT_IN_ROOM', message: 'Вы не в голосовом канале.' });
      return;
    }
    peer.lastSeenAt = Date.now();
    const signals = liveVoicePendingSignals.get(peerId) ?? [];
    if (signals.length > 0) {
      liveVoicePendingSignals.delete(peerId);
    }
    res.json({
      ok: true,
      peers: buildLiveVoiceSnapshot(liveVoicePeers),
      signals,
    });
  });

  app.post('/api/voice/update', (req, res) => {
    const body = parseBodyObj(req.body);
    if (!verifyPreviewUnlockToken(body.token, getVoiceUnlockHmacSecret())) {
      res.status(401).json({ ok: false, reason: 'UNAUTHORIZED' });
      return;
    }
    const peerId = typeof body.peerId === 'string' ? body.peerId : '';
    const snapshot = updateLiveVoicePeer(
      liveVoicePeers,
      peerId,
      {
        nick: typeof body.nick === 'string' ? body.nick : undefined,
        micMuted: typeof body.micMuted === 'boolean' ? body.micMuted : undefined,
        deafened: typeof body.deafened === 'boolean' ? body.deafened : undefined,
        hasAudio: typeof body.hasAudio === 'boolean' ? body.hasAudio : undefined,
        camActive: typeof body.camActive === 'boolean' ? body.camActive : undefined,
        screenActive: typeof body.screenActive === 'boolean' ? body.screenActive : undefined,
        speaking: typeof body.speaking === 'boolean' ? body.speaking : undefined,
      },
      Date.now(),
    );
    if (!snapshot) {
      res.status(409).json({ ok: false, reason: 'NOT_IN_ROOM' });
      return;
    }
    broadcastLiveVoiceSnapshot();
    res.json({ ok: true, peers: snapshot });
  });

  app.post('/api/voice/signal', (req, res) => {
    const body = parseBodyObj(req.body);
    if (!verifyPreviewUnlockToken(body.token, getVoiceUnlockHmacSecret())) {
      res.status(401).json({ ok: false, reason: 'UNAUTHORIZED' });
      return;
    }
    const peerId = typeof body.peerId === 'string' ? body.peerId : '';
    const sender = liveVoicePeers.get(peerId);
    if (!sender) {
      res.status(409).json({ ok: false, reason: 'NOT_IN_ROOM' });
      return;
    }
    sender.lastSeenAt = Date.now();
    const signalType = typeof body.signalType === 'string' ? body.signalType : '';
    if (signalType === 'audio') {
      const p = body.payload as { sr?: unknown; data?: unknown } | null;
      if (!p || typeof p.data !== 'string' || p.data.length === 0 || p.data.length > 32768) {
        res.status(400).json({ ok: false, reason: 'BAD_AUDIO_FRAME' });
        return;
      }
      const sr = typeof p.sr === 'number' && p.sr >= 8000 && p.sr <= 48000 ? p.sr : 16000;
      for (const peer of liveVoicePeers.values()) {
        if (peer.peerId === peerId || peer.deafened) continue;
        deliverLiveVoicePacket(peer.peerId, {
          type: 'voice:audio',
          fromPeerId: peerId,
          sr,
          data: p.data,
        });
      }
      res.json({ ok: true });
      return;
    }
    const toPeerId = typeof body.toPeerId === 'string' ? body.toPeerId : '';
    if (
      !toPeerId ||
      toPeerId === peerId ||
      !liveVoicePeers.has(toPeerId) ||
      (signalType !== 'offer' && signalType !== 'answer' && signalType !== 'ice')
    ) {
      res.status(400).json({ ok: false, reason: 'BAD_SIGNAL' });
      return;
    }
    deliverLiveVoicePacket(toPeerId, {
      type: 'voice:signal',
      fromPeerId: peerId,
      signalType,
      payload: body.payload ?? null,
    });
    res.json({ ok: true });
  });

  app.post('/api/voice/leave', (req, res) => {
    const body = parseBodyObj(req.body);
    const peerId = typeof body.peerId === 'string' ? body.peerId : '';
    if (peerId && liveVoicePeers.has(peerId)) {
      detachLiveVoicePeer(peerId);
    }
    res.json({ ok: true });
  });

  const httpServer = http.createServer(app);
  const wssVoice = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      pathname = '/';
    }

    if (pathname === '/ws/voice') {
      wssVoice.handleUpgrade(req, socket, head, (ws) => {
        wssVoice.emit('connection', ws, req);
      });
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      socket.destroy();
    }
  });

  wssVoice.on('connection', (ws) => {
    const peerId = crypto.randomUUID();
    let joined = false;
    sendJson(ws, { type: 'voice:welcome', peerId });

    ws.on('message', (rawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(rawData)) as Record<string, unknown>;
      } catch {
        sendJson(ws, { type: 'voice:error', reason: 'BAD_JSON', message: 'Неверный формат пакета.' });
        return;
      }

      const type = typeof msg.type === 'string' ? msg.type : '';
      const now = Date.now();

      if (type === 'voice:join') {
        if (!verifyPreviewUnlockToken(msg.token, getVoiceUnlockHmacSecret())) {
          sendJson(ws, {
            type: 'voice:error',
            reason: 'UNAUTHORIZED',
            message: 'Неверный или устаревший секретный код. Введите секретный код заново.',
          });
          return;
        }
        if (joined) {
          detachLiveVoicePeer(peerId);
          joined = false;
        }
        const joinResult = joinLiveVoiceRoom(
          liveVoicePeers,
          {
            peerId,
            nick: msg.nick,
            hasAudio: Boolean(msg.hasAudio),
            micMuted: Boolean(msg.micMuted),
            deafened: Boolean(msg.deafened),
            camActive: Boolean(msg.camActive),
            screenActive: Boolean(msg.screenActive),
            transport: 'ws',
          },
          now,
        );
        if (!joinResult.ok) {
          sendJson(ws, {
            type: 'voice:error',
            reason: joinResult.reason,
            message: joinResult.message,
          });
          return;
        }
        joined = true;
        liveVoiceSockets.set(peerId, ws);
        sendJson(ws, {
          type: 'voice:joined',
          peerId,
          peers: joinResult.snapshot,
        });
        broadcastLiveVoiceSnapshot(peerId);
        initiateLiveVoiceMeshForNewcomer(peerId);
        return;
      }

      if (type === 'voice:leave') {
        if (joined) {
          detachLiveVoicePeer(peerId);
          joined = false;
        }
        sendJson(ws, { type: 'voice:left' });
        return;
      }

      if (!joined) return;

      if (type === 'voice:update') {
        const snapshot = updateLiveVoicePeer(
          liveVoicePeers,
          peerId,
          {
            nick: typeof msg.nick === 'string' ? msg.nick : undefined,
            micMuted: typeof msg.micMuted === 'boolean' ? msg.micMuted : undefined,
            deafened: typeof msg.deafened === 'boolean' ? msg.deafened : undefined,
            hasAudio: typeof msg.hasAudio === 'boolean' ? msg.hasAudio : undefined,
            camActive: typeof msg.camActive === 'boolean' ? msg.camActive : undefined,
            screenActive: typeof msg.screenActive === 'boolean' ? msg.screenActive : undefined,
            speaking: typeof msg.speaking === 'boolean' ? msg.speaking : undefined,
          },
          now,
        );
        if (snapshot) {
          broadcastLiveVoiceSnapshot();
        }
        return;
      }

      if (type === 'voice:signal') {
        const toPeerId = typeof msg.toPeerId === 'string' ? msg.toPeerId : '';
        const signalType = typeof msg.signalType === 'string' ? msg.signalType : '';
        if (
          !toPeerId ||
          toPeerId === peerId ||
          !liveVoicePeers.has(toPeerId) ||
          (signalType !== 'offer' && signalType !== 'answer' && signalType !== 'ice')
        ) {
          return;
        }
        deliverLiveVoicePacket(toPeerId, {
          type: 'voice:signal',
          fromPeerId: peerId,
          signalType,
          payload: msg.payload ?? null,
        });
        return;
      }

      if (type === 'voice:audio') {
        const data = typeof msg.data === 'string' ? msg.data : '';
        const sr = typeof msg.sr === 'number' && msg.sr >= 8000 && msg.sr <= 48000 ? msg.sr : 16000;
        if (!data || data.length > 32768) return;
        for (const peer of liveVoicePeers.values()) {
          if (peer.peerId === peerId || peer.deafened) continue;
          deliverLiveVoicePacket(peer.peerId, {
            type: 'voice:audio',
            fromPeerId: peerId,
            sr,
            data,
          });
        }
      }
    });

    ws.on('close', () => {
      if (joined) {
        detachLiveVoicePeer(peerId);
        joined = false;
      } else {
        liveVoiceSockets.delete(peerId);
      }
    });
  });

  // Authoritative server cleanup for stale HTTP peers in Live Voice room
  setInterval(() => {
    const now = Date.now();
    const prunedVoiceIds = pruneStaleLiveVoicePeers(liveVoicePeers, now);
    if (prunedVoiceIds.length > 0) {
      for (const removedId of prunedVoiceIds) {
        liveVoicePendingSignals.delete(removedId);
        liveVoiceSockets.delete(removedId);
        for (const peer of liveVoicePeers.values()) {
          deliverLiveVoicePacket(peer.peerId, { type: 'voice:peer-left', peerId: removedId });
        }
      }
      broadcastLiveVoiceSnapshot();
    }
  }, 1000);

  const publicAudioDir = path.resolve(process.cwd(), 'public', 'audio');
  const rootAudioDir = path.resolve(process.cwd(), 'audio');
  if (fs.existsSync(publicAudioDir)) {
    app.use('/audio', express.static(publicAudioDir));
    app.use('/public/audio', express.static(publicAudioDir));
  }
  if (fs.existsSync(rootAudioDir)) {
    app.use('/audio', express.static(rootAudioDir));
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR === 'true' ? false : true,
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
