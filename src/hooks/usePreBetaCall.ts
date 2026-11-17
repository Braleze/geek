import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PRE_BETA_DURATION_MS,
  normalizePreBetaCode,
  type PreBetaChatMessage,
  type PublicRoomSnapshot,
} from '../utils/preBetaSession';
import {
  httpApiUrls,
  localPreBetaApi,
  probePreBetaBackend,
  subscribeLocalIpc,
  type PreBetaTransportKind,
  type QueuedSignal,
} from '../utils/preBetaTransport';

const CLIENT_ID_STORAGE_KEY = 'geek_prebeta_client_id_v1';
const NICK_STORAGE_KEY = 'geek_prebeta_nick_v1';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export type PreBetaQuotaState = {
  status: 'LOADING' | 'AVAILABLE' | 'ACTIVE' | 'EXHAUSTED';
  code: string | null;
  expiresAt: number | null;
  remainingMs: number;
  paused: boolean;
};

export type RtcLinkStatus =
  | 'idle'
  | 'waiting-peer'
  | 'negotiating'
  | 'connected'
  | 'text-only';

function getOrCreateClientId(): string {
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing && existing.length >= 6) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `gk-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
        : `gk-${Math.random().toString(36).slice(2, 14)}${Date.now().toString(36)}`;
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `gk-${Math.random().toString(36).slice(2, 14)}`;
  }
}

function getInitialNick(): string {
  try {
    return window.localStorage.getItem(NICK_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function buildWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = window.location.pathname.endsWith('/')
    ? window.location.pathname
    : window.location.pathname.replace(/[^/]*$/, '');
  const cleanBase = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return `${protocol}//${window.location.host}${cleanBase}ws/prebeta`;
}

export function usePreBetaCall() {
  const [clientId] = useState<string>(() =>
    typeof window !== 'undefined' ? getOrCreateClientId() : 'gk-ssr-client',
  );
  const [nick, setNickState] = useState<string>(() =>
    typeof window !== 'undefined' ? getInitialNick() : '',
  );
  const [transport, setTransport] = useState<PreBetaTransportKind>('node-ws');
  const [quota, setQuota] = useState<PreBetaQuotaState>({
    status: 'LOADING',
    code: null,
    expiresAt: null,
    remainingMs: PRE_BETA_DURATION_MS,
    paused: true,
  });
  const [roomSnapshot, setRoomSnapshot] = useState<PublicRoomSnapshot | null>(null);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(PRE_BETA_DURATION_MS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [hasMicAudio, setHasMicAudio] = useState(false);
  const [rtcStatus, setRtcStatus] = useState<RtcLinkStatus>('idle');

  const transportRef = useRef<PreBetaTransportKind>('node-ws');
  transportRef.current = transport;
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingJoinRef = useRef<{ code: string; nick: string } | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const roomRef = useRef<PublicRoomSnapshot | null>(null);
  roomRef.current = roomSnapshot;
  const myPeerIdRef = useRef<string | null>(null);
  myPeerIdRef.current = myPeerId;
  const nickRef = useRef(nick);
  nickRef.current = nick;
  const deafenedRef = useRef(deafened);
  deafenedRef.current = deafened;

  const setNick = useCallback((nextNick: string) => {
    const trimmed = nextNick.slice(0, 22);
    setNickState(trimmed);
    try {
      window.localStorage.setItem(NICK_STORAGE_KEY, trimmed);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const refreshQuotaStatus = useCallback(async () => {
    try {
      const probed = await probePreBetaBackend(clientId);
      setTransport((prev) =>
        prev === 'node-http' && probed.transport === 'node-ws' ? 'node-http' : probed.transport,
      );
      setQuota({
        status: probed.status,
        code: probed.code,
        expiresAt: probed.expiresAt,
        remainingMs: probed.remainingMs,
        paused: probed.paused,
      });
      return probed;
    } catch {
      setQuota((prev) => ({
        ...prev,
        status: prev.status === 'LOADING' ? 'AVAILABLE' : prev.status,
        paused: true,
      }));
      return null;
    }
  }, [clientId]);

  useEffect(() => {
    void refreshQuotaStatus();
  }, [refreshQuotaStatus]);

  // Keep quota timer ticking locally ONLY when NOT paused (e.g. a peer is actively inside the room)
  useEffect(() => {
    if (quota.status !== 'ACTIVE' || quota.paused || !quota.expiresAt) return;
    const interval = window.setInterval(() => {
      const left = Math.max(0, (quota.expiresAt ?? 0) - Date.now());
      setQuota((prev) =>
        left <= 0
          ? { ...prev, status: 'EXHAUSTED', remainingMs: 0, paused: false }
          : { ...prev, remainingMs: left },
      );
    }, 1000);
    return () => window.clearInterval(interval);
  }, [quota.status, quota.paused, quota.expiresAt]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const cleanupRtc = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setRtcStatus('idle');
  }, []);

  const stopLocalMedia = useCallback(() => {
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    setHasMicAudio(false);
  }, []);

  const acquireMicBestEffort = useCallback(async (): Promise<boolean> => {
    if (localStreamRef.current) {
      return true;
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setHasMicAudio(false);
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;
      setHasMicAudio(true);
      return true;
    } catch {
      setHasMicAudio(false);
      return false;
    }
  }, []);

  const sendSignalOutbound = useCallback(
    async (signalType: 'offer' | 'answer' | 'ice', payload: unknown) => {
      const mode = transportRef.current;
      const roomCode = roomRef.current?.code;
      const peerId = myPeerIdRef.current;

      if (mode === 'node-ws') {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'rtc:signal', signalType, payload }));
        }
        return;
      }

      if (!roomCode || !peerId) return;
      if (mode === 'local') {
        localPreBetaApi.signal(roomCode, peerId, signalType, payload);
        return;
      }

      const urls = httpApiUrls(mode);
      await fetch(urls.signal, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: roomCode, peerId, signalType, payload }),
      }).catch(() => {});
    },
    [],
  );

  const ensurePeerConnection = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    if (typeof RTCPeerConnection === 'undefined') {
      setRtcStatus('text-only');
      return null;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    } else {
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      } catch {
        // Ignore if browser rejects transceiver setup
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignalOutbound(
          'ice',
          event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        );
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteAudioRef.current && remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.muted = deafenedRef.current;
        void remoteAudioRef.current.play().catch(() => {});
      }
      setRtcStatus('connected');
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        setRtcStatus('connected');
      } else if (state === 'connecting') {
        setRtcStatus('negotiating');
      } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        setRtcStatus((prev) => (prev === 'idle' ? 'idle' : 'text-only'));
      }
    };

    return pc;
  }, [sendSignalOutbound]);

  const initiateRtcOffer = useCallback(async () => {
    const pc = ensurePeerConnection();
    if (!pc) return;
    try {
      setRtcStatus(localStreamRef.current ? 'negotiating' : 'text-only');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignalOutbound('offer', offer);
      window.setTimeout(() => {
        setRtcStatus((prev) => (prev === 'negotiating' ? 'text-only' : prev));
      }, 5000);
    } catch {
      setRtcStatus('text-only');
    }
  }, [ensurePeerConnection, sendSignalOutbound]);

  const handleRtcSignal = useCallback(
    async (signalType: string, payload: unknown) => {
      if (signalType === 'initiate') {
        await initiateRtcOffer();
        return;
      }
      const pc = ensurePeerConnection();
      if (!pc) return;
      try {
        if (signalType === 'offer' && payload) {
          setRtcStatus('negotiating');
          await pc.setRemoteDescription(
            new RTCSessionDescription(payload as RTCSessionDescriptionInit),
          );
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignalOutbound('answer', answer);
        } else if (signalType === 'answer' && payload) {
          await pc.setRemoteDescription(
            new RTCSessionDescription(payload as RTCSessionDescriptionInit),
          );
        } else if (signalType === 'ice' && payload) {
          await pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit));
        }
      } catch {
        setRtcStatus('text-only');
      }
    },
    [ensurePeerConnection, initiateRtcOffer, sendSignalOutbound],
  );

  const applyJoinedSnapshot = useCallback(
    (peerId: string, snapshot: PublicRoomSnapshot) => {
      setMyPeerId(peerId);
      setRoomSnapshot(snapshot);
      setRemainingMs(snapshot.remainingMs);
      const anyAudio = snapshot.participants.some((p) => p.hasAudio);
      setRtcStatus(
        snapshot.participants.length < 2
          ? 'waiting-peer'
          : anyAudio
            ? 'negotiating'
            : 'text-only',
      );
      setError(null);
      setBusy(false);
      void refreshQuotaStatus();
    },
    [refreshQuotaStatus],
  );

  const applyPolledState = useCallback(
    (snapshot: PublicRoomSnapshot, signals: QueuedSignal[] = []) => {
      setRoomSnapshot(snapshot);
      setRemainingMs(snapshot.remainingMs);
      if (snapshot.participants.length < 2) {
        cleanupRtc();
        setRtcStatus('waiting-peer');
      } else if (!snapshot.participants.some((p) => p.hasAudio)) {
        setRtcStatus((prev) => (prev === 'connected' ? 'connected' : 'text-only'));
      }
      for (const sig of signals) {
        void handleRtcSignal(sig.signalType, sig.payload);
      }
    },
    [cleanupRtc, handleRtcSignal],
  );

  const startHttpPolling = useCallback(
    (mode: 'node-http' | 'php-http' | 'local', code: string, peerId: string) => {
      stopPolling();

      const pollOnce = async () => {
        if (!roomRef.current) return;
        if (mode === 'local') {
          const res = localPreBetaApi.poll(code, peerId);
          if (!res.ok) {
            stopPolling();
            cleanupRtc();
            stopLocalMedia();
            setRoomSnapshot(null);
            if (res.reason === 'ROOM_EXPIRED') setRemainingMs(0);
            setError(res.message ?? 'Сессия завершена.');
            void refreshQuotaStatus();
            return;
          }
          if (res.snapshot) {
            applyPolledState(res.snapshot, res.signals);
          }
          return;
        }

        try {
          const urls = httpApiUrls(mode);
          const response = await fetch(urls.poll, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, peerId, clientId }),
          });
          const data = (await response.json()) as {
            ok?: boolean;
            reason?: string;
            message?: string;
            snapshot?: PublicRoomSnapshot;
            signals?: QueuedSignal[];
          };
          if (!data.ok || !data.snapshot) {
            if (data.reason === 'ROOM_EXPIRED' || data.reason === 'NOT_IN_ROOM' || data.reason === 'ROOM_NOT_FOUND') {
              stopPolling();
              cleanupRtc();
              stopLocalMedia();
              setRoomSnapshot(null);
              if (data.reason === 'ROOM_EXPIRED') setRemainingMs(0);
              setError(data.message ?? 'Сессия завершена.');
              void refreshQuotaStatus();
            }
            return;
          }
          applyPolledState(data.snapshot, data.signals ?? []);
        } catch {
          // Transient poll hiccup: keep trying on next tick
        }
      };

      pollTimerRef.current = window.setInterval(() => {
        void pollOnce();
      }, 750);
    },
    [applyPolledState, cleanupRtc, clientId, refreshQuotaStatus, stopLocalMedia, stopPolling],
  );

  // Instant IPC refresh when running in local multi-tab fallback
  useEffect(() => {
    if (transport !== 'local') return;
    return subscribeLocalIpc(() => {
      const currentRoom = roomRef.current;
      const peerId = myPeerIdRef.current;
      if (currentRoom && peerId) {
        const res = localPreBetaApi.poll(currentRoom.code, peerId);
        if (res.ok && res.snapshot) {
          applyPolledState(res.snapshot, res.signals);
        }
      } else {
        void refreshQuotaStatus();
      }
    });
  }, [applyPolledState, refreshQuotaStatus, transport]);

  const ensureSocketConnected = useCallback((): Promise<WebSocket> => {
    const current = wsRef.current;
    if (current && current.readyState === WebSocket.OPEN) {
      return Promise.resolve(current);
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(buildWsUrl());
      wsRef.current = ws;

      const timeoutId = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error('WS_UNAVAILABLE'));
        }
      }, 3500);

      ws.onopen = () => {
        window.clearTimeout(timeoutId);
        setWsConnected(true);
        resolve(ws);
      };

      ws.onerror = () => {
        window.clearTimeout(timeoutId);
        setWsConnected(false);
        reject(new Error('WS_UNAVAILABLE'));
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
      };

      ws.onmessage = (event) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }

        const type = typeof data.type === 'string' ? data.type : '';

        if (type === 'ws:welcome') {
          if (typeof data.peerId === 'string') {
            setMyPeerId(data.peerId);
          }
          if (pendingJoinRef.current) {
            const pending = pendingJoinRef.current;
            pendingJoinRef.current = null;
            ws.send(
              JSON.stringify({
                type: 'room:join',
                code: pending.code,
                clientId,
                nick: pending.nick,
                hasAudio: Boolean(localStreamRef.current),
              }),
            );
          }
          return;
        }

        if (type === 'room:joined') {
          const snapshot = data.snapshot as PublicRoomSnapshot | undefined;
          const peerId = typeof data.peerId === 'string' ? data.peerId : '';
          if (snapshot && peerId) {
            applyJoinedSnapshot(peerId, snapshot);
          }
          return;
        }

        if (type === 'room:state') {
          const snapshot = data.snapshot as PublicRoomSnapshot | undefined;
          if (snapshot) {
            applyPolledState(snapshot, []);
          }
          return;
        }

        if (type === 'room:tick') {
          if (typeof data.remainingMs === 'number') {
            setRemainingMs(data.remainingMs);
          }
          return;
        }

        if (type === 'chat:message') {
          const incoming = data.message as PreBetaChatMessage | undefined;
          if (!incoming) return;
          setRoomSnapshot((prev) => {
            if (!prev) return prev;
            if (prev.messages.some((m) => m.id === incoming.id)) {
              return prev;
            }
            return {
              ...prev,
              messages: [...prev.messages, incoming].slice(-80),
            };
          });
          return;
        }

        if (type === 'rtc:initiate') {
          void initiateRtcOffer();
          return;
        }

        if (type === 'rtc:signal') {
          void handleRtcSignal(String(data.signalType ?? ''), data.payload);
          return;
        }

        if (type === 'peer:left') {
          cleanupRtc();
          setRtcStatus('waiting-peer');
          return;
        }

        if (type === 'room:left') {
          cleanupRtc();
          setRoomSnapshot(null);
          setBusy(false);
          void refreshQuotaStatus();
          return;
        }

        if (type === 'session:expired') {
          cleanupRtc();
          stopLocalMedia();
          setRoomSnapshot(null);
          setRemainingMs(0);
          setBusy(false);
          setError(
            typeof data.message === 'string'
              ? data.message
              : '30-минутный pre-beta лимит до релиза истёк.',
          );
          void refreshQuotaStatus();
          return;
        }

        if (type === 'room:error') {
          setBusy(false);
          setError(
            typeof data.message === 'string'
              ? data.message
              : 'Ошибка подключения к pre-beta каналу.',
          );
        }
      };
    });
  }, [
    applyJoinedSnapshot,
    applyPolledState,
    cleanupRtc,
    clientId,
    handleRtcSignal,
    initiateRtcOffer,
    refreshQuotaStatus,
    stopLocalMedia,
  ]);

  const joinViaHttp = useCallback(
    async (
      mode: 'node-http' | 'php-http' | 'local',
      normalizedCode: string,
      effectiveNick: string,
      gotMic: boolean,
    ): Promise<boolean> => {
      if (mode === 'local') {
        const peerId = `loc-${Math.random().toString(36).slice(2, 12)}`;
        const res = localPreBetaApi.join({
          code: normalizedCode,
          peerId,
          clientId,
          nick: effectiveNick,
          hasAudio: gotMic,
        });
        if (!res.ok) {
          setBusy(false);
          setError(res.message);
          return false;
        }
        applyJoinedSnapshot(peerId, res.snapshot);
        startHttpPolling('local', res.snapshot.code, peerId);
        return true;
      }

      const urls = httpApiUrls(mode);
      const response = await fetch(urls.join, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: normalizedCode,
          clientId,
          nick: effectiveNick,
          hasAudio: gotMic,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        peerId?: string;
        snapshot?: PublicRoomSnapshot;
        message?: string;
      };
      if (!payload.ok || !payload.peerId || !payload.snapshot) {
        setBusy(false);
        setError(payload.message ?? 'Не удалось подключиться к диалогу.');
        return false;
      }
      applyJoinedSnapshot(payload.peerId, payload.snapshot);
      startHttpPolling(mode, payload.snapshot.code, payload.peerId);
      return true;
    },
    [applyJoinedSnapshot, clientId, startHttpPolling],
  );

  const joinRoomByCode = useCallback(
    async (rawCode: string, customNick?: string) => {
      const normalized = normalizePreBetaCode(rawCode);
      if (!normalized) {
        setError('Введите корректный код формата GK-XXXX-XXXX.');
        return false;
      }

      setError(null);
      setBusy(true);
      const effectiveNick = (customNick ?? nickRef.current).trim();
      const gotMic = await acquireMicBestEffort();

      const currentTransport = transportRef.current;
      if (currentTransport === 'node-ws') {
        try {
          const ws = await ensureSocketConnected();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'room:join',
                code: normalized,
                clientId,
                nick: effectiveNick,
                hasAudio: gotMic,
              }),
            );
          } else {
            pendingJoinRef.current = { code: normalized, nick: effectiveNick };
          }
          return true;
        } catch {
          // Proxy blocked WebSocket upgrade — automatically fall back to Node HTTP polling!
          setTransport('node-http');
          try {
            return await joinViaHttp('node-http', normalized, effectiveNick, gotMic);
          } catch {
            setBusy(false);
            setError('Не удалось подключиться к pre-beta диалогу.');
            return false;
          }
        }
      }

      try {
        return await joinViaHttp(currentTransport, normalized, effectiveNick, gotMic);
      } catch {
        setBusy(false);
        setError('Не удалось подключиться к pre-beta диалогу.');
        return false;
      }
    },
    [acquireMicBestEffort, clientId, ensureSocketConnected, joinViaHttp],
  );

  const issueCodeAndJoin = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const probed = await probePreBetaBackend(clientId);
      const activeMode =
        transportRef.current === 'node-http' && probed.transport === 'node-ws'
          ? 'node-http'
          : probed.transport;
      setTransport(activeMode);

      if (activeMode === 'local') {
        const res = localPreBetaApi.issue(clientId);
        if (!res.ok) {
          setBusy(false);
          setError(res.message);
          await refreshQuotaStatus();
          return;
        }
        setQuota({
          status: 'ACTIVE',
          code: res.code,
          expiresAt: res.expiresAt,
          remainingMs: res.remainingMs,
          paused: res.paused,
        });
        await joinRoomByCode(res.code, nickRef.current || 'Создатель');
        return;
      }

      const urls = httpApiUrls(activeMode);
      const response = await fetch(urls.issue, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const ct = response.headers.get('content-type') || '';
      if (!ct.toLowerCase().includes('application/json')) {
        throw new Error('NON_JSON_ISSUE');
      }
      const payload = (await response.json()) as {
        ok: boolean;
        code?: string;
        expiresAt?: number | null;
        remainingMs?: number;
        paused?: boolean;
        message?: string;
      };

      if (!payload.ok || !payload.code) {
        setBusy(false);
        setError(payload.message ?? 'Не удалось выдать код доступа.');
        await refreshQuotaStatus();
        return;
      }

      setQuota({
        status: 'ACTIVE',
        code: payload.code,
        expiresAt: payload.expiresAt ?? null,
        remainingMs: payload.remainingMs ?? PRE_BETA_DURATION_MS,
        paused: typeof payload.paused === 'boolean' ? payload.paused : true,
      });

      await joinRoomByCode(payload.code, nickRef.current || 'Создатель');
    } catch {
      setBusy(false);
      setError('Сервер pre-beta связи недоступен.');
    }
  }, [clientId, joinRoomByCode, refreshQuotaStatus]);

  const leaveRoom = useCallback(() => {
    const mode = transportRef.current;
    const activeRoom = roomRef.current;
    const peerId = myPeerIdRef.current;

    stopPolling();

    if (mode === 'node-ws') {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'room:leave' }));
      }
    } else if (activeRoom && peerId) {
      if (mode === 'local') {
        localPreBetaApi.leave(activeRoom.code, peerId);
      } else {
        const urls = httpApiUrls(mode);
        void fetch(urls.leave, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: activeRoom.code, peerId }),
        }).catch(() => {});
      }
    }

    cleanupRtc();
    stopLocalMedia();
    setRoomSnapshot(null);
    setError(null);
    void refreshQuotaStatus();
  }, [cleanupRtc, refreshQuotaStatus, stopLocalMedia, stopPolling]);

  const sendMessage = useCallback(
    (text: string): boolean => {
      const clean = text.trim();
      const activeRoom = roomRef.current;
      const peerId = myPeerIdRef.current;
      if (!clean || !activeRoom || !peerId) return false;

      const mode = transportRef.current;
      if (mode === 'node-ws') {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'chat:send', text: clean }));
        }
        return true;
      }

      if (mode === 'local') {
        localPreBetaApi.send(activeRoom.code, peerId, clean);
        const polled = localPreBetaApi.poll(activeRoom.code, peerId);
        if (polled.ok && polled.snapshot) {
          applyPolledState(polled.snapshot, polled.signals);
        }
        return true;
      }

      const urls = httpApiUrls(mode);
      void fetch(urls.send, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: activeRoom.code, peerId, text: clean }),
      })
        .then((r) => r.json())
        .then((res: { ok?: boolean; message?: PreBetaChatMessage }) => {
          if (res.ok && res.message) {
            const incoming = res.message;
            setRoomSnapshot((prev) => {
              if (!prev) return prev;
              if (prev.messages.some((m) => m.id === incoming.id)) return prev;
              return { ...prev, messages: [...prev.messages, incoming].slice(-80) };
            });
          }
        })
        .catch(() => {});
      return true;
    },
    [applyPolledState],
  );

  const toggleMicMute = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getAudioTracks()) {
          track.enabled = !next;
        }
      }
      const mode = transportRef.current;
      const activeRoom = roomRef.current;
      const peerId = myPeerIdRef.current;
      if (mode === 'node-ws') {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'peer:update', micMuted: next }));
        }
      } else if (activeRoom && peerId) {
        if (mode === 'local') {
          localPreBetaApi.updatePeer(activeRoom.code, peerId, next);
        } else {
          const urls = httpApiUrls(mode);
          void fetch(urls.peer, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: activeRoom.code, peerId, micMuted: next }),
          }).catch(() => {});
        }
      }
      return next;
    });
  }, []);

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => {
      const next = !prev;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = next;
      }
      return next;
    });
  }, []);

  // Ensure leaving / closing browser tab immediately pauses timer on backend
  useEffect(() => {
    const handleUnload = () => {
      const activeRoom = roomRef.current;
      const peerId = myPeerIdRef.current;
      const mode = transportRef.current;
      if (!activeRoom || !peerId) return;

      if (mode === 'local') {
        localPreBetaApi.leave(activeRoom.code, peerId);
        return;
      }
      if (mode === 'node-http' || mode === 'php-http') {
        const urls = httpApiUrls(mode);
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            urls.leave,
            new Blob([JSON.stringify({ code: activeRoom.code, peerId })], {
              type: 'text/plain',
            }),
          );
        }
      }
    };
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
      cleanupRtc();
      stopLocalMedia();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [cleanupRtc, stopLocalMedia, stopPolling]);

  return {
    clientId,
    nick,
    setNick,
    transport,
    quota,
    roomSnapshot,
    myPeerId,
    remainingMs,
    error,
    setError,
    busy,
    wsConnected,
    micMuted,
    deafened,
    hasMicAudio,
    rtcStatus,
    remoteAudioRef,
    issueCodeAndJoin,
    joinRoomByCode,
    leaveRoom,
    sendMessage,
    toggleMicMute,
    toggleDeafen,
  };
}
