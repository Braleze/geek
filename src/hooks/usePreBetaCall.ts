import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PRE_BETA_DURATION_MS,
  normalizePreBetaCode,
  type PreBetaChatMessage,
  type PublicRoomSnapshot,
} from '../utils/preBetaSession';

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

export function usePreBetaCall() {
  const [clientId] = useState<string>(() =>
    typeof window !== 'undefined' ? getOrCreateClientId() : 'gk-ssr-client',
  );
  const [nick, setNickState] = useState<string>(() =>
    typeof window !== 'undefined' ? getInitialNick() : '',
  );
  const [quota, setQuota] = useState<PreBetaQuotaState>({
    status: 'LOADING',
    code: null,
    expiresAt: null,
    remainingMs: PRE_BETA_DURATION_MS,
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

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingJoinRef = useRef<{ code: string; nick: string } | null>(null);
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
      const response = await fetch(
        `/api/prebeta/status?clientId=${encodeURIComponent(clientId)}`,
      );
      if (!response.ok) return;
      const data = (await response.json()) as {
        status?: 'AVAILABLE' | 'ACTIVE' | 'EXHAUSTED';
        code?: string | null;
        expiresAt?: number | null;
        remainingMs?: number;
      };
      setQuota({
        status: data.status ?? 'AVAILABLE',
        code: data.code ?? null,
        expiresAt: data.expiresAt ?? null,
        remainingMs:
          typeof data.remainingMs === 'number' ? data.remainingMs : PRE_BETA_DURATION_MS,
      });
    } catch {
      setQuota((prev) => ({
        ...prev,
        status: prev.status === 'LOADING' ? 'AVAILABLE' : prev.status,
      }));
    }
  }, [clientId]);

  useEffect(() => {
    void refreshQuotaStatus();
  }, [refreshQuotaStatus]);

  // Keep quota timer ticking locally when in ACTIVE lobby state
  useEffect(() => {
    if (quota.status !== 'ACTIVE' || !quota.expiresAt) return;
    const interval = window.setInterval(() => {
      const left = Math.max(0, (quota.expiresAt ?? 0) - Date.now());
      setQuota((prev) =>
        left <= 0
          ? { ...prev, status: 'EXHAUSTED', remainingMs: 0 }
          : { ...prev, remainingMs: left },
      );
    }, 1000);
    return () => window.clearInterval(interval);
  }, [quota.status, quota.expiresAt]);

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
      // Headless or mic-permission-denied fallback: keep signaling/chat + audio receiver working
      setHasMicAudio(false);
      return false;
    }
  }, []);

  const sendWs = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

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
      // Allow receiving remote audio even if local microphone is unavailable
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      } catch {
        // Ignore if browser rejects transceiver setup
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWs({
          type: 'rtc:signal',
          signalType: 'ice',
          payload: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteAudioRef.current && remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.muted = deafenedRef.current;
        void remoteAudioRef.current.play().catch(() => {
          // Autoplay guard: user already clicked Join/Call
        });
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
  }, [sendWs]);

  const handleRtcSignal = useCallback(
    async (signalType: string, payload: unknown) => {
      const pc = ensurePeerConnection();
      if (!pc) return;
      try {
        if (signalType === 'offer' && payload) {
          setRtcStatus('negotiating');
          await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendWs({
            type: 'rtc:signal',
            signalType: 'answer',
            payload: answer,
          });
        } else if (signalType === 'answer' && payload) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
        } else if (signalType === 'ice' && payload) {
          await pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit));
        }
      } catch {
        setRtcStatus('text-only');
      }
    },
    [ensurePeerConnection, sendWs],
  );

  const ensureSocketConnected = useCallback((): Promise<WebSocket> => {
    const current = wsRef.current;
    if (current && current.readyState === WebSocket.OPEN) {
      return Promise.resolve(current);
    }

    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/prebeta`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const timeoutId = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error('Таймаут подключения к серверу Pre-Beta связи.'));
        }
      }, 6000);

      ws.onopen = () => {
        window.clearTimeout(timeoutId);
        setWsConnected(true);
        resolve(ws);
      };

      ws.onerror = () => {
        window.clearTimeout(timeoutId);
        setWsConnected(false);
        reject(new Error('Не удалось установить WebSocket-соединение с сервером.'));
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
          if (typeof data.peerId === 'string') {
            setMyPeerId(data.peerId);
          }
          if (snapshot) {
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
          }
          setError(null);
          setBusy(false);
          void refreshQuotaStatus();
          return;
        }

        if (type === 'room:state') {
          const snapshot = data.snapshot as PublicRoomSnapshot | undefined;
          if (snapshot) {
            setRoomSnapshot(snapshot);
            setRemainingMs(snapshot.remainingMs);
            if (snapshot.participants.length < 2) {
              cleanupRtc();
              setRtcStatus('waiting-peer');
            } else if (!snapshot.participants.some((p) => p.hasAudio)) {
              setRtcStatus((prev) => (prev === 'connected' ? 'connected' : 'text-only'));
            }
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
          void (async () => {
            const pc = ensurePeerConnection();
            if (!pc) return;
            try {
              if (localStreamRef.current) {
                setRtcStatus('negotiating');
              } else {
                setRtcStatus('text-only');
              }
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendWs({
                type: 'rtc:signal',
                signalType: 'offer',
                payload: offer,
              });
              window.setTimeout(() => {
                setRtcStatus((prev) => (prev === 'negotiating' ? 'text-only' : prev));
              }, 5000);
            } catch {
              setRtcStatus('text-only');
            }
          })();
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
  }, [cleanupRtc, clientId, ensurePeerConnection, handleRtcSignal, refreshQuotaStatus, sendWs, stopLocalMedia]);

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
      } catch (err) {
        setBusy(false);
        setError(err instanceof Error ? err.message : 'Ошибка подключения.');
        return false;
      }
    },
    [acquireMicBestEffort, clientId, ensureSocketConnected],
  );

  const issueCodeAndJoin = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch('/api/prebeta/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        code?: string;
        createdAt?: number;
        expiresAt?: number;
        remainingMs?: number;
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
      });

      await joinRoomByCode(payload.code, nickRef.current || 'Создатель');
    } catch {
      setBusy(false);
      setError('Сервер pre-beta связи недоступен.');
    }
  }, [clientId, joinRoomByCode, refreshQuotaStatus]);

  const leaveRoom = useCallback(() => {
    sendWs({ type: 'room:leave' });
    cleanupRtc();
    stopLocalMedia();
    setRoomSnapshot(null);
    setError(null);
    void refreshQuotaStatus();
  }, [cleanupRtc, refreshQuotaStatus, sendWs, stopLocalMedia]);

  const sendMessage = useCallback(
    (text: string): boolean => {
      const clean = text.trim();
      if (!clean || !roomSnapshot) return false;
      sendWs({ type: 'chat:send', text: clean });
      return true;
    },
    [roomSnapshot, sendWs],
  );

  const toggleMicMute = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getAudioTracks()) {
          track.enabled = !next;
        }
      }
      sendWs({ type: 'peer:update', micMuted: next });
      return next;
    });
  }, [sendWs]);

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => {
      const next = !prev;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = next;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      cleanupRtc();
      stopLocalMedia();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [cleanupRtc, stopLocalMedia]);

  return {
    clientId,
    nick,
    setNick,
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
