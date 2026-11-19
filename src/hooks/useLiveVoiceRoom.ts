import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveVoicePublicPeer } from '../utils/liveVoiceRoom';
import {
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
import { liveVoiceHttpUrls } from '../utils/previewTransport';
import {
  joinLocalBroadcastVoiceRoom,
  type LocalVoiceSession,
} from '../utils/liveVoiceLocalTransport';

import {
  DEFAULT_ICE_SERVERS,
  computeAdaptivePollMs,
  mergeIceServers,
} from '../utils/hostBudget';

export type LiveVoiceAudioMode = 'idle' | 'waiting' | 'webrtc' | 'relay' | 'loopback';
export type LiveVoiceTransportMode = 'ws' | 'http-node' | 'http-php' | 'local' | null;

function buildLiveVoiceWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = window.location.pathname.endsWith('/')
    ? window.location.pathname
    : window.location.pathname.replace(/[^/]*$/, '');
  const cleanBase = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return `${protocol}//${window.location.host}${cleanBase}ws/voice`;
}

export interface RemoteVideoEntry {
  peerId: string;
  stream: MediaStream;
}

export function useLiveVoiceRoom({
  preferredBackend,
  onUnauthorized,
}: {
  preferredBackend?: 'node' | 'php' | 'local';
  onUnauthorized?: () => void;
} = {}) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [peers, setPeers] = useState<LiveVoicePublicPeer[]>([]);
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [hasMicAudio, setHasMicAudio] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const [screenActive, setScreenActive] = useState(false);
  const [localCamStream, setLocalCamStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteVideoPeers, setRemoteVideoPeers] = useState<RemoteVideoEntry[]>([]);
  const [loopbackActive, setLoopbackActive] = useState(false);
  const [audioMode, setAudioMode] = useState<LiveVoiceAudioMode>('idle');
  const [transportMode, setTransportMode] = useState<LiveVoiceTransportMode>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [audioUnlockNeeded, setAudioUnlockNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;
  const preferredBackendRef = useRef<'node' | 'php' | 'local' | undefined>(preferredBackend);
  preferredBackendRef.current = preferredBackend;

  const connectedRef = useRef(false);
  connectedRef.current = connected;
  const transportRef = useRef<'ws' | 'http' | 'local'>('ws');
  const httpBackendRef = useRef<'node' | 'php'>(preferredBackend === 'php' ? 'php' : 'node');
  if (!connectedRef.current && (preferredBackend === 'php' || preferredBackend === 'node')) {
    httpBackendRef.current = preferredBackend;
  }
  const tokenRef = useRef<string | null>(null);
  const joinedNickRef = useRef<string>('Вы (Гость)');
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectPromiseRef = useRef<Promise<WebSocket> | null>(null);
  const localSessionRef = useRef<LocalVoiceSession | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const pollSessionRef = useRef<number>(0);
  const pollIntervalMsRef = useRef<number>(700);
  const pollKickRef = useRef<(() => void) | null>(null);
  const lastActivityAtRef = useRef<number>(0);
  const iceServersRef = useRef<RTCIceServer[]>([...DEFAULT_ICE_SERVERS]);
  const myPeerIdRef = useRef<string | null>(null);
  myPeerIdRef.current = myPeerId;
  const peersRef = useRef<LiveVoicePublicPeer[]>([]);
  peersRef.current = peers;

  const micMutedRef = useRef(false);
  micMutedRef.current = micMuted;
  const deafenedRef = useRef(false);
  deafenedRef.current = deafened;
  const camActiveRef = useRef(false);
  camActiveRef.current = camActive;
  const screenActiveRef = useRef(false);
  screenActiveRef.current = screenActive;
  const speakingRef = useRef(false);
  speakingRef.current = speaking;
  const loopbackActiveRef = useRef(false);
  loopbackActiveRef.current = loopbackActive;
  const audioModeRef = useRef<LiveVoiceAudioMode>('idle');
  audioModeRef.current = audioMode;

  const localMicStreamRef = useRef<MediaStream | null>(null);
  const localCamStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);

  // WebRTC multi-peer mesh state
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerAudioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const peerAudioStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const peerRemoteVideoRef = useRef<Map<string, MediaStream>>(new Map());
  const peerTracksReceivedRef = useRef<Set<string>>(new Set());
  const peerPendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const peerSignalChainsRef = useRef<Map<string, Promise<void>>>(new Map());

  // Audio capture / VAD / PCM relay / Loopback state
  const captureCtxRef = useRef<AudioContext | null>(null);
  const captureSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const captureProcRef = useRef<ScriptProcessorNode | null>(null);
  const captureMuteGainRef = useRef<GainNode | null>(null);
  const loopbackDelayRef = useRef<DelayNode | null>(null);
  const loopbackGainRef = useRef<GainNode | null>(null);
  const resamplerStateRef = useRef<ResamplerState>(createResamplerState());
  const httpAudioQueueRef = useRef<Int16Array[]>([]);
  const httpAudioLastFlushRef = useRef<number>(0);
  const lastMeterUiRef = useRef<number>(0);
  const speakingHoldUntilRef = useRef<number>(0);

  // Remote PCM playback state per remote peer
  const playCtxRef = useRef<AudioContext | null>(null);
  const peerPlaybackQueuesRef = useRef<
    Map<string, { nextPlayTime: number; sources: Set<AudioBufferSourceNode> }>
  >(new Map());
  const relayFallbackTimerRef = useRef<number | null>(null);

  const syncRemoteVideosState = useCallback(() => {
    const entries: RemoteVideoEntry[] = [];
    for (const [peerId, stream] of peerRemoteVideoRef.current.entries()) {
      entries.push({ peerId, stream });
    }
    setRemoteVideoPeers(entries);
  }, []);

  const stopPolling = useCallback(() => {
    pollSessionRef.current += 1;
    pollKickRef.current = null;
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const stopLocalSession = useCallback(() => {
    if (localSessionRef.current) {
      localSessionRef.current.leave();
      localSessionRef.current = null;
    }
  }, []);

  const sendRoomUpdate = useCallback(
    (patch: {
      micMuted?: boolean;
      deafened?: boolean;
      hasAudio?: boolean;
      camActive?: boolean;
      screenActive?: boolean;
      speaking?: boolean;
    }) => {
      if (!connectedRef.current) return;
      if (transportRef.current === 'local') {
        localSessionRef.current?.sendUpdate(patch);
        return;
      }
      if (transportRef.current === 'ws') {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'voice:update', ...patch }));
        }
        return;
      }
      const token = tokenRef.current;
      const peerId = myPeerIdRef.current;
      if (!token || !peerId) return;
      void fetch(liveVoiceHttpUrls(httpBackendRef.current).update, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, peerId, ...patch }),
      }).catch(() => {});
    },
    [],
  );

  const sendSignalOutbound = useCallback(
    async (
      toPeerId: string | null,
      signalType: 'offer' | 'answer' | 'ice' | 'audio',
      payload: unknown,
    ) => {
      if (!connectedRef.current) return;
      if (transportRef.current === 'local') {
        const session = localSessionRef.current;
        if (!session) return;
        if (signalType === 'audio' && payload && typeof payload === 'object') {
          const p = payload as { sr?: number; data?: string };
          session.sendPacket(null, {
            type: 'voice:audio',
            fromPeerId: session.peerId,
            sr: p.sr ?? RELAY_SAMPLE_RATE,
            data: p.data ?? '',
          });
        } else if (toPeerId) {
          session.sendPacket(toPeerId, {
            type: 'voice:signal',
            fromPeerId: session.peerId,
            signalType,
            payload,
          });
        }
        return;
      }
      if (transportRef.current === 'ws') {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          if (signalType === 'audio' && payload && typeof payload === 'object') {
            const p = payload as { sr?: number; data?: string };
            ws.send(
              JSON.stringify({
                type: 'voice:audio',
                sr: p.sr ?? RELAY_SAMPLE_RATE,
                data: p.data ?? '',
              }),
            );
          } else if (toPeerId) {
            ws.send(
              JSON.stringify({
                type: 'voice:signal',
                toPeerId,
                signalType,
                payload,
              }),
            );
          }
        }
        return;
      }

      const token = tokenRef.current;
      const peerId = myPeerIdRef.current;
      if (!token || !peerId) return;
      await fetch(liveVoiceHttpUrls(httpBackendRef.current).signal, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          peerId,
          toPeerId,
          signalType,
          payload,
        }),
      }).catch(() => {});
    },
    [],
  );

  const stopAllRelayPlayback = useCallback(() => {
    for (const q of peerPlaybackQueuesRef.current.values()) {
      for (const src of q.sources) {
        src.onended = null;
        try {
          src.stop();
          src.disconnect();
        } catch {
          // Ignore already stopped source
        }
      }
      q.sources.clear();
      q.nextPlayTime = 0;
    }
    peerPlaybackQueuesRef.current.clear();
  }, []);

  const stopPeerRelayPlayback = useCallback((remotePeerId: string) => {
    const q = peerPlaybackQueuesRef.current.get(remotePeerId);
    if (!q) return;
    for (const src of q.sources) {
      src.onended = null;
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore
      }
    }
    q.sources.clear();
    peerPlaybackQueuesRef.current.delete(remotePeerId);
  }, []);

  const teardownMicProcessor = useCallback(() => {
    httpAudioQueueRef.current = [];
    resamplerStateRef.current = createResamplerState();
    if (loopbackGainRef.current) {
      try {
        loopbackGainRef.current.disconnect();
      } catch {
        // Ignore
      }
      loopbackGainRef.current = null;
    }
    if (loopbackDelayRef.current) {
      try {
        loopbackDelayRef.current.disconnect();
      } catch {
        // Ignore
      }
      loopbackDelayRef.current = null;
    }
    if (captureProcRef.current) {
      captureProcRef.current.onaudioprocess = null;
      try {
        captureProcRef.current.disconnect();
      } catch {
        // Ignore
      }
      captureProcRef.current = null;
    }
    if (captureSourceRef.current) {
      try {
        captureSourceRef.current.disconnect();
      } catch {
        // Ignore
      }
      captureSourceRef.current = null;
    }
    if (captureMuteGainRef.current) {
      try {
        captureMuteGainRef.current.disconnect();
      } catch {
        // Ignore
      }
      captureMuteGainRef.current = null;
    }
    if (captureCtxRef.current) {
      void captureCtxRef.current.close().catch(() => {});
      captureCtxRef.current = null;
    }
    setMicLevel(0);
    setSpeaking(false);
  }, []);

  const syncLoopbackAudioGain = useCallback((enabled: boolean, muted: boolean, isDeafened: boolean) => {
    if (loopbackGainRef.current) {
      loopbackGainRef.current.gain.value = enabled && !muted && !isDeafened ? 0.85 : 0;
    }
  }, []);

  const ensureMicProcessor = useCallback(() => {
    const stream = localMicStreamRef.current;
    if (!stream || captureProcRef.current) return;
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

      // Solo loopback delay chain (inactive gain = 0 unless Эхо-тест is toggled on)
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.18;
      const loopbackGain = ctx.createGain();
      loopbackGain.gain.value =
        loopbackActiveRef.current && !micMutedRef.current && !deafenedRef.current ? 0.85 : 0;

      captureSourceRef.current = source;
      captureProcRef.current = processor;
      captureMuteGainRef.current = muteGain;
      loopbackDelayRef.current = delay;
      loopbackGainRef.current = loopbackGain;

      resamplerStateRef.current = createResamplerState();
      httpAudioQueueRef.current = [];
      httpAudioLastFlushRef.current = performance.now();

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const nowPerf = performance.now();

        let sumSq = 0;
        let peak = 0;
        for (let i = 0; i < input.length; i += 1) {
          const v = input[i];
          const abs = Math.abs(v);
          if (abs > peak) peak = abs;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / Math.max(1, input.length));
        const normalizedLevel = micMutedRef.current
          ? 0
          : Math.min(100, Math.round(rms * 380));

        if (nowPerf - lastMeterUiRef.current >= 85) {
          lastMeterUiRef.current = nowPerf;
          setMicLevel(normalizedLevel);
        }

        const isVoiceDetected = !micMutedRef.current && !deafenedRef.current && peak > 0.018;
        if (isVoiceDetected) {
          speakingHoldUntilRef.current = nowPerf + 380;
        }
        const nextSpeaking =
          !micMutedRef.current &&
          !deafenedRef.current &&
          (isVoiceDetected || nowPerf < speakingHoldUntilRef.current);

        if (nextSpeaking !== speakingRef.current) {
          speakingRef.current = nextSpeaking;
          setSpeaking(nextSpeaking);
          sendRoomUpdate({ speaking: nextSpeaking });
        }

        if (
          micMutedRef.current ||
          audioModeRef.current !== 'relay' ||
          peersRef.current.length < 2
        ) {
          return;
        }

        const { pcm, peak: resampledPeak } = resampleFloat32ToInt16(
          input,
          ctx.sampleRate,
          RELAY_SAMPLE_RATE,
          resamplerStateRef.current,
        );
        if (resampledPeak < 0.0003 || pcm.length === 0) return;

        if (transportRef.current === 'ws') {
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'voice:audio',
                sr: RELAY_SAMPLE_RATE,
                data: encodeInt16ToBase64(pcm),
              }),
            );
          }
          return;
        }

        httpAudioQueueRef.current.push(pcm.slice());
        if (nowPerf - httpAudioLastFlushRef.current >= 160) {
          httpAudioLastFlushRef.current = nowPerf;
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
            void sendSignalOutbound(null, 'audio', {
              sr: RELAY_SAMPLE_RATE,
              data: encodeInt16ToBase64(merged),
            });
          }
        }
      };

      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(ctx.destination);

      source.connect(delay);
      delay.connect(loopbackGain);
      loopbackGain.connect(ctx.destination);
    } catch {
      // Ignore WebAudio capture setup error
    }
  }, [sendRoomUpdate, sendSignalOutbound]);

  const stopLocalMedia = useCallback(() => {
    teardownMicProcessor();
    if (localMicStreamRef.current) {
      for (const track of localMicStreamRef.current.getTracks()) {
        track.stop();
      }
      localMicStreamRef.current = null;
    }
    if (localCamStreamRef.current) {
      for (const track of localCamStreamRef.current.getTracks()) {
        track.stop();
      }
      localCamStreamRef.current = null;
    }
    if (localScreenStreamRef.current) {
      for (const track of localScreenStreamRef.current.getTracks()) {
        track.stop();
      }
      localScreenStreamRef.current = null;
    }
    setLocalCamStream(null);
    setLocalScreenStream(null);
    setCamActive(false);
    setScreenActive(false);
    setHasMicAudio(false);
    setLoopbackActive(false);
  }, [teardownMicProcessor]);

  const acquireMicBestEffort = useCallback(async (): Promise<boolean> => {
    if (localMicStreamRef.current) {
      setHasMicAudio(true);
      ensureMicProcessor();
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
      localMicStreamRef.current = stream;
      setHasMicAudio(true);
      ensureMicProcessor();
      return true;
    } catch {
      setHasMicAudio(false);
      return false;
    }
  }, [ensureMicProcessor]);

  const evaluateRoomAudioMode = useCallback(() => {
    if (loopbackActiveRef.current) {
      audioModeRef.current = 'loopback';
      setAudioMode('loopback');
      return;
    }
    if (!connectedRef.current) {
      audioModeRef.current = 'idle';
      setAudioMode('idle');
      return;
    }
    const remoteCount = Math.max(0, peersRef.current.length - 1);
    if (remoteCount === 0) {
      audioModeRef.current = 'waiting';
      setAudioMode('waiting');
      return;
    }
    let anyWebRtcLive = false;
    for (const [remotePeerId, pc] of peerConnectionsRef.current.entries()) {
      if (isWebRtcAudioLive(pc, peerTracksReceivedRef.current.has(remotePeerId))) {
        anyWebRtcLive = true;
        break;
      }
    }
    if (anyWebRtcLive) {
      if (relayFallbackTimerRef.current !== null) {
        window.clearTimeout(relayFallbackTimerRef.current);
        relayFallbackTimerRef.current = null;
      }
      stopAllRelayPlayback();
      for (const el of peerAudioElsRef.current.values()) {
        el.muted = deafenedRef.current;
      }
      audioModeRef.current = 'webrtc';
      setAudioMode('webrtc');
      return;
    }
    if (audioModeRef.current === 'relay') {
      return;
    }
    audioModeRef.current = 'waiting';
    setAudioMode('waiting');
  }, [stopAllRelayPlayback]);

  const scheduleRelayFallback = useCallback(() => {
    if (!connectedRef.current || peersRef.current.length < 2) return;
    if (audioModeRef.current === 'webrtc' || audioModeRef.current === 'relay') return;
    if (relayFallbackTimerRef.current !== null) {
      window.clearTimeout(relayFallbackTimerRef.current);
    }
    relayFallbackTimerRef.current = window.setTimeout(() => {
      relayFallbackTimerRef.current = null;
      if (!connectedRef.current || peersRef.current.length < 2) return;
      let anyLive = false;
      for (const [remotePeerId, pc] of peerConnectionsRef.current.entries()) {
        if (isWebRtcAudioLive(pc, peerTracksReceivedRef.current.has(remotePeerId))) {
          anyLive = true;
          break;
        }
      }
      if (anyLive) {
        evaluateRoomAudioMode();
        return;
      }
      for (const el of peerAudioElsRef.current.values()) {
        el.muted = true;
      }
      audioModeRef.current = 'relay';
      setAudioMode('relay');
    }, RELAY_FALLBACK_DELAY_MS);
  }, [evaluateRoomAudioMode]);

  const cleanupRemotePeer = useCallback(
    (remotePeerId: string) => {
      peerTracksReceivedRef.current.delete(remotePeerId);
      peerPendingIceRef.current.delete(remotePeerId);
      peerSignalChainsRef.current.delete(remotePeerId);
      stopPeerRelayPlayback(remotePeerId);

      const pc = peerConnectionsRef.current.get(remotePeerId);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.close();
        peerConnectionsRef.current.delete(remotePeerId);
      }

      const audioEl = peerAudioElsRef.current.get(remotePeerId);
      if (audioEl) {
        audioEl.srcObject = null;
        peerAudioElsRef.current.delete(remotePeerId);
      }
      peerAudioStreamsRef.current.delete(remotePeerId);

      if (peerRemoteVideoRef.current.delete(remotePeerId)) {
        syncRemoteVideosState();
      }
    },
    [stopPeerRelayPlayback, syncRemoteVideosState],
  );

  const cleanupAllPeers = useCallback(() => {
    if (relayFallbackTimerRef.current !== null) {
      window.clearTimeout(relayFallbackTimerRef.current);
      relayFallbackTimerRef.current = null;
    }
    stopAllRelayPlayback();
    for (const remotePeerId of Array.from(peerConnectionsRef.current.keys())) {
      cleanupRemotePeer(remotePeerId);
    }
    peerConnectionsRef.current.clear();
    peerAudioElsRef.current.clear();
    peerAudioStreamsRef.current.clear();
    peerRemoteVideoRef.current.clear();
    peerTracksReceivedRef.current.clear();
    peerPendingIceRef.current.clear();
    peerSignalChainsRef.current.clear();
    setRemoteVideoPeers([]);
    if (playCtxRef.current) {
      void playCtxRef.current.close().catch(() => {});
      playCtxRef.current = null;
    }
    setAudioUnlockNeeded(false);
    audioModeRef.current = 'idle';
    setAudioMode('idle');
  }, [cleanupRemotePeer, stopAllRelayPlayback]);

  const attachRemoteMediaTrack = useCallback(
    (remotePeerId: string, track: MediaStreamTrack, streams: readonly MediaStream[]) => {
      if (track.kind === 'audio') {
        const audioStream =
          (streams && streams[0]) || new MediaStream([track]);
        peerAudioStreamsRef.current.set(remotePeerId, audioStream);
        peerTracksReceivedRef.current.add(remotePeerId);

        let el = peerAudioElsRef.current.get(remotePeerId);
        if (!el && typeof Audio !== 'undefined') {
          el = new Audio();
          el.autoplay = true;
          el.setAttribute('playsinline', 'true');
          el.volume = 1;
          peerAudioElsRef.current.set(remotePeerId, el);
        }
        if (el) {
          if (el.srcObject !== audioStream) {
            el.srcObject = audioStream;
          }
          el.muted = audioModeRef.current === 'relay' ? true : deafenedRef.current;
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
      } else if (track.kind === 'video') {
        const videoStream = new MediaStream([track]);
        peerRemoteVideoRef.current.set(remotePeerId, videoStream);
        syncRemoteVideosState();
        track.onended = () => {
          peerRemoteVideoRef.current.delete(remotePeerId);
          syncRemoteVideosState();
        };
      }
    },
    [syncRemoteVideosState],
  );

  const ensurePeerConnection = useCallback(
    (remotePeerId: string, forceFresh: boolean = false): RTCPeerConnection | null => {
      const existing = peerConnectionsRef.current.get(remotePeerId);
      if (forceFresh && existing) {
        cleanupRemotePeer(remotePeerId);
      } else if (existing && existing.connectionState !== 'closed' && existing.connectionState !== 'failed') {
        return existing;
      } else if (existing) {
        cleanupRemotePeer(remotePeerId);
      }

      if (typeof RTCPeerConnection === 'undefined') {
        audioModeRef.current = 'relay';
        setAudioMode('relay');
        return null;
      }

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      peerConnectionsRef.current.set(remotePeerId, pc);

      if (localMicStreamRef.current) {
        for (const track of localMicStreamRef.current.getAudioTracks()) {
          pc.addTrack(track, localMicStreamRef.current);
        }
      } else {
        try {
          pc.addTransceiver('audio', { direction: 'recvonly' });
        } catch {
          // Ignore
        }
      }

      const activeVideoStream = localScreenStreamRef.current ?? localCamStreamRef.current;
      if (activeVideoStream) {
        for (const track of activeVideoStream.getVideoTracks()) {
          pc.addTrack(track, activeVideoStream);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignalOutbound(
            remotePeerId,
            'ice',
            event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
          );
        }
      };

      pc.ontrack = (event) => {
        attachRemoteMediaTrack(remotePeerId, event.track, event.streams);
        evaluateRoomAudioMode();
      };

      const onStateChange = () => {
        if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
          if (audioModeRef.current !== 'webrtc') {
            audioModeRef.current = 'relay';
            setAudioMode('relay');
          }
          return;
        }
        evaluateRoomAudioMode();
      };

      pc.onconnectionstatechange = onStateChange;
      pc.oniceconnectionstatechange = onStateChange;
      return pc;
    },
    [attachRemoteMediaTrack, cleanupRemotePeer, evaluateRoomAudioMode, sendSignalOutbound],
  );

  const flushPendingIceForPeer = useCallback(async (remotePeerId: string, pc: RTCPeerConnection) => {
    if (!pc.remoteDescription) return;
    const queued = peerPendingIceRef.current.get(remotePeerId);
    if (!queued || queued.length === 0) return;
    peerPendingIceRef.current.set(remotePeerId, []);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignore stale candidate
      }
    }
  }, []);

  const initiateRtcOfferToPeer = useCallback(
    async (remotePeerId: string, forceFresh: boolean = false) => {
      const pc = ensurePeerConnection(remotePeerId, forceFresh);
      scheduleRelayFallback();
      if (!pc) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignalOutbound(remotePeerId, 'offer', offer);
      } catch {
        audioModeRef.current = 'relay';
        setAudioMode('relay');
      }
    },
    [ensurePeerConnection, scheduleRelayFallback, sendSignalOutbound],
  );

  const handleIncomingAudioFrame = useCallback(
    (fromPeerId: string, sr: number, b64Data: string) => {
      if (deafenedRef.current || !b64Data || !fromPeerId) return;
      const pc = peerConnectionsRef.current.get(fromPeerId);
      if (isWebRtcAudioLive(pc, peerTracksReceivedRef.current.has(fromPeerId))) {
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

        let queue = peerPlaybackQueuesRef.current.get(fromPeerId);
        if (!queue) {
          queue = { nextPlayTime: 0, sources: new Set() };
          peerPlaybackQueuesRef.current.set(fromPeerId, queue);
        }

        const slot = computePcmPlaybackSlot(ctx.currentTime, queue.nextPlayTime, buffer.duration);
        if (slot.action === 'drop') return;
        if (slot.action === 'reset-and-schedule') {
          stopPeerRelayPlayback(fromPeerId);
          queue = { nextPlayTime: 0, sources: new Set() };
          peerPlaybackQueuesRef.current.set(fromPeerId, queue);
        }

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        queue.sources.add(src);
        src.onended = () => {
          queue?.sources.delete(src);
        };
        src.start(slot.startAt);
        queue.nextPlayTime = slot.nextPlayTime;

        if (!loopbackActiveRef.current && audioModeRef.current !== 'webrtc') {
          audioModeRef.current = 'relay';
          setAudioMode('relay');
        }
      } catch {
        // Ignore transient PCM frame error
      }
    },
    [stopPeerRelayPlayback],
  );

  const handlePeerSignal = useCallback(
    (fromPeerId: string, signalType: string, payload: unknown) => {
      if (!fromPeerId) return;
      const prevChain = peerSignalChainsRef.current.get(fromPeerId) ?? Promise.resolve();
      const nextChain = prevChain
        .then(async () => {
          if (signalType === 'initiate') {
            await initiateRtcOfferToPeer(fromPeerId, true);
            return;
          }
          const pc = ensurePeerConnection(fromPeerId, false);
          if (!pc) return;

          if (signalType === 'offer' && payload) {
            scheduleRelayFallback();
            if (pc.signalingState !== 'stable') {
              try {
                await pc.setLocalDescription({ type: 'rollback' });
              } catch {
                // Ignore
              }
            }
            await pc.setRemoteDescription(
              new RTCSessionDescription(payload as RTCSessionDescriptionInit),
            );
            await flushPendingIceForPeer(fromPeerId, pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignalOutbound(fromPeerId, 'answer', answer);
          } else if (signalType === 'answer' && payload) {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(
                new RTCSessionDescription(payload as RTCSessionDescriptionInit),
              );
              await flushPendingIceForPeer(fromPeerId, pc);
            }
          } else if (signalType === 'ice' && payload) {
            const cand = payload as RTCIceCandidateInit;
            if (!pc.remoteDescription) {
              const list = peerPendingIceRef.current.get(fromPeerId) ?? [];
              list.push(cand);
              peerPendingIceRef.current.set(fromPeerId, list);
            } else {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
          }
        })
        .catch(() => {
          if (audioModeRef.current !== 'webrtc') {
            audioModeRef.current = 'relay';
            setAudioMode('relay');
          }
        });
      peerSignalChainsRef.current.set(fromPeerId, nextChain);
    },
    [ensurePeerConnection, flushPendingIceForPeer, initiateRtcOfferToPeer, scheduleRelayFallback, sendSignalOutbound],
  );

  const handleServerPacket = useCallback(
    (data: Record<string, unknown>) => {
      const type = typeof data.type === 'string' ? data.type : '';
      if (type === 'voice:state' && Array.isArray(data.peers)) {
        const nextPeers = data.peers as LiveVoicePublicPeer[];
        peersRef.current = nextPeers;
        setPeers(nextPeers);
        if (nextPeers.length < 2) {
          stopAllRelayPlayback();
        } else {
          scheduleRelayFallback();
        }
        evaluateRoomAudioMode();
        return;
      }

      if (type === 'voice:rtc-initiate' && typeof data.targetPeerId === 'string') {
        handlePeerSignal(data.targetPeerId, 'initiate', null);
        return;
      }

      if (type === 'voice:signal' && typeof data.fromPeerId === 'string') {
        handlePeerSignal(data.fromPeerId, String(data.signalType ?? ''), data.payload);
        return;
      }

      if (type === 'voice:audio' && typeof data.fromPeerId === 'string') {
        const sr = typeof data.sr === 'number' ? data.sr : RELAY_SAMPLE_RATE;
        const b64 = typeof data.data === 'string' ? data.data : '';
        handleIncomingAudioFrame(data.fromPeerId, sr, b64);
        return;
      }

      if (type === 'voice:peer-left' && typeof data.peerId === 'string') {
        cleanupRemotePeer(data.peerId);
        evaluateRoomAudioMode();
      }
    },
    [
      cleanupRemotePeer,
      evaluateRoomAudioMode,
      handleIncomingAudioFrame,
      handlePeerSignal,
      scheduleRelayFallback,
      stopAllRelayPlayback,
    ],
  );

  const startHttpPolling = useCallback(
    (token: string, initialPeerId: string) => {
      stopPolling();
      const sessionId = pollSessionRef.current;
      let activePeerId = initialPeerId;
      let rejoinAttempts = 0;

      const scheduleNext = () => {
        if (pollSessionRef.current !== sessionId || !connectedRef.current) return;
        pollTimerRef.current = window.setTimeout(() => {
          void pollOnce();
        }, pollIntervalMsRef.current);
      };

      const pollOnce = async () => {
        if (pollSessionRef.current !== sessionId || !connectedRef.current) return;
        try {
          const response = await fetch(liveVoiceHttpUrls(httpBackendRef.current).poll, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, peerId: activePeerId }),
          });
          if (pollSessionRef.current !== sessionId || !connectedRef.current) return;
          const ct = response.headers.get('content-type') || '';
          if (!ct.toLowerCase().includes('application/json')) {
            scheduleNext();
            return;
          }
          const payload = (await response.json()) as {
            ok?: boolean;
            reason?: string;
            message?: string;
            peers?: LiveVoicePublicPeer[];
            signals?: Array<Record<string, unknown>>;
          };
          if (pollSessionRef.current !== sessionId || !connectedRef.current) return;
          if (!payload.ok) {
            if (payload.reason === 'NOT_IN_ROOM' && rejoinAttempts < 2) {
              rejoinAttempts += 1;
              try {
                const rejoinRes = await fetch(liveVoiceHttpUrls(httpBackendRef.current).join, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    token,
                    peerId: activePeerId,
                    nick: joinedNickRef.current,
                    hasAudio: Boolean(localMicStreamRef.current),
                    micMuted: micMutedRef.current,
                    deafened: deafenedRef.current,
                    camActive: camActiveRef.current,
                    screenActive: screenActiveRef.current,
                  }),
                });
                const rejoinCt = rejoinRes.headers.get('content-type') || '';
                if (rejoinCt.toLowerCase().includes('application/json')) {
                  const rejoinData = (await rejoinRes.json()) as {
                    ok?: boolean;
                    peerId?: string;
                    peers?: LiveVoicePublicPeer[];
                    signals?: Array<Record<string, unknown>>;
                  };
                  if (rejoinData.ok && rejoinData.peerId) {
                    activePeerId = rejoinData.peerId;
                    myPeerIdRef.current = rejoinData.peerId;
                    setMyPeerId(rejoinData.peerId);
                    if (Array.isArray(rejoinData.peers)) {
                      peersRef.current = rejoinData.peers;
                      setPeers(rejoinData.peers);
                    }
                    if (Array.isArray(rejoinData.signals)) {
                      for (const sig of rejoinData.signals) {
                        handleServerPacket(sig);
                      }
                    }
                    scheduleNext();
                    return;
                  }
                }
              } catch {
                // Fall through to disconnect
              }
            }
            if (payload.reason === 'UNAUTHORIZED') {
              onUnauthorizedRef.current?.();
            }
            if (payload.reason === 'UNAUTHORIZED' || payload.reason === 'NOT_IN_ROOM') {
              stopPolling();
              cleanupAllPeers();
              stopLocalMedia();
              connectedRef.current = false;
              setConnected(false);
              setTransportMode(null);
              setPeers([]);
              setError(payload.message ?? 'Сессия голосового канала завершена.');
            }
            return;
          }
          rejoinAttempts = 0;
          if (Array.isArray(payload.peers)) {
            if (payload.peers.length !== peersRef.current.length) {
              lastActivityAtRef.current = Date.now();
            }
            peersRef.current = payload.peers;
            setPeers(payload.peers);
            if (payload.peers.length >= 2) {
              scheduleRelayFallback();
            }
            evaluateRoomAudioMode();
          }
          if (Array.isArray(payload.signals) && payload.signals.length > 0) {
            lastActivityAtRef.current = Date.now();
            for (const sig of payload.signals) {
              handleServerPacket(sig);
            }
          }
          let anyNegotiating = false;
          for (const pc of peerConnectionsRef.current.values()) {
            if (pc.connectionState === 'connecting' || pc.connectionState === 'new') {
              anyNegotiating = true;
              break;
            }
          }
          pollIntervalMsRef.current = computeAdaptivePollMs({
            peerCount: payload.peers?.length ?? peersRef.current.length,
            audioMode: audioModeRef.current,
            negotiating: anyNegotiating,
            hidden: typeof document !== 'undefined' && document.hidden,
            hasRecentActivity: Date.now() - lastActivityAtRef.current < 8000,
          });
        } catch {
          // Transient poll glitch
        }
        scheduleNext();
      };

      pollKickRef.current = () => {
        if (pollSessionRef.current !== sessionId || !connectedRef.current) return;
        lastActivityAtRef.current = Date.now();
        if (pollTimerRef.current !== null) {
          window.clearTimeout(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        void pollOnce();
      };

      scheduleNext();
    },
    [
      cleanupAllPeers,
      evaluateRoomAudioMode,
      handleServerPacket,
      scheduleRelayFallback,
      stopLocalMedia,
      stopPolling,
    ],
  );

  // Wake up throttled polling right away when user returns to this tab
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) {
        pollKickRef.current?.();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

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
        // Ignore
      }
      wsRef.current = null;
    }

    const promise = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(buildLiveVoiceWsUrl());
      wsRef.current = ws;

      const timeoutId = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          wsConnectPromiseRef.current = null;
          ws.close();
          reject(new Error('WS_UNAVAILABLE'));
        }
      }, 3000);

      ws.onopen = () => {
        window.clearTimeout(timeoutId);
        wsConnectPromiseRef.current = null;
        resolve(ws);
      };

      ws.onerror = () => {
        window.clearTimeout(timeoutId);
        wsConnectPromiseRef.current = null;
        reject(new Error('WS_UNAVAILABLE'));
      };

      ws.onclose = () => {
        wsConnectPromiseRef.current = null;
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

        if (type === 'voice:joined') {
          const peerId = typeof data.peerId === 'string' ? data.peerId : '';
          const nextPeers = Array.isArray(data.peers) ? (data.peers as LiveVoicePublicPeer[]) : [];
          myPeerIdRef.current = peerId;
          setMyPeerId(peerId);
          peersRef.current = nextPeers;
          setPeers(nextPeers);
          connectedRef.current = true;
          setConnected(true);
          setConnecting(false);
          setTransportMode('ws');
          setSyncNotice(null);
          setError(null);
          if (nextPeers.length >= 2) {
            scheduleRelayFallback();
          }
          evaluateRoomAudioMode();
          return;
        }

        if (type === 'voice:left') {
          connectedRef.current = false;
          setConnected(false);
          setConnecting(false);
          setTransportMode(null);
          setSyncNotice(null);
          setPeers([]);
          cleanupAllPeers();
          return;
        }

        if (type === 'voice:error') {
          setConnecting(false);
          const reason = typeof data.reason === 'string' ? data.reason : '';
          if (reason === 'UNAUTHORIZED') {
            connectedRef.current = false;
            setConnected(false);
            cleanupAllPeers();
            stopLocalMedia();
            onUnauthorizedRef.current?.();
          }
          setError(
            typeof data.message === 'string'
              ? data.message
              : 'Ошибка подключения к голосовому каналу.',
          );
          return;
        }

        handleServerPacket(data);
      };
    });

    wsConnectPromiseRef.current = promise;
    return promise;
  }, [cleanupAllPeers, evaluateRoomAudioMode, handleServerPacket, scheduleRelayFallback, stopLocalMedia]);

  const join = useCallback(
    async (token: string, nick: string = 'Вы (Гость)'): Promise<boolean> => {
      if (!token) {
        setError('Введите секретный код в чат, чтобы открыть живой голосовой канал.');
        return false;
      }

      // Warm up AudioContext synchronously inside user gesture
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx && (!playCtxRef.current || playCtxRef.current.state === 'closed')) {
          playCtxRef.current = new AudioCtx();
        }
        if (playCtxRef.current?.state === 'suspended') {
          void playCtxRef.current.resume().catch(() => {});
        }
      } catch {
        // Ignore AudioContext warmup error
      }

      tokenRef.current = token;
      joinedNickRef.current = nick;
      stopPolling();
      stopLocalSession();
      setConnecting(true);
      setError(null);
      setSyncNotice(null);
      cleanupAllPeers();

      const gotMic = await acquireMicBestEffort();

      const enterLocalRoomFallback = (notice: string): boolean => {
        stopPolling();
        stopLocalSession();
        transportRef.current = 'local';
        setTransportMode('local');
        setSyncNotice(notice);
        const session = joinLocalBroadcastVoiceRoom(
          {
            nick,
            hasAudio: gotMic,
            micMuted: micMutedRef.current,
            deafened: deafenedRef.current,
            camActive: camActiveRef.current,
            screenActive: screenActiveRef.current,
          },
          handleServerPacket,
        );
        localSessionRef.current = session;
        myPeerIdRef.current = session.peerId;
        setMyPeerId(session.peerId);
        peersRef.current = session.peers;
        setPeers(session.peers);
        connectedRef.current = true;
        setConnected(true);
        setConnecting(false);
        setError(null);
        if (session.peers.length >= 2) {
          scheduleRelayFallback();
        }
        evaluateRoomAudioMode();
        return true;
      };

      if (token.startsWith('local-')) {
        return enterLocalRoomFallback(
          'Локальный режим (только этот браузер). Введите секретный код в чат повторно для синхронизации через сервер.',
        );
      }

      if (preferredBackendRef.current !== 'php' && preferredBackendRef.current !== 'local') {
        try {
          const ws = await ensureSocketConnected();
          transportRef.current = 'ws';
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'voice:join',
                token,
                nick,
                hasAudio: gotMic,
                micMuted: micMutedRef.current,
                deafened: deafenedRef.current,
                camActive: camActiveRef.current,
                screenActive: screenActiveRef.current,
              }),
            );
            return true;
          }
        } catch {
          // Fall through cleanly to HTTP polling fallback
        }
      }

      const tryHttpJoin = async (backend: 'node' | 'php') => {
        try {
          const res = await fetch(liveVoiceHttpUrls(backend).join, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              nick,
              hasAudio: gotMic,
              micMuted: micMutedRef.current,
              deafened: deafenedRef.current,
              camActive: camActiveRef.current,
              screenActive: screenActiveRef.current,
            }),
          });
          const ct = res.headers.get('content-type') || '';
          if (!ct.toLowerCase().includes('application/json')) {
            return { payload: null, status: res.status };
          }
          const payload = (await res.json()) as {
            ok?: boolean;
            reason?: string;
            message?: string;
            peerId?: string;
            peers?: LiveVoicePublicPeer[];
            signals?: Array<Record<string, unknown>>;
            iceServers?: unknown;
          };
          return { payload, status: res.status };
        } catch {
          return { payload: null, status: 0 };
        }
      };

      try {
        transportRef.current = 'http';
        pollIntervalMsRef.current = 550;
        const order: Array<'node' | 'php'> =
          preferredBackendRef.current === 'php' ? ['php', 'node'] : ['node', 'php'];
        let activeBackend: 'node' | 'php' = order[0];
        let payload: {
          ok?: boolean;
          reason?: string;
          message?: string;
          peerId?: string;
          peers?: LiveVoicePublicPeer[];
          signals?: Array<Record<string, unknown>>;
          iceServers?: unknown;
        } | null = null;
        let lastStatus = 0;

        for (const candidateBackend of order) {
          const attempt = await tryHttpJoin(candidateBackend);
          lastStatus = attempt.status;
          if (attempt.payload) {
            activeBackend = candidateBackend;
            payload = attempt.payload;
            break;
          }
        }

        if (!payload) {
          return enterLocalRoomFallback(
            lastStatus > 0
              ? `Сервер /api/voice.php не вернул JSON (HTTP ${lastStatus}) — включён локальный режим.`
              : 'Нет связи с сервером /api/voice.php — включён локальный режим.',
          );
        }
        httpBackendRef.current = activeBackend;
        if (!payload.ok || !payload.peerId) {
          if (payload.reason === 'UNAUTHORIZED') {
            setConnecting(false);
            onUnauthorizedRef.current?.();
            setError(payload.message ?? 'Сессия голосового канала недействительна.');
            return false;
          }
          if (payload.reason === 'ROOM_FULL') {
            setConnecting(false);
            setError(payload.message ?? 'Голосовой канал заполнен.');
            return false;
          }
          return enterLocalRoomFallback(
            payload.message ?? 'Сервер голосового канала недоступен — включён локальный режим.',
          );
        }
        if (payload.iceServers) {
          iceServersRef.current = mergeIceServers(payload.iceServers);
        }
        lastActivityAtRef.current = Date.now();
        myPeerIdRef.current = payload.peerId;
        setMyPeerId(payload.peerId);
        const nextPeers = Array.isArray(payload.peers) ? payload.peers : [];
        peersRef.current = nextPeers;
        setPeers(nextPeers);
        connectedRef.current = true;
        setConnected(true);
        setConnecting(false);
        setTransportMode(activeBackend === 'php' ? 'http-php' : 'http-node');
        setSyncNotice(null);
        setError(null);
        if (Array.isArray(payload.signals)) {
          for (const sig of payload.signals) {
            handleServerPacket(sig);
          }
        }
        if (nextPeers.length >= 2) {
          scheduleRelayFallback();
        }
        evaluateRoomAudioMode();
        startHttpPolling(token, payload.peerId);
        return true;
      } catch {
        return enterLocalRoomFallback(
          'Ошибка подключения к серверу /api/voice.php — включён локальный режим.',
        );
      }
    },
    [
      acquireMicBestEffort,
      cleanupAllPeers,
      ensureSocketConnected,
      evaluateRoomAudioMode,
      handleServerPacket,
      scheduleRelayFallback,
      startHttpPolling,
      stopLocalSession,
      stopPolling,
    ],
  );

  const leave = useCallback(() => {
    const token = tokenRef.current;
    const peerId = myPeerIdRef.current;
    stopPolling();

    if (connectedRef.current) {
      if (transportRef.current === 'local') {
        stopLocalSession();
      } else if (transportRef.current === 'ws') {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'voice:leave' }));
        }
      } else if (token && peerId) {
        void fetch(liveVoiceHttpUrls(httpBackendRef.current).leave, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, peerId }),
        }).catch(() => {});
      }
    } else {
      stopLocalSession();
    }

    connectedRef.current = false;
    setConnected(false);
    setConnecting(false);
    setTransportMode(null);
    setSyncNotice(null);
    setMyPeerId(null);
    setPeers([]);
    setError(null);
    cleanupAllPeers();
    stopLocalMedia();
  }, [cleanupAllPeers, stopLocalMedia, stopLocalSession, stopPolling]);

  const toggleMicMute = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      micMutedRef.current = next;
      if (localMicStreamRef.current) {
        for (const track of localMicStreamRef.current.getAudioTracks()) {
          track.enabled = !next;
        }
      }
      if (next && speakingRef.current) {
        speakingRef.current = false;
        setSpeaking(false);
      }
      syncLoopbackAudioGain(loopbackActiveRef.current, next, deafenedRef.current);
      sendRoomUpdate({ micMuted: next, ...(next ? { speaking: false } : {}) });
      return next;
    });
  }, [sendRoomUpdate, syncLoopbackAudioGain]);

  const unlockRemoteAudio = useCallback(() => {
    setAudioUnlockNeeded(false);
    for (const [remotePeerId, el] of peerAudioElsRef.current.entries()) {
      const stream = peerAudioStreamsRef.current.get(remotePeerId);
      if (stream && el.srcObject !== stream) {
        el.srcObject = stream;
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
  }, []);

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => {
      const next = !prev;
      deafenedRef.current = next;
      for (const el of peerAudioElsRef.current.values()) {
        el.muted = audioModeRef.current === 'relay' ? true : next;
      }
      if (next) {
        stopAllRelayPlayback();
        if (speakingRef.current) {
          speakingRef.current = false;
          setSpeaking(false);
        }
      } else {
        unlockRemoteAudio();
      }
      syncLoopbackAudioGain(loopbackActiveRef.current, micMutedRef.current, next);
      sendRoomUpdate({ deafened: next, ...(next ? { speaking: false } : {}) });
      return next;
    });
  }, [sendRoomUpdate, stopAllRelayPlayback, syncLoopbackAudioGain, unlockRemoteAudio]);

  const retryMicPermission = useCallback(async () => {
    const ok = await acquireMicBestEffort();
    if (!ok || !localMicStreamRef.current) {
      setError('Микрофон не найден или доступ к нему заблокирован браузером.');
      return false;
    }
    setError(null);
    sendRoomUpdate({ hasAudio: true });

    const audioTrack = localMicStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      for (const [remotePeerId, pc] of peerConnectionsRef.current.entries()) {
        if (pc.connectionState === 'closed') continue;
        try {
          const audioTrans = pc
            .getTransceivers()
            .find((t) => t.receiver.track?.kind === 'audio' || t.sender.track?.kind === 'audio');
          if (audioTrans) {
            audioTrans.direction = 'sendrecv';
            await audioTrans.sender.replaceTrack(audioTrack);
          } else {
            pc.addTrack(audioTrack, localMicStreamRef.current);
          }
          await initiateRtcOfferToPeer(remotePeerId, false);
        } catch {
          // Ignore individual peer renegotiation failure
        }
      }
    }
    return true;
  }, [acquireMicBestEffort, initiateRtcOfferToPeer, sendRoomUpdate]);

  const toggleLoopback = useCallback(async () => {
    if (loopbackActiveRef.current) {
      loopbackActiveRef.current = false;
      setLoopbackActive(false);
      syncLoopbackAudioGain(false, micMutedRef.current, deafenedRef.current);
      evaluateRoomAudioMode();
      return;
    }
    if (!localMicStreamRef.current) {
      const ok = await acquireMicBestEffort();
      if (!ok) {
        setError('Для Эхо-теста нужен доступ к микрофону в браузере.');
        return;
      }
    }
    setError(null);
    if (captureCtxRef.current && captureCtxRef.current.state === 'suspended') {
      void captureCtxRef.current.resume().catch(() => {});
    }
    loopbackActiveRef.current = true;
    setLoopbackActive(true);
    syncLoopbackAudioGain(true, micMutedRef.current, deafenedRef.current);
    evaluateRoomAudioMode();
  }, [acquireMicBestEffort, evaluateRoomAudioMode, syncLoopbackAudioGain]);

  const syncOutboundVideoTrack = useCallback(
    async (stream: MediaStream | null) => {
      const track = stream?.getVideoTracks()[0] ?? null;
      for (const [remotePeerId, pc] of peerConnectionsRef.current.entries()) {
        if (pc.connectionState === 'closed') continue;
        try {
          const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(track);
          } else if (track && stream) {
            pc.addTrack(track, stream);
            await initiateRtcOfferToPeer(remotePeerId, false);
          }
        } catch {
          // Ignore video renegotiation error
        }
      }
    },
    [initiateRtcOfferToPeer],
  );

  const toggleCamera = useCallback(async () => {
    if (camActiveRef.current) {
      if (localCamStreamRef.current) {
        for (const t of localCamStreamRef.current.getTracks()) t.stop();
        localCamStreamRef.current = null;
      }
      setLocalCamStream(null);
      camActiveRef.current = false;
      setCamActive(false);
      sendRoomUpdate({ camActive: false });
      await syncOutboundVideoTrack(localScreenStreamRef.current);
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setError('Камера недоступна в этом браузере.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 } },
        audio: false,
      });
      localCamStreamRef.current = stream;
      setLocalCamStream(stream);
      camActiveRef.current = true;
      setCamActive(true);
      setError(null);
      sendRoomUpdate({ camActive: true });
      await syncOutboundVideoTrack(localScreenStreamRef.current ?? stream);
    } catch {
      setError('Камера не найдена или доступ отклонён.');
    }
  }, [sendRoomUpdate, syncOutboundVideoTrack]);

  const toggleScreen = useCallback(async () => {
    if (screenActiveRef.current) {
      if (localScreenStreamRef.current) {
        for (const t of localScreenStreamRef.current.getTracks()) t.stop();
        localScreenStreamRef.current = null;
      }
      setLocalScreenStream(null);
      screenActiveRef.current = false;
      setScreenActive(false);
      sendRoomUpdate({ screenActive: false });
      await syncOutboundVideoTrack(localCamStreamRef.current);
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getDisplayMedia !== 'function'
    ) {
      setError('Демонстрация экрана недоступна в этом браузере.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          localScreenStreamRef.current = null;
          setLocalScreenStream(null);
          screenActiveRef.current = false;
          setScreenActive(false);
          sendRoomUpdate({ screenActive: false });
          void syncOutboundVideoTrack(localCamStreamRef.current);
        };
      }
      localScreenStreamRef.current = stream;
      setLocalScreenStream(stream);
      screenActiveRef.current = true;
      setScreenActive(true);
      setError(null);
      sendRoomUpdate({ screenActive: true });
      await syncOutboundVideoTrack(stream);
    } catch {
      setError('Демонстрация экрана отменена или заблокирована.');
    }
  }, [sendRoomUpdate, syncOutboundVideoTrack]);

  useEffect(() => {
    const handleUnload = () => {
      if (!connectedRef.current) return;
      if (transportRef.current === 'local') {
        localSessionRef.current?.leave();
        return;
      }
      const peerId = myPeerIdRef.current;
      if (transportRef.current === 'http' && peerId && navigator.sendBeacon) {
        navigator.sendBeacon(
          liveVoiceHttpUrls(httpBackendRef.current).leave,
          new Blob([JSON.stringify({ peerId })], { type: 'text/plain' }),
        );
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
      stopLocalSession();
      cleanupAllPeers();
      stopLocalMedia();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [cleanupAllPeers, stopLocalMedia, stopLocalSession, stopPolling]);

  return {
    connected,
    connecting,
    myPeerId,
    peers,
    micMuted,
    deafened,
    hasMicAudio,
    micLevel,
    speaking,
    camActive,
    screenActive,
    localCamStream,
    localScreenStream,
    remoteVideoPeers,
    loopbackActive,
    audioMode,
    transportMode,
    syncNotice,
    audioUnlockNeeded,
    error,
    setError,
    join,
    leave,
    toggleMicMute,
    toggleDeafen,
    toggleLoopback,
    toggleCamera,
    toggleScreen,
    retryMicPermission,
    unlockRemoteAudio,
  };
}
