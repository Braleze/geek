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
import {
  RELAY_DISCONNECT_GRACE_MS,
  RELAY_FALLBACK_DELAY_MS,
  RELAY_SAMPLE_RATE,
  computePcmPlaybackSlot,
  createResamplerState,
  decodeBase64ToFloat32,
  encodeInt16ToBase64,
  isWebRtcAudioLive,
  resampleFloat32ToInt16,
  type ResamplerState,
} from '../utils/preBetaAudio';

const CLIENT_ID_STORAGE_KEY = 'geek_prebeta_client_id_v1';
const NICK_STORAGE_KEY = 'geek_prebeta_nick_v1';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
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

export type PreBetaAudioMode = 'idle' | 'webrtc' | 'relay';

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
  const [audioMode, setAudioMode] = useState<PreBetaAudioMode>('idle');
  const [audioUnlockNeeded, setAudioUnlockNeeded] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);

  const transportRef = useRef<PreBetaTransportKind>('node-ws');
  transportRef.current = transport;
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const persistentAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingJoinRef = useRef<{ code: string; nick: string } | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const pollIntervalMsRef = useRef<number>(750);
  const roomRef = useRef<PublicRoomSnapshot | null>(null);
  roomRef.current = roomSnapshot;
  const myPeerIdRef = useRef<string | null>(null);
  myPeerIdRef.current = myPeerId;
  const nickRef = useRef(nick);
  nickRef.current = nick;
  const micMutedRef = useRef(micMuted);
  micMutedRef.current = micMuted;
  const deafenedRef = useRef(deafened);
  deafenedRef.current = deafened;
  const rtcStatusRef = useRef<RtcLinkStatus>(rtcStatus);
  rtcStatusRef.current = rtcStatus;
  const audioModeRef = useRef<PreBetaAudioMode>(audioMode);
  audioModeRef.current = audioMode;

  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const signalChainRef = useRef<Promise<void>>(Promise.resolve());
  const webrtcTrackReceivedRef = useRef(false);
  const relayFallbackTimerRef = useRef<number | null>(null);
  const disconnectGraceTimerRef = useRef<number | null>(null);
  const relayActiveRef = useRef(false);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const captureSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const captureProcRef = useRef<ScriptProcessorNode | null>(null);
  const captureMuteGainRef = useRef<GainNode | null>(null);
  const resamplerStateRef = useRef<ResamplerState>(createResamplerState());
  const httpAudioQueueRef = useRef<Int16Array[]>([]);
  const httpAudioLastFlushRef = useRef<number>(0);

  const playCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeRelaySourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const remoteSpeakingTimerRef = useRef<number | null>(null);
  const wsConnectPromiseRef = useRef<Promise<WebSocket> | null>(null);

  const getOrCreateAudioEl = useCallback((): HTMLAudioElement | null => {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!persistentAudioRef.current) {
      const el = new Audio();
      el.autoplay = true;
      el.setAttribute('playsinline', 'true');
      el.volume = 1;
      persistentAudioRef.current = el;
    }
    return persistentAudioRef.current;
  }, []);

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

  // Keep quota timer ticking locally ONLY when NOT paused
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

  const stopRelayPlayback = useCallback(() => {
    for (const src of activeRelaySourcesRef.current) {
      src.onended = null;
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already-stopped source
      }
    }
    activeRelaySourcesRef.current.clear();
    nextPlayTimeRef.current = 0;
  }, []);

  const stopRelayCapture = useCallback(() => {
    relayActiveRef.current = false;
    httpAudioQueueRef.current = [];
    resamplerStateRef.current = createResamplerState();
    if (relayFallbackTimerRef.current !== null) {
      window.clearTimeout(relayFallbackTimerRef.current);
      relayFallbackTimerRef.current = null;
    }
    if (disconnectGraceTimerRef.current !== null) {
      window.clearTimeout(disconnectGraceTimerRef.current);
      disconnectGraceTimerRef.current = null;
    }
    if (captureProcRef.current) {
      captureProcRef.current.onaudioprocess = null;
      try {
        captureProcRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      captureProcRef.current = null;
    }
    if (captureSourceRef.current) {
      try {
        captureSourceRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      captureSourceRef.current = null;
    }
    if (captureMuteGainRef.current) {
      try {
        captureMuteGainRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      captureMuteGainRef.current = null;
    }
    if (captureCtxRef.current) {
      void captureCtxRef.current.close().catch(() => {});
      captureCtxRef.current = null;
    }
  }, []);

  const sendSignalOutbound = useCallback(
    async (signalType: 'offer' | 'answer' | 'ice' | 'audio', payload: unknown) => {
      const mode = transportRef.current;
      const roomCode = roomRef.current?.code;
      const peerId = myPeerIdRef.current;

      if (mode === 'node-ws') {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          if (signalType === 'audio' && payload && typeof payload === 'object') {
            const p = payload as { sr?: number; data?: string };
            ws.send(JSON.stringify({ type: 'audio:frame', sr: p.sr ?? RELAY_SAMPLE_RATE, data: p.data ?? '' }));
          } else {
            ws.send(JSON.stringify({ type: 'rtc:signal', signalType, payload }));
          }
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

  const startRelayCapture = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream || captureProcRef.current) return;
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      captureCtxRef.current = ctx;
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      const muteGain = ctx.createGain();
      muteGain.gain.value = 0;

      captureSourceRef.current = source;
      captureProcRef.current = processor;
      captureMuteGainRef.current = muteGain;
      resamplerStateRef.current = createResamplerState();
      httpAudioQueueRef.current = [];
      httpAudioLastFlushRef.current = performance.now();

      processor.onaudioprocess = (event) => {
        if (!relayActiveRef.current || audioModeRef.current === 'webrtc' || micMutedRef.current) return;
        if ((roomRef.current?.participants.length ?? 0) < 2) return;
        const input = event.inputBuffer.getChannelData(0);
        const { pcm, peak } = resampleFloat32ToInt16(
          input,
          ctx.sampleRate,
          RELAY_SAMPLE_RATE,
          resamplerStateRef.current,
        );
        if (peak < 0.0003 || pcm.length === 0) return;

        const mode = transportRef.current;
        if (mode === 'node-ws') {
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'audio:frame',
                sr: RELAY_SAMPLE_RATE,
                data: encodeInt16ToBase64(pcm),
              }),
            );
          }
          return;
        }

        // Batch frames (~160ms) for HTTP/local transport so we don't flood requests
        httpAudioQueueRef.current.push(pcm.slice());
        const now = performance.now();
        if (now - httpAudioLastFlushRef.current >= 160) {
          httpAudioLastFlushRef.current = now;
          const chunks = httpAudioQueueRef.current.splice(0);
          let totalLen = 0;
          for (const c of chunks) totalLen += c.length;
          if (totalLen > 0) {
            const merged = new Int16Array(totalLen);
            let offset = 0;
            for (const c of chunks) {
              merged.set(c, offset);
              offset += c.length;
            }
            void sendSignalOutbound('audio', {
              sr: RELAY_SAMPLE_RATE,
              data: encodeInt16ToBase64(merged),
            });
          }
        }
      };

      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(ctx.destination);
    } catch {
      // Ignore WebAudio init error
    }
  }, [sendSignalOutbound]);

  const switchToWebRtcAudio = useCallback(() => {
    stopRelayCapture();
    stopRelayPlayback();
    audioModeRef.current = 'webrtc';
    setAudioMode('webrtc');
    rtcStatusRef.current = 'connected';
    setRtcStatus('connected');
    if (persistentAudioRef.current) {
      persistentAudioRef.current.muted = deafenedRef.current;
      if (remoteStreamRef.current && persistentAudioRef.current.paused) {
        void persistentAudioRef.current.play().catch(() => {
          setAudioUnlockNeeded(true);
        });
      }
    }
  }, [stopRelayCapture, stopRelayPlayback]);

  const activateRelayFallback = useCallback(() => {
    if (!roomRef.current || roomRef.current.participants.length < 2) return;
    if (isWebRtcAudioLive(pcRef.current, webrtcTrackReceivedRef.current)) {
      switchToWebRtcAudio();
      return;
    }
    relayActiveRef.current = true;
    audioModeRef.current = 'relay';
    setAudioMode('relay');
    rtcStatusRef.current = 'connected';
    setRtcStatus('connected');
    // Strictly mute WebRTC element while Relay PCM is active so two paths never overlap
    if (persistentAudioRef.current) {
      persistentAudioRef.current.muted = true;
    }
    if (localStreamRef.current) {
      startRelayCapture();
    }
  }, [startRelayCapture, switchToWebRtcAudio]);

  const scheduleRelayFallback = useCallback(() => {
    if (audioModeRef.current === 'webrtc' || isWebRtcAudioLive(pcRef.current, webrtcTrackReceivedRef.current)) {
      return;
    }
    if (relayFallbackTimerRef.current !== null) {
      window.clearTimeout(relayFallbackTimerRef.current);
    }
    relayFallbackTimerRef.current = window.setTimeout(() => {
      relayFallbackTimerRef.current = null;
      activateRelayFallback();
    }, RELAY_FALLBACK_DELAY_MS);
  }, [activateRelayFallback]);

  const handleIncomingAudioFrame = useCallback(
    (sr: number, b64Data: string) => {
      if (deafenedRef.current || !b64Data) return;
      if (
        audioModeRef.current === 'webrtc' ||
        isWebRtcAudioLive(pcRef.current, webrtcTrackReceivedRef.current)
      ) {
        return;
      }

      const samples = decodeBase64ToFloat32(b64Data);
      if (!samples || samples.length === 0) return;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!playCtxRef.current || playCtxRef.current.state === 'closed') {
        playCtxRef.current = new AudioCtx();
        nextPlayTimeRef.current = 0;
      }
      const ctx = playCtxRef.current;

      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {
          setAudioUnlockNeeded(true);
        });
      }
      if (ctx.state === 'suspended') {
        setAudioUnlockNeeded(true);
        return;
      }

      try {
        const buffer = ctx.createBuffer(1, samples.length, sr || RELAY_SAMPLE_RATE);
        buffer.copyToChannel(samples, 0);

        const now = ctx.currentTime;
        const slot = computePcmPlaybackSlot(now, nextPlayTimeRef.current, buffer.duration);
        if (slot.action === 'drop') {
          return;
        }
        if (slot.action === 'reset-and-schedule') {
          stopRelayPlayback();
        }

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        activeRelaySourcesRef.current.add(src);
        src.onended = () => {
          activeRelaySourcesRef.current.delete(src);
        };

        src.start(slot.startAt);
        nextPlayTimeRef.current = slot.nextPlayTime;

        relayActiveRef.current = true;
        if (persistentAudioRef.current) {
          persistentAudioRef.current.muted = true;
        }
        if (audioModeRef.current !== 'relay') {
          audioModeRef.current = 'relay';
          setAudioMode('relay');
        }
        if (rtcStatusRef.current !== 'connected') {
          rtcStatusRef.current = 'connected';
          setRtcStatus('connected');
        }
        setRemoteSpeaking(true);
        if (remoteSpeakingTimerRef.current !== null) {
          window.clearTimeout(remoteSpeakingTimerRef.current);
        }
        remoteSpeakingTimerRef.current = window.setTimeout(() => {
          setRemoteSpeaking(false);
        }, 380);
      } catch {
        // Ignore transient playback error
      }
    },
    [stopRelayPlayback],
  );

  const attachRemoteStream = useCallback(
    (stream: MediaStream) => {
      remoteStreamRef.current = stream;
      const el = getOrCreateAudioEl();
      if (!el) return;
      const sameStream = el.srcObject === stream;
      if (!sameStream) {
        el.srcObject = stream;
      }
      el.muted = audioModeRef.current === 'relay' ? true : deafenedRef.current;
      el.volume = 1;
      if (!sameStream || el.paused) {
        const playPromise = el.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              setAudioUnlockNeeded(false);
            })
            .catch(() => {
              setAudioUnlockNeeded(true);
            });
        }
      }
    },
    [getOrCreateAudioEl],
  );

  const unlockRemoteAudio = useCallback(() => {
    setAudioUnlockNeeded(false);
    const el = getOrCreateAudioEl();
    if (el && remoteStreamRef.current) {
      if (el.srcObject !== remoteStreamRef.current) {
        el.srcObject = remoteStreamRef.current;
      }
      el.muted = audioModeRef.current === 'relay' ? true : deafenedRef.current;
      void el.play().catch(() => {});
    }
    if (playCtxRef.current && playCtxRef.current.state === 'suspended') {
      void playCtxRef.current.resume().catch(() => {});
    }
    if (captureCtxRef.current && captureCtxRef.current.state === 'suspended') {
      void captureCtxRef.current.resume().catch(() => {});
    }
  }, [getOrCreateAudioEl]);

  const cleanupRtc = useCallback(() => {
    stopRelayCapture();
    stopRelayPlayback();
    pendingIceRef.current = [];
    webrtcTrackReceivedRef.current = false;
    remoteStreamRef.current = null;
    if (remoteSpeakingTimerRef.current !== null) {
      window.clearTimeout(remoteSpeakingTimerRef.current);
      remoteSpeakingTimerRef.current = null;
    }
    setRemoteSpeaking(false);
    setAudioUnlockNeeded(false);
    audioModeRef.current = 'idle';
    setAudioMode('idle');

    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (persistentAudioRef.current) {
      persistentAudioRef.current.srcObject = null;
    }
    if (playCtxRef.current) {
      void playCtxRef.current.close().catch(() => {});
      playCtxRef.current = null;
      nextPlayTimeRef.current = 0;
    }
    rtcStatusRef.current = 'idle';
    setRtcStatus('idle');
  }, [stopRelayCapture, stopRelayPlayback]);

  const stopLocalMedia = useCallback(() => {
    stopRelayCapture();
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    setHasMicAudio(false);
  }, [stopRelayCapture]);

  const acquireMicBestEffort = useCallback(async (): Promise<boolean> => {
    if (localStreamRef.current) {
      setHasMicAudio(true);
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
      for (const track of stream.getAudioTracks()) {
        track.enabled = !micMutedRef.current;
      }
      localStreamRef.current = stream;
      setHasMicAudio(true);
      return true;
    } catch {
      setHasMicAudio(false);
      return false;
    }
  }, []);

  const ensurePeerConnection = useCallback(
    (forceFresh: boolean = false) => {
      if (forceFresh && pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
        pcRef.current = null;
        pendingIceRef.current = [];
        webrtcTrackReceivedRef.current = false;
      }
      if (pcRef.current && pcRef.current.connectionState !== 'closed' && pcRef.current.connectionState !== 'failed') {
        return pcRef.current;
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (typeof RTCPeerConnection === 'undefined') {
        activateRelayFallback();
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

      const evaluateRtcReadiness = () => {
        const state = pc.connectionState;
        const iceState = pc.iceConnectionState;

        if (isWebRtcAudioLive(pc, webrtcTrackReceivedRef.current)) {
          if (disconnectGraceTimerRef.current !== null) {
            window.clearTimeout(disconnectGraceTimerRef.current);
            disconnectGraceTimerRef.current = null;
          }
          switchToWebRtcAudio();
          return;
        }

        if (state === 'connected') {
          if (disconnectGraceTimerRef.current !== null) {
            window.clearTimeout(disconnectGraceTimerRef.current);
            disconnectGraceTimerRef.current = null;
          }
          if (relayFallbackTimerRef.current !== null) {
            window.clearTimeout(relayFallbackTimerRef.current);
            relayFallbackTimerRef.current = null;
          }
          rtcStatusRef.current = 'connected';
          setRtcStatus('connected');
          return;
        }

        if (state === 'failed' || iceState === 'failed') {
          activateRelayFallback();
          return;
        }

        if (state === 'disconnected' || iceState === 'disconnected') {
          if (disconnectGraceTimerRef.current === null && audioModeRef.current !== 'relay') {
            disconnectGraceTimerRef.current = window.setTimeout(() => {
              disconnectGraceTimerRef.current = null;
              if (
                pcRef.current === pc &&
                !isWebRtcAudioLive(pc, webrtcTrackReceivedRef.current)
              ) {
                activateRelayFallback();
              }
            }, RELAY_DISCONNECT_GRACE_MS);
          }
          return;
        }

        if (state === 'connecting' || state === 'new') {
          if (!relayActiveRef.current && audioModeRef.current !== 'webrtc') {
            rtcStatusRef.current = 'negotiating';
            setRtcStatus('negotiating');
          }
        }
      };

      pc.ontrack = (event) => {
        const remoteStream =
          (event.streams && event.streams[0]) || new MediaStream([event.track]);
        webrtcTrackReceivedRef.current = true;
        attachRemoteStream(remoteStream);
        evaluateRtcReadiness();
      };

      pc.onconnectionstatechange = evaluateRtcReadiness;
      pc.oniceconnectionstatechange = evaluateRtcReadiness;

      return pc;
    },
    [activateRelayFallback, attachRemoteStream, sendSignalOutbound, switchToWebRtcAudio],
  );

  const flushPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    if (!pc.remoteDescription) return;
    const list = pendingIceRef.current.splice(0);
    for (const candidateInit of list) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
      } catch {
        // Ignore individual stale candidate
      }
    }
  }, []);

  const initiateRtcOffer = useCallback(
    async (forceFresh: boolean = false) => {
      const pc = ensurePeerConnection(forceFresh);
      scheduleRelayFallback();
      if (!pc) return;
      try {
        if (!relayActiveRef.current) {
          setRtcStatus('negotiating');
        }
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignalOutbound('offer', offer);
      } catch {
        activateRelayFallback();
      }
    },
    [activateRelayFallback, ensurePeerConnection, scheduleRelayFallback, sendSignalOutbound],
  );

  const handleRtcSignal = useCallback(
    (signalType: string, payload: unknown) => {
      if (signalType === 'audio' && payload && typeof payload === 'object') {
        const p = payload as { sr?: unknown; data?: unknown };
        if (typeof p.data === 'string') {
          handleIncomingAudioFrame(
            typeof p.sr === 'number' ? p.sr : RELAY_SAMPLE_RATE,
            p.data,
          );
        }
        return;
      }

      signalChainRef.current = signalChainRef.current
        .then(async () => {
          if (signalType === 'initiate') {
            await initiateRtcOffer(true);
            return;
          }
          const pc = ensurePeerConnection(false);
          if (!pc) return;

          if (signalType === 'offer' && payload) {
            if (!relayActiveRef.current && audioModeRef.current !== 'webrtc') {
              rtcStatusRef.current = 'negotiating';
              setRtcStatus('negotiating');
            }
            scheduleRelayFallback();
            if (pc.signalingState !== 'stable') {
              try {
                await pc.setLocalDescription({ type: 'rollback' });
              } catch {
                // Ignore if rollback not supported
              }
            }
            await pc.setRemoteDescription(
              new RTCSessionDescription(payload as RTCSessionDescriptionInit),
            );
            await flushPendingIce(pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignalOutbound('answer', answer);
          } else if (signalType === 'answer' && payload) {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(
                new RTCSessionDescription(payload as RTCSessionDescriptionInit),
              );
              await flushPendingIce(pc);
            }
          } else if (signalType === 'ice' && payload) {
            const cand = payload as RTCIceCandidateInit;
            if (!pc.remoteDescription) {
              pendingIceRef.current.push(cand);
            } else {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
          }
        })
        .catch(() => {
          activateRelayFallback();
        });
    },
    [
      activateRelayFallback,
      ensurePeerConnection,
      flushPendingIce,
      handleIncomingAudioFrame,
      initiateRtcOffer,
      scheduleRelayFallback,
      sendSignalOutbound,
    ],
  );

  const retryMicPermission = useCallback(async () => {
    const ok = await acquireMicBestEffort();
    if (!ok || !localStreamRef.current) {
      setError('Браузер не дал доступ к микрофону. Разрешите микрофон в адресной строке браузера.');
      return false;
    }
    setError(null);

    const mode = transportRef.current;
    const activeRoom = roomRef.current;
    const peerId = myPeerIdRef.current;

    if (mode === 'node-ws') {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'peer:update', hasAudio: true }));
      }
    } else if (activeRoom && peerId) {
      if (mode === 'local') {
        localPreBetaApi.updatePeer(activeRoom.code, peerId, undefined, true);
      } else {
        const urls = httpApiUrls(mode);
        void fetch(urls.peer, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: activeRoom.code, peerId, hasAudio: true }),
        }).catch(() => {});
      }
    }

    if (activeRoom && activeRoom.participants.length === 2) {
      if (relayActiveRef.current) {
        startRelayCapture();
      }
      const pc = pcRef.current;
      if (pc && pc.connectionState !== 'closed') {
        try {
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          const senders = pc.getSenders();
          const audioSender = senders.find((s) => s.track === null || s.track?.kind === 'audio');
          const transceivers = pc.getTransceivers();
          const audioTrans = transceivers.find(
            (t) => t.receiver.track?.kind === 'audio' || t.sender === audioSender,
          );
          if (audioTrans && audioTrack) {
            audioTrans.direction = 'sendrecv';
            await audioTrans.sender.replaceTrack(audioTrack);
          } else if (audioTrack) {
            pc.addTrack(audioTrack, localStreamRef.current);
          }
          await initiateRtcOffer(false);
        } catch {
          activateRelayFallback();
        }
      }
    }
    return true;
  }, [acquireMicBestEffort, activateRelayFallback, initiateRtcOffer, startRelayCapture]);

  const applyJoinedSnapshot = useCallback(
    (peerId: string, snapshot: PublicRoomSnapshot) => {
      setMyPeerId(peerId);
      setRoomSnapshot(snapshot);
      setRemainingMs(snapshot.remainingMs);
      if (snapshot.participants.length < 2) {
        rtcStatusRef.current = 'waiting-peer';
        setRtcStatus('waiting-peer');
        audioModeRef.current = 'idle';
        setAudioMode('idle');
      } else if (audioModeRef.current === 'idle') {
        rtcStatusRef.current = 'negotiating';
        setRtcStatus('negotiating');
        scheduleRelayFallback();
      }
      setError(null);
      setBusy(false);
      void refreshQuotaStatus();
    },
    [refreshQuotaStatus, scheduleRelayFallback],
  );

  const applyPolledState = useCallback(
    (snapshot: PublicRoomSnapshot, signals: QueuedSignal[] = []) => {
      setRoomSnapshot(snapshot);
      setRemainingMs(snapshot.remainingMs);
      if (snapshot.participants.length < 2) {
        cleanupRtc();
        rtcStatusRef.current = 'waiting-peer';
        setRtcStatus('waiting-peer');
      } else if (rtcStatusRef.current === 'waiting-peer' || rtcStatusRef.current === 'idle') {
        rtcStatusRef.current = 'negotiating';
        setRtcStatus('negotiating');
        scheduleRelayFallback();
      }
      for (const sig of signals) {
        handleRtcSignal(sig.signalType, sig.payload);
      }
    },
    [cleanupRtc, handleRtcSignal, scheduleRelayFallback],
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

          // Dynamically speed up polling (260ms) when 2 peers are relaying PCM audio over HTTP
          const wantFastPoll = data.snapshot.participants.length >= 2 && relayActiveRef.current;
          const desiredMs = wantFastPoll ? 260 : 750;
          if (desiredMs !== pollIntervalMsRef.current) {
            pollIntervalMsRef.current = desiredMs;
            startHttpPolling(mode, code, peerId);
          }
        } catch {
          // Transient poll hiccup: keep trying on next tick
        }
      };

      pollTimerRef.current = window.setInterval(() => {
        void pollOnce();
      }, pollIntervalMsRef.current);
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
    if (wsConnectPromiseRef.current && current && current.readyState === WebSocket.CONNECTING) {
      return wsConnectPromiseRef.current;
    }
    if (current && current.readyState !== WebSocket.CLOSED) {
      try {
        current.close();
      } catch {
        // Ignore close error
      }
      wsRef.current = null;
    }

    const promise = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(buildWsUrl());
      wsRef.current = ws;

      const timeoutId = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          wsConnectPromiseRef.current = null;
          ws.close();
          reject(new Error('WS_UNAVAILABLE'));
        }
      }, 3500);

      ws.onopen = () => {
        window.clearTimeout(timeoutId);
        wsConnectPromiseRef.current = null;
        setWsConnected(true);
        resolve(ws);
      };

      ws.onerror = () => {
        window.clearTimeout(timeoutId);
        wsConnectPromiseRef.current = null;
        setWsConnected(false);
        reject(new Error('WS_UNAVAILABLE'));
      };

      ws.onclose = () => {
        wsConnectPromiseRef.current = null;
        setWsConnected(false);
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
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
          handleRtcSignal('initiate', null);
          return;
        }

        if (type === 'rtc:signal') {
          handleRtcSignal(String(data.signalType ?? ''), data.payload);
          return;
        }

        if (type === 'audio:frame') {
          const sr = typeof data.sr === 'number' ? data.sr : RELAY_SAMPLE_RATE;
          const b64 = typeof data.data === 'string' ? data.data : '';
          handleIncomingAudioFrame(sr, b64);
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
    wsConnectPromiseRef.current = promise;
    return promise;
  }, [
    applyJoinedSnapshot,
    applyPolledState,
    cleanupRtc,
    clientId,
    handleIncomingAudioFrame,
    handleRtcSignal,
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
      pollIntervalMsRef.current = 400;
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

      // Warm up AudioContext synchronously inside user click gesture so autoplay never blocks audio!
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx && !playCtxRef.current) {
          playCtxRef.current = new AudioCtx();
        }
        if (playCtxRef.current?.state === 'suspended') {
          void playCtxRef.current.resume().catch(() => {});
        }
      } catch {
        // Ignore AudioContext warmup error
      }

      cleanupRtc();
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
    [acquireMicBestEffort, cleanupRtc, clientId, ensureSocketConnected, joinViaHttp],
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
      if (persistentAudioRef.current) {
        persistentAudioRef.current.muted =
          audioModeRef.current === 'relay' ? true : next;
      }
      if (next) {
        stopRelayPlayback();
      } else {
        unlockRemoteAudio();
      }
      return next;
    });
  }, [stopRelayPlayback, unlockRemoteAudio]);

  // Ensure leaving / closing browser tab immediately pauses this client's timer on backend
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
    audioMode,
    audioUnlockNeeded,
    remoteSpeaking,
    issueCodeAndJoin,
    joinRoomByCode,
    leaveRoom,
    sendMessage,
    toggleMicMute,
    toggleDeafen,
    unlockRemoteAudio,
    retryMicPermission,
  };
}
