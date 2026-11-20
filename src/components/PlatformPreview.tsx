import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Check,
  ChevronDown,
  Headphones,
  HelpCircle,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  PanelLeft,
  Paperclip,
  PhoneCall,
  Radio,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  BADGE_META,
  PREVIEW_DESKTOP_BREAKPOINT,
  PREVIEW_QUICK_QUESTIONS,
  PREVIEW_SERVERS,
  buildLocalVoiceUnlockMessage,
  createUserPreviewMessage,
  generatePreviewPeerReply,
  getInitialPreviewPanels,
  getVoicePeersForServer,
  matchesLocalVoiceUnlockCode,
  resolvePreviewShortcutAction,
  shouldPlayL30nelVoiceAudio,
  togglePreviewPanel,
  toggleVoiceForViewedServer,
  type PreviewBadgeSet,
  type PreviewMessage,
  type PreviewPanelsState,
  type PreviewServerId,
} from '../utils/platformPreview';
import { TrackAudioPlayer } from '../utils/audioTracks';
import { usePreBetaCall } from '../hooks/usePreBetaCall';
import { useLiveVoiceRoom } from '../hooks/useLiveVoiceRoom';
import { PreBetaWorkspace } from './PreBetaWorkspace';
import { formatCountdownMs, normalizePreBetaCode } from '../utils/preBetaSession';
import { probePreviewBackend, requestServerVoiceUnlock } from '../utils/previewTransport';
import { computeLiveVoiceInitials } from '../utils/liveVoiceRoom';

const WAVE_DELAYS = ['0s', '.2s', '.4s', '.1s', '.3s', '.5s', '.15s', '.35s', '.05s', '.25s', '.45s', '.12s'];

function StreamVideoPreview({ stream, label }: { stream: MediaStream; label: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    void el.play().catch(() => {});
    return () => {
      el.pause();
      el.srcObject = null;
    };
  }, [stream]);
  return (
    <div
      data-testid="preview-live-video-tile"
      className="relative rounded overflow-hidden border border-[#00f0ff]/35 bg-[#03070e] aspect-video"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-bold text-[#00f0ff] max-w-[92%] truncate">
        {label}
      </span>
    </div>
  );
}

function HexAvatar({
  initials,
  color,
  sizeClass = 'w-9 h-9 text-[11px]',
  online,
  showDot = false,
}: {
  initials: string;
  color: string;
  sizeClass?: string;
  online?: boolean;
  showDot?: boolean;
}) {
  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${sizeClass}`}>
      <div className="w-full h-full geek-hex bg-[#00f0ff]/40 p-[2px] flex items-center justify-center">
        <div
          className="w-full h-full geek-hex flex items-center justify-center font-extrabold text-white"
          style={{ backgroundColor: color }}
        >
          {initials}
        </div>
      </div>
      {showDot && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 geek-hex border border-[#04070d] ${
            online ? 'bg-[#10b981]' : 'bg-[#3b536b]'
          }`}
        />
      )}
    </div>
  );
}

function CyberBadge({ setKey }: { setKey: PreviewBadgeSet }) {
  if (!setKey) return null;
  const meta = BADGE_META[setKey];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-[1px] rounded text-[9px] font-black uppercase tracking-wide whitespace-nowrap shrink-0 ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export function PlatformPreview({
  openPreBetaSignal = 0,
  onFullscreenChange,
}: {
  openPreBetaSignal?: number;
  onFullscreenChange?: (fullscreen: boolean) => void;
}) {
  const [activeServerId, setActiveServerId] = useState<PreviewServerId>('cy-4371');
  const [preBetaMode, setPreBetaMode] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [initialPreBetaCode, setInitialPreBetaCode] = useState<string>('');
  const [activeChannelByServer, setActiveChannelByServer] = useState<Record<PreviewServerId, string>>({
    'cy-4371': 'игровая-комната',
    'hc-node': 'код-и-архитектура',
    'ma-club': 'идеи-комьюнити',
  });
  const [customMessages, setCustomMessages] = useState<Record<string, PreviewMessage[]>>({});
  const [draft, setDraft] = useState('');
  const [voiceServerId, setVoiceServerId] = useState<PreviewServerId | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const [screenActive, setScreenActive] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < PREVIEW_DESKTOP_BREAKPOINT : false,
  );
  const [panels, setPanels] = useState<PreviewPanelsState>(() =>
    getInitialPreviewPanels(
      typeof window !== 'undefined' ? window.innerWidth : PREVIEW_DESKTOP_BREAKPOINT,
    ),
  );
  const showChannels = panels.showChannels;
  const showMembers = panels.showMembers;
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showQuickQuestions, setShowQuickQuestions] = useState(false);
  const UNLOCK_STORAGE_KEY = 'geek_preview_unlock_token';
  const VOICE_UNLOCK_STORAGE_KEY = 'geek_preview_voice_unlock_token';

  const [unlockToken, setUnlockToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(UNLOCK_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [voiceUnlockToken, setVoiceUnlockToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(VOICE_UNLOCK_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [typingPeerName, setTypingPeerName] = useState<string | null>(null);
  const [voiceBackend, setVoiceBackend] = useState<'node' | 'php' | 'local' | undefined>(undefined);
  const voiceBackendRef = useRef<'node' | 'php' | 'local' | undefined>(undefined);
  voiceBackendRef.current = voiceBackend;
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const replyCountRef = useRef<number>(0);
  const replyTimersRef = useRef<number[]>([]);
  const liveReplyUrlRef = useRef<string | null>(null);
  const voiceUnlockUrlRef = useRef<string | null>('./api/preview/voice-unlock');
  const isMountedRef = useRef<boolean>(true);
  const l30nelAudioPlayerRef = useRef<TrackAudioPlayer | null>(null);
  const voiceUnlockTokenRef = useRef<string | null>(voiceUnlockToken);
  voiceUnlockTokenRef.current = voiceUnlockToken;

  const persistVoiceUnlockToken = (nextToken: string | null) => {
    voiceUnlockTokenRef.current = nextToken;
    setVoiceUnlockToken(nextToken);
    try {
      if (nextToken) {
        window.sessionStorage.setItem(VOICE_UNLOCK_STORAGE_KEY, nextToken);
      } else {
        window.sessionStorage.removeItem(VOICE_UNLOCK_STORAGE_KEY);
      }
    } catch {
      // Ignore storage restrictions
    }
  };

  const liveVoice = useLiveVoiceRoom({
    preferredBackend: voiceBackend,
    onUnauthorized: () => {
      if (!voiceUnlockTokenRef.current?.startsWith('local-')) {
        persistVoiceUnlockToken(null);
      }
    },
  });
  const [liveNickDraft, setLiveNickDraft] = useState<string>(liveVoice.nick);
  const [liveNickSaved, setLiveNickSaved] = useState<boolean>(false);
  const liveNickSavedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setLiveNickDraft(liveVoice.nick);
  }, [liveVoice.nick]);

  useEffect(() => {
    return () => {
      if (liveNickSavedTimerRef.current !== null) {
        window.clearTimeout(liveNickSavedTimerRef.current);
      }
    };
  }, []);

  const handleSaveLiveNick = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const saved = liveVoice.updateNick(liveNickDraft);
    setLiveNickDraft(saved);
    setLiveNickSaved(true);
    if (liveNickSavedTimerRef.current !== null) {
      window.clearTimeout(liveNickSavedTimerRef.current);
    }
    liveNickSavedTimerRef.current = window.setTimeout(() => {
      setLiveNickSaved(false);
      liveNickSavedTimerRef.current = null;
    }, 1500);
  };

  const syncL30nelVoiceAudio = (
    targetVoiceServerId: PreviewServerId | null,
    isPreBeta: boolean,
    isDeafened: boolean,
  ) => {
    if (!l30nelAudioPlayerRef.current) {
      l30nelAudioPlayerRef.current = new TrackAudioPlayer('l30nel');
    }
    const player = l30nelAudioPlayerRef.current;
    player.setMuted(isDeafened);
    if (shouldPlayL30nelVoiceAudio({ voiceServerId: targetVoiceServerId, preBetaMode: isPreBeta })) {
      player.start();
    } else {
      player.stop();
    }
  };

  const preBeta = usePreBetaCall();

  useEffect(() => {
    const syncFromUrlOrIntent = () => {
      let shouldOpen = Boolean(window.__GEEK_OPEN_PREBETA_ON_MOUNT__);
      try {
        const params = new URLSearchParams(window.location.search);
        const codeParam = params.get('prebeta');
        if (codeParam) {
          const normalized = normalizePreBetaCode(codeParam);
          if (normalized) {
            setInitialPreBetaCode(normalized);
            shouldOpen = true;
          }
        }
        if (window.location.hash === '#prebeta') {
          shouldOpen = true;
        }
      } catch {
        // Ignore malformed URL params
      }
      if (shouldOpen) {
        setPreBetaMode(true);
        window.setTimeout(() => {
          document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    };

    syncFromUrlOrIntent();
    window.addEventListener('hashchange', syncFromUrlOrIntent);
    return () => window.removeEventListener('hashchange', syncFromUrlOrIntent);
  }, []);

  useEffect(() => {
    if (openPreBetaSignal > 0) {
      setPreBetaMode(true);
    }
  }, [openPreBetaSignal]);

  const activeServer =
    PREVIEW_SERVERS.find((srv) => srv.id === activeServerId) ?? PREVIEW_SERVERS[0];
  const desiredChannelId = activeChannelByServer[activeServer.id];
  const activeChannel =
    activeServer.textChannels.find((ch) => ch.id === desiredChannelId) ??
    activeServer.textChannels[0];

  const messageKey = `${activeServer.id}:${activeChannel.id}`;
  const allMessages = [...activeChannel.messages, ...(customMessages[messageKey] ?? [])];

  const onlineMembers = activeServer.members.filter((m) => m.online);
  const offlineMembers = activeServer.members.filter((m) => !m.online);
  const connectedVoiceServer = voiceServerId
    ? PREVIEW_SERVERS.find((srv) => srv.id === voiceServerId) ?? null
    : null;
  const isInActiveServerVoice = voiceServerId === activeServer.id;
  const voicePeers = getVoicePeersForServer(activeServer, voiceServerId, {
    micMuted,
    deafened,
    camActive,
    screenActive,
  });

  const handleToggleVoiceChannel = (targetServerId: PreviewServerId) => {
    if (liveVoice.connected || liveVoice.connecting) {
      liveVoice.leave();
    }
    const next = toggleVoiceForViewedServer(voiceServerId, targetServerId);
    setVoiceServerId(next);
    if (next === null) {
      setCamActive(false);
      setScreenActive(false);
    }
    syncL30nelVoiceAudio(next, preBetaMode, deafened);
  };

  const handleLeaveVoice = () => {
    setVoiceServerId(null);
    setCamActive(false);
    setScreenActive(false);
    syncL30nelVoiceAudio(null, preBetaMode, deafened);
  };

  const handleToggleLiveVoice = () => {
    if (!voiceUnlockToken) return;
    if (liveVoice.connected || liveVoice.connecting) {
      liveVoice.leave();
      return;
    }
    if (voiceServerId !== null) {
      handleLeaveVoice();
    }
    const cleanNick = liveVoice.updateNick(liveNickDraft);
    setLiveNickDraft(cleanNick);
    void liveVoice.join(voiceUnlockToken, cleanNick);
  };

  useEffect(() => {
    syncL30nelVoiceAudio(voiceServerId, preBetaMode, deafened);
  }, [voiceServerId, preBetaMode, deafened]);

  useEffect(() => {
    return () => {
      l30nelAudioPlayerRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen, onFullscreenChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target?.isContentEditable);
      const action = resolvePreviewShortcutAction({
        key: event.key,
        code: event.code,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        isFullscreen,
        isEditableTarget: isEditable,
      });
      if (!action) return;
      event.preventDefault();
      if (action === 'exitFullscreen') {
        setIsFullscreen(false);
      } else if (action === 'fullscreen') {
        setIsFullscreen((prev) => !prev);
      } else if (action === 'mic') {
        if (liveVoice.connected) {
          liveVoice.toggleMicMute();
        } else {
          setMicMuted((prev) => !prev);
        }
      } else if (action === 'deafen') {
        if (liveVoice.connected) {
          liveVoice.toggleDeafen();
        } else {
          setDeafened((prev) => !prev);
        }
      } else if (action === 'cam') {
        if (liveVoice.connected) {
          void liveVoice.toggleCamera();
        } else if (voiceServerId !== null) {
          setCamActive((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, liveVoice, voiceServerId]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(max-width: ${PREVIEW_DESKTOP_BREAKPOINT - 1}px)`);
    const syncViewport = (compact: boolean) => {
      setIsCompactViewport(compact);
      setPanels(getInitialPreviewPanels(compact ? 390 : PREVIEW_DESKTOP_BREAKPOINT));
    };
    const onChange = (event: MediaQueryListEvent) => {
      syncViewport(event.matches);
    };
    if (mq.matches !== isCompactViewport) {
      syncViewport(mq.matches);
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
    // Only bind listener once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleChannels = () => {
    setPanels((prev) => togglePreviewPanel(prev, 'channels', isCompactViewport));
  };

  const handleToggleMembers = () => {
    setPanels((prev) => togglePreviewPanel(prev, 'members', isCompactViewport));
  };

  const handleCloseChannels = () => {
    setPanels((prev) => ({ ...prev, showChannels: false }));
  };

  const handleCloseMembers = () => {
    setPanels((prev) => ({ ...prev, showMembers: false }));
  };

  const handleSelectServer = (srvId: PreviewServerId) => {
    setPreBetaMode(false);
    setActiveServerId(srvId);
    if (isCompactViewport) {
      setPanels((prev) => ({ ...prev, showMembers: false }));
    }
  };

  const handleSelectChannel = (chId: string) => {
    setActiveChannelByServer((prev) => ({
      ...prev,
      [activeServer.id]: chId,
    }));
    if (isCompactViewport) {
      setPanels((prev) => ({ ...prev, showChannels: false }));
    }
  };

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [allMessages.length, typingPeerName, messageKey]);

  useEffect(() => {
    isMountedRef.current = true;
    void probePreviewBackend().then((cfg) => {
      if (!isMountedRef.current) return;
      if (cfg.liveEnabled && cfg.replyUrl) {
        liveReplyUrlRef.current = cfg.replyUrl;
      }
      voiceUnlockUrlRef.current = cfg.voiceUnlockUrl;
      setVoiceBackend(cfg.voiceBackend);
    });

    return () => {
      isMountedRef.current = false;
      for (const timerId of replyTimersRef.current) {
        window.clearTimeout(timerId);
      }
      replyTimersRef.current = [];
    };
  }, []);

  const scheduleFallbackReply = (
    questionText: string,
    targetServerId: PreviewServerId,
    targetChannelId: string,
    targetKey: string,
    replyIdx: number,
  ) => {
    const reply = generatePreviewPeerReply(
      questionText,
      targetServerId,
      targetChannelId,
      new Date(),
      replyIdx,
    );
    if (!reply) {
      if (isMountedRef.current) setTypingPeerName(null);
      return;
    }

    if (isMountedRef.current) setTypingPeerName(reply.author);
    const timerId = window.setTimeout(() => {
      if (!isMountedRef.current) return;
      setCustomMessages((prev) => ({
        ...prev,
        [targetKey]: [...(prev[targetKey] ?? []), reply].slice(-30),
      }));
      setTypingPeerName((cur) => (cur === reply.author ? null : cur));
    }, 450);
    replyTimersRef.current.push(timerId);
  };

  const persistUnlockToken = (nextToken: string | null) => {
    setUnlockToken(nextToken);
    try {
      if (nextToken) {
        window.sessionStorage.setItem(UNLOCK_STORAGE_KEY, nextToken);
      } else {
        window.sessionStorage.removeItem(UNLOCK_STORAGE_KEY);
      }
    } catch {
      // Ignore storage restrictions
    }
  };

  const submitPreviewQuestion = (questionText: string) => {
    const trimmedRaw = questionText.trim();
    if (!trimmedRaw) return;

    const targetServerId = activeServer.id;
    const targetChannelId = activeChannel.id;
    const targetKey = `${targetServerId}:${targetChannelId}`;

    if (trimmedRaw.toLowerCase() === '/lock') {
      persistUnlockToken(null);
      setDraft('');
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const lockMsg: PreviewMessage = {
        id: `lock-${now.getTime()}`,
        author: 'СИСТЕМА GEEK',
        initials: 'СГ',
        avatarColor: '#00f0ff',
        badgeSet: 'set1',
        time: `${hh}:${mm}`,
        text: '🔒 Свободный режим отключён. Чат снова работает в обычном режиме с L30nel, Sergo и Max.',
      };
      setCustomMessages((prev) => ({
        ...prev,
        [targetKey]: [...(prev[targetKey] ?? []), lockMsg].slice(-30),
      }));
      return;
    }

    if (trimmedRaw.toLowerCase() === '/voice-lock') {
      if (liveVoice.connected || liveVoice.connecting) {
        liveVoice.leave();
      }
      persistVoiceUnlockToken(null);
      setDraft('');
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const lockMsg: PreviewMessage = {
        id: `voice-lock-${now.getTime()}`,
        author: 'СИСТЕМА GEEK',
        initials: 'СГ',
        avatarColor: '#00f0ff',
        badgeSet: 'set1',
        time: `${hh}:${mm}`,
        text: '🔒 Тестовый живой голосовой канал скрыт. Чтобы открыть его снова, введите секретный код.',
      };
      setCustomMessages((prev) => ({
        ...prev,
        [targetKey]: [...(prev[targetKey] ?? []), lockMsg].slice(-30),
      }));
      return;
    }

    const activeToken = unlockToken;
    const newMsg = createUserPreviewMessage(trimmedRaw, new Date(), activeToken ? 2000 : 220);
    if (!newMsg) return;

    const replyIdx = replyCountRef.current;
    replyCountRef.current += 1;
    const historyPool = activeToken ? (customMessages[targetKey] ?? []) : allMessages;
    const recentHistory = historyPool
      .filter(
        (m) =>
          m.text !== '🔐 [Код доступа принят]' &&
          !m.text.startsWith('🔓 ') &&
          !m.text.startsWith('🔒 ') &&
          !m.text.startsWith('🎙️ '),
      )
      .slice(-8)
      .map((m) => ({
        author: m.author,
        text: m.text,
      }));

    setCustomMessages((prev) => ({
      ...prev,
      [targetKey]: [...(prev[targetKey] ?? []), newMsg].slice(-30),
    }));
    setDraft('');

    const applyVoiceUnlockResult = (nextVoiceToken: string, sysReply: PreviewMessage) => {
      persistVoiceUnlockToken(nextVoiceToken);
      setCustomMessages((prev) => {
        const list = prev[targetKey] ?? [];
        const redacted = list.map((item) =>
          item.id === newMsg.id ? { ...item, text: '🔐 [Код доступа принят]' } : item,
        );
        return {
          ...prev,
          [targetKey]: [...redacted, sysReply].slice(-30),
        };
      });
      setTypingPeerName(null);
    };

    const tryLocalVoiceUnlockFallback = (): boolean => {
      if (!matchesLocalVoiceUnlockCode(trimmedRaw)) return false;
      applyVoiceUnlockResult(
        `local-voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        buildLocalVoiceUnlockMessage(new Date()),
      );
      return true;
    };

    const resolveVoiceUnlockViaServerOrLocal = async (): Promise<boolean> => {
      const result = await requestServerVoiceUnlock(
        trimmedRaw,
        voiceUnlockUrlRef.current,
        voiceBackendRef.current,
      );
      if (!isMountedRef.current) return true;
      if (result.backend) {
        setVoiceBackend(result.backend);
        if (result.unlockUrl) {
          voiceUnlockUrlRef.current = result.unlockUrl;
        }
      }
      if (result.matched && result.voiceUnlockToken && result.reply) {
        applyVoiceUnlockResult(
          result.voiceUnlockToken,
          result.reply as unknown as PreviewMessage,
        );
        return true;
      }
      if (!result.serverReachable && tryLocalVoiceUnlockFallback()) {
        return true;
      }
      return false;
    };

    const replyUrl = liveReplyUrlRef.current;
    if (!replyUrl) {
      const shouldCheckServerUnlock =
        Boolean(voiceUnlockUrlRef.current) ||
        voiceBackendRef.current !== 'local' ||
        matchesLocalVoiceUnlockCode(trimmedRaw);
      if (!shouldCheckServerUnlock) {
        scheduleFallbackReply(newMsg.text, targetServerId, targetChannelId, targetKey, replyIdx);
        return;
      }
      void resolveVoiceUnlockViaServerOrLocal()
        .then((handled) => {
          if (!isMountedRef.current || handled) return;
          scheduleFallbackReply(newMsg.text, targetServerId, targetChannelId, targetKey, replyIdx);
        })
        .catch(() => {
          if (!isMountedRef.current) return;
          if (tryLocalVoiceUnlockFallback()) return;
          scheduleFallbackReply(newMsg.text, targetServerId, targetChannelId, targetKey, replyIdx);
        });
      return;
    }

    setTypingPeerName(activeToken ? 'Geek Core' : 'Участник сервера');
    void fetch(replyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: trimmedRaw.slice(0, 2000),
        serverId: targetServerId,
        channelId: targetChannelId,
        history: recentHistory,
        ...(activeToken ? { unlockToken: activeToken } : {}),
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          ok?: boolean;
          reply?: PreviewMessage;
          unlocked?: boolean;
          unlockToken?: string;
          voiceUnlocked?: boolean;
          voiceUnlockToken?: string;
        };
        if (!data.ok || !data.reply) throw new Error('Invalid reply');
        if (!isMountedRef.current) return;
        if (data.voiceUnlocked && data.voiceUnlockToken) {
          applyVoiceUnlockResult(data.voiceUnlockToken, data.reply);
          return;
        }
        if (matchesLocalVoiceUnlockCode(trimmedRaw)) {
          const handled = await resolveVoiceUnlockViaServerOrLocal();
          if (handled) return;
        }
        if (data.unlocked && data.unlockToken) {
          persistUnlockToken(data.unlockToken);
        }
        const liveReply = data.reply;
        setCustomMessages((prev) => {
          const list = prev[targetKey] ?? [];
          const redacted =
            data.unlocked === true
              ? list.map((item) =>
                  item.id === newMsg.id ? { ...item, text: '🔐 [Код доступа принят]' } : item,
                )
              : list;
          return {
            ...prev,
            [targetKey]: [...redacted, liveReply].slice(-30),
          };
        });
        setTypingPeerName(null);
      })
      .catch(async () => {
        if (!isMountedRef.current) return;
        if (matchesLocalVoiceUnlockCode(trimmedRaw)) {
          const handled = await resolveVoiceUnlockViaServerOrLocal();
          if (handled) return;
        }
        scheduleFallbackReply(newMsg.text, targetServerId, targetChannelId, targetKey, replyIdx);
      });
  };

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitPreviewQuestion(draft);
  };

  const handleCopyInvite = async () => {
    const shareUrl =
      preBetaMode && preBeta.roomSnapshot
        ? `${window.location.origin}${window.location.pathname}?prebeta=${encodeURIComponent(preBeta.roomSnapshot.code)}#preview`
        : `${window.location.origin}${window.location.pathname}?room=${activeServer.id}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch {
      // Clipboard fallback
    }
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1800);
  };

  return (
    <section
      id="preview"
      aria-labelledby="preview-heading"
      className="w-full max-w-[1400px] mx-auto mt-20 text-left"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-mono-tech text-[#00f0ff] tracking-widest uppercase mb-2">
            GEEK // CYBER.NET · ПРЕВЬЮ КЛИЕНТА
          </p>
          <h2
            id="preview-heading"
            className="font-cyber font-black text-3xl md:text-4xl text-white uppercase"
          >
            Как выглядит Geek внутри
          </h2>
        </div>
        <p className="text-sm text-slate-400 max-w-md">
          Переключайте серверы, тестируйте чат или запустите живую Pre-Beta связь 1-на-1 по уникальному коду.
        </p>
      </div>

      {/* Prominent Mode Switcher Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 rounded-2xl bg-[#0b1220]/90 border border-[#00f0ff]/25 p-2.5">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setPreBetaMode(false)}
            aria-pressed={!preBetaMode}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-cyber font-bold text-[11px] sm:text-xs uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
              !preBetaMode
                ? 'bg-[#00f0ff]/20 border border-[#00f0ff] text-white'
                : 'bg-[#060b14] border border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            Обзор клиента
          </button>
          <button
            type="button"
            onClick={() => setPreBetaMode(true)}
            aria-pressed={preBetaMode}
            data-testid="prebeta-banner-btn"
            className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-cyber font-black text-[11px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              preBetaMode
                ? 'bg-[#00f0ff] border border-[#00f0ff] text-[#031518] shadow-[0_0_24px_rgba(0,240,255,0.65)]'
                : 'bg-gradient-to-r from-[#ff007f] to-[#ff2a85] border border-[#ff8ac4]/70 text-white shadow-[0_0_24px_rgba(255,0,127,0.55)] hover:brightness-110'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="sm:hidden">
              {preBeta.roomSnapshot
                ? `PRE-BETA · ${formatCountdownMs(preBeta.remainingMs)}`
                : 'PRE-BETA 1-НА-1'}
            </span>
            <span className="hidden sm:inline whitespace-nowrap">
              {preBeta.roomSnapshot
                ? `PRE-BETA СВЯЗЬ АКТИВНА · ${formatCountdownMs(preBeta.remainingMs)}`
                : 'PRE-BETA СВЯЗЬ 1-НА-1 · 30 МИН ДО РЕЛИЗА'}
            </span>
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          <span className="text-[10.5px] sm:text-[11px] font-mono-tech text-[#fcee0a] px-1 sm:px-2">
            1 код · макс. 2 участника · 30:00
          </span>
          <button
            type="button"
            onClick={() => setIsFullscreen(true)}
            data-testid="preview-banner-fullscreen-btn"
            className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-[#00f0ff]/12 border border-[#00f0ff]/45 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#031518] font-cyber font-bold text-[10.5px] sm:text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Maximize2 className="w-3.5 h-3.5 shrink-0" />
            <span>На весь экран</span>
          </button>
        </div>
      </div>

      {/* Authentic GEEK // CYBER.NET Application Window */}
      <div
        data-testid="preview-shell"
        className={
          isFullscreen
            ? 'fixed inset-0 z-50 w-screen h-dvh geek-pcb-bg flex flex-col overflow-hidden text-[#e6f7ff] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
            : 'geek-pcb-bg rounded-2xl border border-[#00f0ff]/35 shadow-neon-cyan overflow-hidden text-[#e6f7ff] flex flex-col'
        }
      >
        {/* Top App Bar */}
        <div className="shrink-0 min-h-[42px] bg-[#04070d]/95 border-b border-[#00f0ff]/15 px-2.5 sm:px-3.5 py-1.5 flex items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div className="flex items-center gap-1 font-black text-xs tracking-wider text-white whitespace-nowrap shrink-0">
              <Zap className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span>GEEK</span>
            </div>
            <span className="hidden xs:inline-block sm:inline-block bg-[#ff2a85]/20 border border-[#ff2a85]/50 text-[#ff7aa8] text-[9px] font-extrabold px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
              CYBER.NET
            </span>
            <span className="hidden md:inline-block bg-[#00f0ff]/5 border border-[#00f0ff]/15 text-[#63809b] text-[10px] font-bold px-2.5 py-0.5 rounded whitespace-nowrap">
              МЕСТО ДЛЯ СВОИХ // P2P ПРОТОКОЛ
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPreBetaMode((prev) => !prev)}
              aria-pressed={preBetaMode}
              data-testid="prebeta-mode-btn"
              className={`inline-flex items-center gap-1 text-[10px] sm:text-[10.5px] font-extrabold px-2 sm:px-2.5 py-1 rounded-md border transition-all cursor-pointer whitespace-nowrap ${
                preBetaMode
                  ? 'bg-[#00f0ff] border-[#00f0ff] text-[#031518] shadow-[0_0_16px_rgba(0,240,255,0.6)]'
                  : 'bg-gradient-to-r from-[#ff007f] to-[#ff2a85] border-[#ff8ac4]/60 text-white shadow-[0_0_16px_rgba(255,0,127,0.5)] hover:brightness-110'
              }`}
            >
              <PhoneCall className="w-3 h-3 shrink-0" />
              <span className="sm:hidden">
                {preBeta.roomSnapshot ? formatCountdownMs(preBeta.remainingMs) : '1-НА-1'}
              </span>
              <span className="hidden sm:inline">
                {preBeta.roomSnapshot
                  ? `PRE-BETA LIVE (${formatCountdownMs(preBeta.remainingMs)})`
                  : 'PRE-BETA СВЯЗЬ · 30 МИН'}
              </span>
            </button>
            <span className="hidden md:inline-flex items-center gap-1.5 bg-[#10b981]/10 border border-[#10b981]/40 text-[#6ee7b7] text-[10.5px] font-bold px-2.5 py-1 rounded-md whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
              <span>{preBetaMode ? 'pre-beta-1on1' : activeServer.id}</span>
            </span>
            <button
              type="button"
              onClick={handleCopyInvite}
              aria-label="Скопировать ссылку-приглашение"
              className="hidden sm:inline-flex bg-gradient-to-br from-[#ff2a85]/35 to-[#9d174d]/50 border border-[#ff2a85] text-white text-[10.5px] font-extrabold px-2.5 py-1 rounded-md hover:brightness-110 transition-all cursor-pointer whitespace-nowrap"
            >
              {inviteCopied ? '✓ СКОПИРОВАНО' : '+ ПРИГЛАСИТЬ'}
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              aria-pressed={isFullscreen}
              data-testid="preview-fullscreen-btn"
              title={isFullscreen ? 'Свернуть превью (Esc)' : 'Развернуть превью на всю страницу (Alt+F)'}
              className={`inline-flex items-center gap-1 text-[10px] sm:text-[10.5px] font-extrabold px-2 sm:px-2.5 py-1 rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isFullscreen
                  ? 'bg-[#00f0ff] border-[#00f0ff] text-[#031518] hover:brightness-110'
                  : 'bg-[#0b1626] border-[#00f0ff]/45 text-[#00f0ff] hover:bg-[#00f0ff]/15 hover:text-white'
              }`}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3 h-3 shrink-0" />
                  <span>СВЕРНУТЬ</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3 h-3 shrink-0" />
                  <span className="hidden sm:inline">РАЗВЕРНУТЬ</span>
                  <span className="sm:hidden">ЭКРАН</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sub Sync Bar with Collapsible Channels & Online Members Controls */}
        <div className="shrink-0 min-h-[36px] bg-[#060b14]/95 border-b border-[#00f0ff]/15 px-2.5 sm:px-3.5 py-1 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2 min-w-0">
            {(!preBetaMode || Boolean(preBeta.roomSnapshot)) && (
              <button
                type="button"
                onClick={handleToggleChannels}
                aria-pressed={showChannels}
                data-testid="preview-toggle-channels-btn"
                title={showChannels ? 'Свернуть список каналов' : 'Открыть список каналов'}
                className={`border text-[10px] sm:text-[10.5px] font-bold px-2 sm:px-2.5 py-1 rounded flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
                  showChannels
                    ? 'bg-[#00f0ff]/20 border-[#00f0ff]/60 text-white'
                    : 'bg-[#00f0ff]/8 border-[#00f0ff]/25 hover:border-[#00f0ff]/55 text-[#b4cde0] hover:text-white'
                }`}
              >
                <PanelLeft className="w-3.5 h-3.5 text-[#00f0ff] shrink-0" />
                <span>{preBetaMode ? 'КАНАЛ' : 'КАНАЛЫ'}</span>
                {!showChannels && (connectedVoiceServer || liveVoice.connected) && (
                  <span
                    className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_6px_#10b981]"
                    aria-label="Вы в голосовом канале"
                  />
                )}
              </button>
            )}
            <div className="flex items-center gap-1.5 font-bold text-[#00f0ff] min-w-0 truncate">
              <span className="shrink-0 hidden sm:inline">●</span>
              <span className="hidden md:inline shrink-0">АКТИВНАЯ СЕТЬ:</span>
              <span className="text-white font-extrabold truncate text-[10.5px] sm:text-[11px]">
                {preBetaMode
                  ? 'PRE-BETA 1-НА-1'
                  : isCompactViewport
                    ? `${activeServer.name}`
                    : 'P2P СИНХРОНИЗАЦИЯ'}
              </span>
            </div>
          </div>

          {(!preBetaMode || Boolean(preBeta.roomSnapshot)) && (
            <button
              type="button"
              onClick={handleToggleMembers}
              aria-pressed={showMembers}
              data-testid="preview-toggle-members-btn"
              title={showMembers ? 'Свернуть список онлайна' : 'Показать список онлайна'}
              className={`border text-[10px] sm:text-[10.5px] font-bold px-2 sm:px-2.5 py-1 rounded flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
                showMembers
                  ? 'bg-[#00f0ff]/20 border-[#00f0ff]/60 text-white'
                  : 'bg-[#00f0ff]/8 border-[#00f0ff]/25 hover:border-[#00f0ff]/55 text-[#b4cde0] hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-[#00f0ff] shrink-0" />
              <span>ОНЛАЙН</span>
              <span className="px-1 py-[0.5px] rounded bg-[#10b981]/20 text-[#6ee7b7] text-[9.5px] font-mono-tech">
                {preBetaMode ? (preBeta.roomSnapshot?.participants.length ?? 0) : onlineMembers.length}
              </span>
            </button>
          )}
        </div>

        {/* Main 4-Pane Workspace */}
        <div
          data-testid="preview-workspace"
          className={`flex flex-col lg:flex-row overflow-hidden ${
            isFullscreen
              ? 'flex-1 min-h-0'
              : 'h-[600px] sm:h-[680px] lg:h-[720px]'
          }`}
        >
          {/* 1. Left Hexagonal Servers Rail */}
          <div
            role="navigation"
            aria-label="Серверы Geek"
            className="bg-[#04070d]/95 border-b lg:border-b-0 lg:border-r border-[#00f0ff]/15 px-2.5 py-2 lg:py-3 lg:px-0 lg:w-[68px] flex lg:flex-col items-center gap-2 lg:gap-2.5 shrink-0 overflow-x-auto"
          >
            <div
              className="w-9 h-9 lg:w-10 lg:h-10 geek-hex bg-[#0d1829] text-[#fcee09] flex items-center justify-center shrink-0"
              title="Профиль GEEK // CYBER.NET"
            >
              <Zap className="w-4 h-4" />
            </div>

            <div className="w-px h-5 lg:w-6 lg:h-px bg-[#00f0ff]/20 shrink-0" />

            {PREVIEW_SERVERS.map((srv) => {
              const isAct = !preBetaMode && srv.id === activeServer.id;
              const hasVoiceHere = voiceServerId === srv.id;
              return (
                <div key={srv.id} className="relative lg:w-full flex items-center justify-center shrink-0">
                  <span
                    className={`hidden lg:block absolute left-0 w-[3px] rounded-r bg-[#00f0ff] transition-all ${
                      isAct ? 'h-8 opacity-100' : 'h-2 opacity-0'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => handleSelectServer(srv.id)}
                    aria-label={`Сервер ${srv.name}`}
                    aria-pressed={isAct}
                    title={hasVoiceHere ? `${srv.name} (Вы в голосовом канале)` : srv.name}
                    className={`w-10 h-10 lg:w-11 lg:h-11 geek-hex font-extrabold text-xs flex items-center justify-center transition-all cursor-pointer ${
                      isAct
                        ? 'bg-[#00f0ff] text-[#031518] shadow-[0_0_14px_rgba(0,240,255,0.6)]'
                        : 'bg-[#0c1626] text-[#b4cde0] hover:bg-[#00f0ff] hover:text-[#031518]'
                    }`}
                  >
                    {srv.icon}
                  </button>
                  {hasVoiceHere && (
                    <span
                      data-testid={`rail-voice-dot-${srv.id}`}
                      title={`Вы в голосовом канале: ${srv.voiceChannel}`}
                      className="pointer-events-none absolute -top-0.5 right-0.5 lg:right-2 w-2.5 h-2.5 rounded-full bg-[#10b981] border border-[#04070d] shadow-[0_0_8px_#10b981]"
                    />
                  )}
                </div>
              );
            })}

            <div className="w-px h-5 lg:w-6 lg:h-px bg-[#ff2a85]/35 shrink-0" />

            <div className="relative lg:w-full flex items-center justify-center shrink-0">
              <span
                className={`hidden lg:block absolute left-0 w-[3px] rounded-r bg-[#ff2a85] transition-all ${
                  preBetaMode ? 'h-8 opacity-100' : 'h-2 opacity-0'
                }`}
              />
              <button
                type="button"
                onClick={() => setPreBetaMode(true)}
                aria-label="Pre-Beta живая связь 1-на-1"
                aria-pressed={preBetaMode}
                title="PRE-BETA // Связь 1-на-1 (30 мин до релиза)"
                data-testid="prebeta-rail-btn"
                className={`w-10 h-10 lg:w-11 lg:h-11 geek-hex font-extrabold text-xs flex items-center justify-center transition-all cursor-pointer ${
                  preBetaMode
                    ? 'bg-[#ff2a85] text-white shadow-[0_0_18px_rgba(255,42,133,0.8)]'
                    : 'bg-[#2b0f26] text-[#ff7aa8] shadow-[0_0_12px_rgba(255,42,133,0.35)] hover:bg-[#ff2a85] hover:text-white'
                }`}
              >
                PB
              </button>
            </div>
          </div>

          {/* Inner 3-pane host: drawers anchor cleanly below mobile server rail and never overlap chat */}
          <div className="relative flex-1 min-w-0 min-h-0 flex overflow-hidden">
          {preBetaMode ? (
            <PreBetaWorkspace
              controller={preBeta}
              initialJoinCode={initialPreBetaCode}
              showChannels={showChannels}
              onCloseChannels={handleCloseChannels}
              showMembers={showMembers}
              onCloseMembers={handleCloseMembers}
            />
          ) : (
            <>
          {(showChannels || showMembers) && (
            <div
              aria-hidden="true"
              data-testid="preview-drawer-backdrop"
              onClick={() => {
                handleCloseChannels();
                handleCloseMembers();
              }}
              className="lg:hidden absolute inset-0 z-20 bg-black/65 backdrop-blur-[2px]"
            />
          )}

          {/* 2. Channels Sidebar + Voice Dock + User Bar (collapsible on desktop & slide-over drawer on mobile) */}
          {showChannels && (
          <aside
            aria-label="Каналы сервера"
            data-testid="preview-channels-panel"
            className="absolute inset-y-0 left-0 z-30 w-[min(86vw,300px)] shadow-[8px_0_32px_rgba(0,0,0,0.75)] lg:static lg:z-auto lg:w-[276px] lg:shadow-none bg-[#060b14]/98 lg:bg-[#060b14]/92 border-r border-[#00f0ff]/30 lg:border-[#00f0ff]/15 flex flex-col justify-between shrink-0 min-h-0"
          >
            <div className="flex-1 min-h-0 overflow-y-auto geek-chat-scroll">
              {/* Server Title Header */}
              <div className="px-3.5 py-2.5 border-b border-[#00f0ff]/15 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[9px] font-extrabold uppercase tracking-wider text-[#00f0ff]">
                    ОТКРЫТЫЙ УЗЕЛ
                  </div>
                  <div className="text-[15px] font-black text-white truncate mt-0.5">
                    {activeServer.name}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="bg-[#00f0ff]/10 border border-[#00f0ff]/40 text-[#00f0ff] text-[9.5px] font-bold px-2 py-0.5 rounded shrink-0">
                    {activeServer.id}
                  </span>
                  <button
                    type="button"
                    onClick={handleCloseChannels}
                    aria-label="Свернуть список каналов"
                    data-testid="preview-close-channels-btn"
                    title="Свернуть список каналов"
                    className="w-6 h-6 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Radio / Packet Card from design */}
              <div className="mx-2.5 mt-2.5 mb-1.5 px-3 py-2 rounded-lg bg-gradient-to-br from-[#ff2a85]/15 to-[#0a1320]/90 border border-[#ff2a85]/45 flex items-center justify-between">
                <div>
                  <div className="text-[9px] font-extrabold text-[#b4cde0]">ОЧЕРЕДЬ ПАКЕТОВ</div>
                  <div className="text-[11px] font-extrabold text-white font-mono">108.4 FM // P2P</div>
                </div>
                <span className="text-[9.5px] font-extrabold text-[#ff2a85]">▲ LIVE</span>
              </div>

              {/* Channels Lists */}
              <div className="px-2.5 py-1.5">
                <div className="text-[10px] font-extrabold uppercase text-[#63809b] px-1 py-1.5">
                  ◈ ТЕКСТОВЫЕ КАНАЛЫ
                </div>
                <div className="space-y-0.5 mb-3" role="tablist" aria-label="Текстовые каналы сервера">
                  {activeServer.textChannels.map((ch) => {
                    const isAct = ch.id === activeChannel.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        role="tab"
                        aria-selected={isAct}
                        onClick={() => handleSelectChannel(ch.id)}
                        className={`w-full px-2.5 py-1.5 rounded-md text-[13px] font-semibold flex items-center gap-2 transition-colors cursor-pointer border ${
                          isAct
                            ? 'bg-[#00f0ff]/15 border-[#00f0ff]/40 text-white'
                            : 'border-transparent text-[#b4cde0] hover:bg-[#00f0ff]/10 hover:text-white'
                        }`}
                      >
                        <span className="text-[#00f0ff] font-extrabold">#</span>
                        <span className="truncate">{ch.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="text-[10px] font-extrabold uppercase text-[#63809b] px-1 py-1.5">
                  🔊 ГОЛОСОВЫЕ КАНАЛЫ
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleVoiceChannel(activeServer.id)}
                  aria-pressed={isInActiveServerVoice}
                  data-testid="preview-voice-channel-btn"
                  className={`w-full px-2.5 py-1.5 rounded-md text-[13px] font-semibold flex items-center justify-between border mb-1.5 cursor-pointer transition-colors ${
                    isInActiveServerVoice
                      ? 'bg-[#10b981]/15 border-[#10b981]/45 text-[#6ee7b7]'
                      : 'border-transparent text-[#b4cde0] hover:bg-[#00f0ff]/10 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Volume2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{activeServer.voiceChannel}</span>
                  </span>
                  {isInActiveServerVoice && <span className="text-[9px] font-extrabold text-[#10b981]">LIVE</span>}
                </button>

                {/* Connected Voice Peers with Green Speaking Ring & Animated Bars */}
                <div data-testid="preview-voice-peers" className="space-y-1 pl-2 mb-2">
                  {voicePeers.map((vp) => (
                    <div
                      key={vp.id}
                      className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs border transition-colors ${
                        vp.speaking
                          ? 'bg-[#10b981]/15 border-[#10b981]/50 text-white'
                          : 'border-transparent text-[#b4cde0]'
                      }`}
                    >
                      <HexAvatar
                        initials={vp.initials}
                        color={vp.avatarColor}
                        sizeClass="w-7 h-7 text-[9px]"
                      />
                      <span className="truncate flex-1">
                        {vp.nick}
                        {vp.id === 'u-l30nel' && isInActiveServerVoice ? ' 🎵' : ''}
                        {vp.inCam ? ' 📷' : ''}
                        {vp.inScreen ? ' 🖥️' : ''}
                      </span>
                      {vp.speaking && (
                        <span className="inline-flex items-center gap-[2px] h-3 shrink-0" aria-hidden="true">
                          <span className="geek-speak-bar w-[2.5px] h-2.5 bg-[#10b981] rounded-full" />
                          <span
                            className="geek-speak-bar w-[2.5px] h-3 bg-[#10b981] rounded-full"
                            style={{ animationDelay: '0.15s' }}
                          />
                          <span
                            className="geek-speak-bar w-[2.5px] h-2 bg-[#10b981] rounded-full"
                            style={{ animationDelay: '0.3s' }}
                          />
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Secret-Unlocked Multi-User Live Voice Channel (hidden until secret code entered in chat) */}
                {voiceUnlockToken && (
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={handleToggleLiveVoice}
                      aria-pressed={liveVoice.connected}
                      data-testid="preview-live-voice-btn"
                      className={`w-full px-2.5 py-1.5 rounded-md text-[13px] font-semibold flex items-center justify-between border mb-1.5 cursor-pointer transition-colors ${
                        liveVoice.connected
                          ? 'bg-[#10b981]/20 border-[#10b981] text-[#6ee7b7] shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                          : 'bg-[#081523] border-[#00f0ff]/35 text-[#9eeeff] hover:bg-[#00f0ff]/15 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Radio className="w-3.5 h-3.5 shrink-0 text-[#10b981]" />
                        <span className="truncate">Live Голос (Тест)</span>
                      </span>
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-[#10b981]/20 text-[#6ee7b7] shrink-0">
                        {liveVoice.connecting
                          ? '...'
                          : liveVoice.connected
                            ? `${liveVoice.peers.length}/8`
                            : 'LIVE'}
                      </span>
                    </button>

                    {!liveVoice.connected && (
                      <form
                        onSubmit={handleSaveLiveNick}
                        data-testid="live-voice-nick-form"
                        className="flex items-center gap-1 mb-2 px-0.5"
                      >
                        <input
                          type="text"
                          value={liveNickDraft}
                          onChange={(e) => setLiveNickDraft(e.target.value)}
                          onBlur={() => {
                            if (liveNickDraft.trim() !== liveVoice.nick) {
                              handleSaveLiveNick();
                            }
                          }}
                          maxLength={22}
                          aria-label="Ваш ник в Live Голос"
                          placeholder="Ваш ник..."
                          data-testid="live-voice-nick-input"
                          className="min-w-0 flex-1 px-2 py-1 rounded bg-[#050c16] border border-[#00f0ff]/30 focus:border-[#00f0ff] focus:outline-none text-[11px] font-semibold text-white placeholder:text-[#63809b]"
                        />
                        <button
                          type="submit"
                          data-testid="live-voice-nick-save"
                          title="Сохранить ник в Live Голос"
                          className={`px-2 py-1 rounded border text-[10px] font-extrabold cursor-pointer transition-colors shrink-0 flex items-center gap-0.5 ${
                            liveNickSaved
                              ? 'bg-[#10b981]/25 border-[#10b981] text-[#6ee7b7]'
                              : liveNickDraft.trim() !== liveVoice.nick
                                ? 'bg-[#00f0ff]/20 border-[#00f0ff] text-white hover:bg-[#00f0ff]/30'
                                : 'bg-[#0d1829] border-[#00f0ff]/20 text-[#9eeeff] hover:border-[#00f0ff]/50 hover:text-white'
                          }`}
                        >
                          <Check className="w-3 h-3" />
                          <span>{liveNickSaved ? 'ОК' : 'Ник'}</span>
                        </button>
                      </form>
                    )}

                    {liveVoice.connected && (
                      <div data-testid="preview-live-voice-peers" className="space-y-1 pl-2 mb-2">
                        {liveVoice.peers.map((vp) => (
                          <div
                            key={vp.peerId}
                            className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs border transition-colors ${
                              vp.speaking
                                ? 'bg-[#10b981]/15 border-[#10b981]/50 text-white'
                                : 'border-transparent text-[#b4cde0]'
                            }`}
                          >
                            <HexAvatar
                              initials={vp.initials}
                              color={vp.avatarColor}
                              sizeClass="w-7 h-7 text-[9px]"
                            />
                            <span className="truncate flex-1">
                              {vp.nick}
                              {vp.peerId === liveVoice.myPeerId && !vp.nick.startsWith('Вы ') ? ' (Вы)' : ''}
                              {vp.camActive ? ' 📷' : ''}
                              {vp.screenActive ? ' 🖥️' : ''}
                            </span>
                            {vp.micMuted && <MicOff className="w-3 h-3 text-[#ff2a85] shrink-0" />}
                            {vp.deafened && <VolumeX className="w-3 h-3 text-[#ff2a85] shrink-0" />}
                            {vp.speaking && !vp.micMuted && (
                              <span className="inline-flex items-center gap-[2px] h-3 shrink-0" aria-hidden="true">
                                <span className="geek-speak-bar w-[2.5px] h-2.5 bg-[#10b981] rounded-full" />
                                <span
                                  className="geek-speak-bar w-[2.5px] h-3 bg-[#10b981] rounded-full"
                                  style={{ animationDelay: '0.15s' }}
                                />
                                <span
                                  className="geek-speak-bar w-[2.5px] h-2 bg-[#10b981] rounded-full"
                                  style={{ animationDelay: '0.3s' }}
                                />
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0">
              {/* Voice Dock (visible only while connected to a voice channel) */}
              {(connectedVoiceServer || liveVoice.connected) && (
                <div
                  data-testid="preview-vdock"
                  className="bg-[#06101a]/95 border-t border-[#00f0ff]/35 px-2.5 py-2 space-y-2"
                >
                  {liveVoice.connected ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            data-testid="preview-vdock-status"
                            data-transport={liveVoice.transportMode ?? 'none'}
                            className={`text-[10px] font-extrabold uppercase truncate ${
                              liveVoice.transportMode === 'local'
                                ? 'text-[#fcee0a]'
                                : 'text-[#10b981]'
                            }`}
                          >
                            {liveVoice.transportMode === 'local'
                              ? '⚠️ ЛОКАЛЬНО · НЕТ СЕРВЕРА'
                              : liveVoice.audioMode === 'loopback'
                                ? '🟢 ЭХО-ТЕСТ · ЛОКАЛЬНО'
                                : liveVoice.audioMode === 'webrtc'
                                  ? '🟢 В ЭФИРЕ · WebRTC P2P'
                                  : liveVoice.audioMode === 'relay'
                                    ? liveVoice.transportMode === 'http-php'
                                      ? '🟢 В ЭФИРЕ · PHP RELAY'
                                      : '🟢 В ЭФИРЕ · WS RELAY'
                                    : liveVoice.transportMode === 'http-php'
                                      ? '🟢 В ЭФИРЕ · СЕРВЕР PHP'
                                      : '🟢 В ЭФИРЕ · СЕРВЕР'}
                          </div>
                          <div
                            data-testid="preview-vdock-room"
                            className="text-xs font-bold text-white truncate"
                          >
                            Live Голос (Тест) · {liveVoice.peers.length}/8
                          </div>
                        </div>
                        <button
                          type="button"
                          data-testid="preview-voice-dock-btn"
                          onClick={liveVoice.leave}
                          className="px-2.5 py-1 rounded text-[10.5px] font-extrabold cursor-pointer transition-colors shrink-0 bg-[#ff2a85]/25 border border-[#ff2a85] text-[#ff80a0] hover:bg-[#ff2a85] hover:text-white"
                        >
                          ВЫЙТИ
                        </button>
                      </div>

                      {/* Always-visible inline nickname editor while in Live Voice */}
                      <form
                        onSubmit={handleSaveLiveNick}
                        data-testid="live-voice-nick-form"
                        className="flex items-center gap-1"
                      >
                        <input
                          type="text"
                          value={liveNickDraft}
                          onChange={(e) => setLiveNickDraft(e.target.value)}
                          onBlur={() => {
                            if (liveNickDraft.trim() !== liveVoice.nick) {
                              handleSaveLiveNick();
                            }
                          }}
                          maxLength={22}
                          aria-label="Ваш ник в Live Голос"
                          placeholder="Ваш ник..."
                          data-testid="live-voice-nick-input"
                          className="min-w-0 flex-1 px-2 py-1 rounded bg-[#03070e] border border-[#00f0ff]/35 focus:border-[#00f0ff] focus:outline-none text-[11px] font-semibold text-white placeholder:text-[#63809b]"
                        />
                        <button
                          type="submit"
                          data-testid="live-voice-nick-save"
                          title="Сохранить ник в Live Голос"
                          className={`px-2 py-1 rounded border text-[10px] font-extrabold cursor-pointer transition-colors shrink-0 flex items-center gap-0.5 ${
                            liveNickSaved
                              ? 'bg-[#10b981]/25 border-[#10b981] text-[#6ee7b7]'
                              : liveNickDraft.trim() !== liveVoice.nick
                                ? 'bg-[#00f0ff]/20 border-[#00f0ff] text-white hover:bg-[#00f0ff]/30'
                                : 'bg-[#0d1829] border-[#00f0ff]/25 text-[#9eeeff] hover:border-[#00f0ff]/60 hover:text-white'
                          }`}
                        >
                          <Check className="w-3 h-3" />
                          <span>{liveNickSaved ? 'ОК' : 'Ник'}</span>
                        </button>
                      </form>

                      {/* Real mic signal level & diagnostic actions */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9.5px] font-mono-tech text-[#9eeeff]">
                          <span>
                            {liveVoice.hasMicAudio
                              ? liveVoice.micMuted
                                ? 'Микрофон заглушён'
                                : `Уровень мик: ${liveVoice.micLevel}%`
                              : 'Режим слушателя (нет мик)'}
                          </span>
                          {!liveVoice.hasMicAudio && (
                            <button
                              type="button"
                              onClick={() => void liveVoice.retryMicPermission()}
                              className="text-[#00f0ff] hover:underline cursor-pointer font-bold"
                            >
                              + Микрофон
                            </button>
                          )}
                        </div>
                        <div
                          data-testid="preview-live-mic-meter"
                          className="h-1.5 w-full rounded-full bg-[#03070e] border border-[#00f0ff]/20 overflow-hidden"
                        >
                          <div
                            className="h-full bg-gradient-to-r from-[#00f0ff] to-[#10b981] transition-all duration-75"
                            style={{ width: `${liveVoice.micMuted ? 0 : liveVoice.micLevel}%` }}
                          />
                        </div>
                      </div>

                      {liveVoice.audioUnlockNeeded && (
                        <button
                          type="button"
                          onClick={liveVoice.unlockRemoteAudio}
                          className="w-full py-1 px-2 rounded bg-[#fcee0a]/15 border border-[#fcee0a]/60 text-[#fcee0a] text-[10.5px] font-bold cursor-pointer hover:bg-[#fcee0a]/25"
                        >
                          🔊 Нажмите, чтобы разрешить звук
                        </button>
                      )}

                      {liveVoice.syncNotice && (
                        <div
                          data-testid="preview-live-sync-notice"
                          className="text-[10px] text-[#fcee0a] bg-[#fcee0a]/10 border border-[#fcee0a]/35 rounded px-2 py-1 leading-tight"
                        >
                          {liveVoice.syncNotice}
                        </div>
                      )}

                      {liveVoice.error && (
                        <div className="text-[10px] text-[#ff7aa8] leading-tight">
                          {liveVoice.error}
                        </div>
                      )}

                      {((liveVoice.camActive && liveVoice.localCamStream) ||
                        (liveVoice.screenActive && liveVoice.localScreenStream) ||
                        liveVoice.remoteVideoPeers.length > 0) && (
                        <div
                          data-testid="preview-live-video-grid"
                          className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto geek-chat-scroll"
                        >
                          {liveVoice.camActive && liveVoice.localCamStream && (
                            <StreamVideoPreview stream={liveVoice.localCamStream} label="Вы · Камера" />
                          )}
                          {liveVoice.screenActive && liveVoice.localScreenStream && (
                            <StreamVideoPreview stream={liveVoice.localScreenStream} label="Вы · Экран" />
                          )}
                          {liveVoice.remoteVideoPeers.map((rv) => {
                            const remotePeer = liveVoice.peers.find((p) => p.peerId === rv.peerId);
                            const streamKind = remotePeer?.screenActive ? 'Экран' : 'Камера';
                            const label = remotePeer
                              ? `${remotePeer.nick} · ${streamKind}`
                              : 'Участник';
                            return (
                              <StreamVideoPreview
                                key={rv.peerId}
                                stream={rv.stream}
                                label={label}
                              />
                            );
                          })}
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          data-testid="preview-live-cam-btn"
                          onClick={() => void liveVoice.toggleCamera()}
                          aria-pressed={liveVoice.camActive}
                          className={`py-1 px-1.5 rounded border text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                            liveVoice.camActive
                              ? 'bg-[#10b981]/25 border-[#10b981] text-[#6ee7b7]'
                              : 'bg-[#0d1829] border-[#00f0ff]/15 text-[#b4cde0] hover:text-white'
                          }`}
                        >
                          <Video className="w-3 h-3 shrink-0" />
                          <span className="truncate">Камера</span>
                        </button>
                        <button
                          type="button"
                          data-testid="preview-live-screen-btn"
                          onClick={() => void liveVoice.toggleScreen()}
                          aria-pressed={liveVoice.screenActive}
                          className={`py-1 px-1.5 rounded border text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                            liveVoice.screenActive
                              ? 'bg-[#ff2a85]/25 border-[#ff2a85] text-[#ffaec2]'
                              : 'bg-[#0d1829] border-[#00f0ff]/15 text-[#b4cde0] hover:text-white'
                          }`}
                        >
                          <Monitor className="w-3 h-3 shrink-0" />
                          <span className="truncate">Экран</span>
                        </button>
                        <button
                          type="button"
                          data-testid="preview-live-loopback-btn"
                          onClick={() => void liveVoice.toggleLoopback()}
                          aria-pressed={liveVoice.loopbackActive}
                          title="Услышать собственный микрофон (проверка в 1 вкладке)"
                          className={`py-1 px-1.5 rounded border text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                            liveVoice.loopbackActive
                              ? 'bg-[#00f0ff]/25 border-[#00f0ff] text-white'
                              : 'bg-[#0d1829] border-[#00f0ff]/15 text-[#b4cde0] hover:text-white'
                          }`}
                        >
                          <Radio className="w-3 h-3 shrink-0" />
                          <span className="truncate">Эхо</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            data-testid="preview-vdock-status"
                            className="text-[10px] font-extrabold uppercase truncate text-[#10b981]"
                          >
                            {connectedVoiceServer?.id === activeServer.id
                              ? '🟢 В ЭФИРЕ'
                              : `🟢 В ЭФИРЕ · ${connectedVoiceServer?.name}`}
                          </div>
                          <div
                            data-testid="preview-vdock-room"
                            className="text-xs font-bold text-white truncate"
                          >
                            {connectedVoiceServer?.voiceChannel}
                          </div>
                        </div>
                        <button
                          type="button"
                          data-testid="preview-voice-dock-btn"
                          onClick={handleLeaveVoice}
                          className="px-2.5 py-1 rounded text-[10.5px] font-extrabold cursor-pointer transition-colors shrink-0 bg-[#ff2a85]/25 border border-[#ff2a85] text-[#ff80a0] hover:bg-[#ff2a85] hover:text-white"
                        >
                          ВЫЙТИ
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCamActive((prev) => !prev)}
                          aria-pressed={camActive}
                          className={`py-1 px-2 rounded border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                            camActive
                              ? 'bg-[#10b981]/25 border-[#10b981] text-[#6ee7b7]'
                              : 'bg-[#0d1829] border-[#00f0ff]/15 text-[#b4cde0] hover:text-white'
                          }`}
                        >
                          <Video className="w-3 h-3" />
                          <span>Камера</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setScreenActive((prev) => !prev)}
                          aria-pressed={screenActive}
                          className={`py-1 px-2 rounded border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                            screenActive
                              ? 'bg-[#ff2a85]/25 border-[#ff2a85] text-[#ffaec2]'
                              : 'bg-[#0d1829] border-[#00f0ff]/15 text-[#b4cde0] hover:text-white'
                          }`}
                        >
                          <Monitor className="w-3 h-3" />
                          <span>Экран</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Bottom User Bar with Hex Controls */}
              <div className="h-[54px] px-2.5 bg-[#040810] border-t border-[#00f0ff]/15 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                  <HexAvatar
                    initials={voiceUnlockToken ? computeLiveVoiceInitials(liveVoice.nick) : 'ГО'}
                    color="#3b82f6"
                    sizeClass="w-8 h-8 text-[10px]"
                    online={liveVoice.connected ? !liveVoice.deafened : !deafened}
                    showDot
                  />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        data-testid="preview-user-bar-nick"
                        className="text-[11.5px] font-extrabold text-white truncate"
                      >
                        {voiceUnlockToken ? liveVoice.nick : 'Вы (Гость)'}
                      </span>
                      <span className="inline-flex items-center px-1 py-[1px] rounded text-[8px] font-black uppercase tracking-tight whitespace-nowrap shrink-0 geek-badge-set1">
                        🌙 LUCY NET
                      </span>
                    </div>
                    <div
                      data-testid="preview-guest-status"
                      className="text-[10px] text-[#00f0ff] truncate"
                    >
                      {liveVoice.connected
                        ? liveVoice.deafened
                          ? 'Звук выкл'
                          : liveVoice.micMuted
                            ? 'Микрофон выкл'
                            : liveVoice.loopbackActive
                              ? 'Эхо-тест'
                              : 'Live в эфире'
                        : !connectedVoiceServer
                          ? 'Не в голосе'
                          : deafened
                            ? 'Звук выкл'
                            : micMuted
                              ? 'Микрофон выкл'
                              : 'В эфире'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (liveVoice.connected) {
                        liveVoice.toggleMicMute();
                      } else {
                        setMicMuted((prev) => !prev);
                      }
                    }}
                    aria-pressed={liveVoice.connected ? liveVoice.micMuted : micMuted}
                    aria-label={(liveVoice.connected ? liveVoice.micMuted : micMuted) ? 'Включить микрофон' : 'Выключить микрофон'}
                    title={(liveVoice.connected ? liveVoice.micMuted : micMuted) ? 'Включить микрофон' : 'Выключить микрофон'}
                    className={`w-8 h-8 geek-hex flex items-center justify-center cursor-pointer transition-colors ${
                      (liveVoice.connected ? liveVoice.micMuted : micMuted)
                        ? 'bg-[#ff2a85]/25 text-[#ff2a85]'
                        : 'bg-[#0d1829] text-[#00f0ff]'
                    }`}
                  >
                    {(liveVoice.connected ? liveVoice.micMuted : micMuted) ? (
                      <MicOff className="w-3.5 h-3.5" />
                    ) : (
                      <Mic className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (liveVoice.connected) {
                        liveVoice.toggleDeafen();
                      } else {
                        setDeafened((prev) => !prev);
                      }
                    }}
                    aria-pressed={liveVoice.connected ? liveVoice.deafened : deafened}
                    aria-label={(liveVoice.connected ? liveVoice.deafened : deafened) ? 'Включить звук' : 'Отключить звук'}
                    title={(liveVoice.connected ? liveVoice.deafened : deafened) ? 'Включить звук' : 'Отключить звук'}
                    className={`w-8 h-8 geek-hex flex items-center justify-center cursor-pointer transition-colors ${
                      (liveVoice.connected ? liveVoice.deafened : deafened)
                        ? 'bg-[#ff2a85]/25 text-[#ff2a85]'
                        : 'bg-[#0d1829] text-[#00f0ff]'
                    }`}
                  >
                    {(liveVoice.connected ? liveVoice.deafened : deafened) ? (
                      <VolumeX className="w-3.5 h-3.5" />
                    ) : (
                      <Headphones className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </aside>
          )}

          {/* 3. Main Chat Stream & Console */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#040912]/70">
            {/* Audio Stream Header Card with Wave Equalizer */}
            <div className="shrink-0 m-2.5 sm:m-3.5 mb-0 px-3 sm:px-3.5 py-2 rounded-[10px] bg-[#0a1320]/90 border border-[#00f0ff]/15 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[#00f0ff] text-lg font-black shrink-0">#</span>
                <div className="min-w-0">
                  <div className="text-[9px] sm:text-[9.5px] font-extrabold uppercase text-[#00f0ff] truncate">
                    АКТИВНЫЙ ПОТОК // {activeServer.name.toUpperCase()}
                  </div>
                  <div className="text-xs sm:text-sm font-extrabold text-white truncate">
                    {activeChannel.name}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!showChannels && (connectedVoiceServer || liveVoice.connected) && (
                  <button
                    type="button"
                    onClick={handleToggleChannels}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#10b981]/15 border border-[#10b981]/50 text-[#6ee7b7] text-[10px] font-extrabold cursor-pointer hover:bg-[#10b981]/25 transition-colors whitespace-nowrap"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                    <span>{liveVoice.connected ? 'LIVE ГОЛОС' : 'В ЭФИРЕ'}</span>
                  </button>
                )}

                {/* Equalizer wave */}
                <div className="hidden sm:flex items-center justify-center gap-[3px] h-5" aria-hidden="true">
                  {WAVE_DELAYS.map((delay, i) => {
                    const isLiveAudioWave =
                      (connectedVoiceServer && !deafened) ||
                      (liveVoice.connected && !liveVoice.deafened);
                    return (
                      <span
                        key={i}
                        className={`w-[3px] h-full bg-[#00f0ff] rounded-sm ${
                          isLiveAudioWave ? 'geek-eq-bar-live opacity-80' : 'opacity-30 scale-y-25'
                        }`}
                        style={isLiveAudioWave ? { animationDelay: delay } : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Messages Container (stretches flush to input border) */}
            <div
              ref={messagesScrollRef}
              className="flex-1 min-h-0 px-2.5 sm:px-3.5 py-3 space-y-2.5 overflow-y-auto geek-chat-scroll"
              data-testid="preview-messages"
            >
              {allMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="flex gap-3 px-3 py-2.5 rounded-lg border bg-[#0a1320]/90 border-[#00f0ff]/15"
                >
                  <HexAvatar
                    initials={msg.initials}
                    color={msg.avatarColor}
                    sizeClass="w-10 h-10 text-xs mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13.5px] font-extrabold text-[#00f0ff]">
                        {msg.author}
                      </span>
                      <CyberBadge setKey={msg.badgeSet} />
                      <span className="text-[10.5px] text-[#63809b] font-mono">{msg.time}</span>
                    </div>
                    <p className="text-[13.5px] text-[#e6f7ff] mt-1 leading-snug break-words whitespace-pre-wrap">
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}
              {typingPeerName && (
                <div
                  data-testid="preview-typing-indicator"
                  className="px-3 py-1.5 text-[11px] font-mono-tech text-[#00f0ff] flex items-center gap-2"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                  <span>{typingPeerName} печатает ответ...</span>
                </div>
              )}
            </div>

            {/* Docked Bottom Input Area (flush against chat stream) + Collapsible Quick Questions */}
            <div className="shrink-0 border-t border-[#00f0ff]/35 bg-[#060c16]/95 px-3.5 py-2.5 space-y-2">
              {showQuickQuestions && (
                <div
                  id="preview-qa-drawer"
                  data-testid="preview-qa-drawer"
                  className="rounded-lg bg-[#091220] border border-[#00f0ff]/30 px-2.5 py-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[9.5px] font-extrabold uppercase text-[#00f0ff]">
                    <span>БЫСТРЫЕ ВОПРОСЫ ДЛЯ ЧАТА</span>
                    <button
                      type="button"
                      onClick={() => setShowQuickQuestions(false)}
                      className="text-[#63809b] hover:text-white cursor-pointer transition-colors"
                    >
                      СКРЫТЬ ✕
                    </button>
                  </div>
                  <div
                    data-testid="preview-qa-chips"
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {PREVIEW_QUICK_QUESTIONS.map((qText) => (
                      <button
                        key={qText}
                        type="button"
                        onClick={() => submitPreviewQuestion(qText)}
                        className="text-[10.5px] font-semibold px-2.5 py-1 rounded bg-[#00f0ff]/10 border border-[#00f0ff]/25 text-[#9eeeff] hover:bg-[#00f0ff]/20 hover:border-[#00f0ff]/60 hover:text-white transition-colors cursor-pointer"
                      >
                        {qText}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[9px] font-extrabold uppercase text-[#63809b] gap-2 flex-wrap">
                <span>
                  {unlockToken
                    ? '🔓 СВОБОДНЫЙ РЕЖИМ АКТИВЕН (/lock — ВЫЙТИ)'
                    : 'ОКНО ВВОДА // КОНСОЛЬ'}
                </span>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="hidden sm:inline text-[#63809b]">
                    КАНАЛ #{activeChannel.name.toUpperCase()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowQuickQuestions((prev) => !prev)}
                    aria-expanded={showQuickQuestions}
                    aria-controls="preview-qa-drawer"
                    data-testid="preview-qa-toggle"
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[9.5px] font-extrabold uppercase transition-colors cursor-pointer ${
                      showQuickQuestions
                        ? 'bg-[#00f0ff]/20 border-[#00f0ff] text-white'
                        : 'bg-[#0a1320] border-[#00f0ff]/30 text-[#9eeeff] hover:border-[#00f0ff] hover:text-white'
                    }`}
                  >
                    <HelpCircle className="w-3 h-3 text-[#00f0ff]" />
                    <span>Быстрые вопросы ({PREVIEW_QUICK_QUESTIONS.length})</span>
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-150 ${
                        showQuickQuestions ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSend} className="flex items-center gap-2">
                <span
                  className="hidden sm:flex w-9 h-9 rounded-md bg-[#00f0ff]/10 border border-[#00f0ff]/40 text-[#00f0ff] items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <Paperclip className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Написать в #${activeChannel.name}...`}
                  aria-label={`Сообщение в канал ${activeChannel.name}`}
                  data-testid="preview-chat-input"
                  className="flex-1 min-w-0 bg-[#050a12] border border-[#00f0ff]/25 focus:border-[#00f0ff] focus:outline-none rounded-md px-3 py-2 text-sm text-[#e6f7ff] placeholder:text-[#63809b]"
                />
                <button
                  type="submit"
                  data-testid="preview-chat-send"
                  className="bg-[#00f0ff] text-[#031518] px-3 sm:px-4 py-2 rounded-md font-extrabold text-[11px] sm:text-[11.5px] uppercase hover:brightness-110 transition-all cursor-pointer shrink-0"
                >
                  ОТПРАВИТЬ
                </button>
              </form>
            </div>
          </div>

          {/* 4. Right Members Panel (collapsible on desktop & slide-over drawer on mobile) */}
          {showMembers && (
            <aside
              aria-label="Участники сервера"
              data-testid="preview-members-panel"
              className="absolute inset-y-0 right-0 z-30 w-[min(82vw,270px)] shadow-[-8px_0_32px_rgba(0,0,0,0.75)] lg:static lg:z-auto lg:w-[244px] lg:shadow-none bg-[#060b14]/98 lg:bg-[#060b14]/92 border-l border-[#00f0ff]/30 lg:border-[#00f0ff]/15 px-3 py-3 shrink-0 min-h-0 overflow-y-auto geek-chat-scroll"
            >
              <div className="flex items-center justify-between gap-2 px-1.5 pb-2">
                <div className="text-[10.5px] font-extrabold uppercase text-[#00f0ff] truncate">
                  ⬢ В сети — {onlineMembers.length}
                </div>
                <button
                  type="button"
                  onClick={handleCloseMembers}
                  aria-label="Свернуть список онлайна"
                  data-testid="preview-close-members-btn"
                  title="Свернуть список онлайна"
                  className="w-6 h-6 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1 mb-3">
                {onlineMembers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-[#00f0ff]/10 transition-colors"
                  >
                    <HexAvatar
                      initials={m.initials}
                      color={m.avatarColor}
                      sizeClass="w-8 h-8 text-[10px]"
                      online
                      showDot
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-[#e6f7ff] truncate">
                          {m.nick}
                          {m.inVoice ? ' 🔊' : ''}
                        </span>
                        <CyberBadge setKey={m.badgeSet} />
                      </div>
                      {m.customStatus && (
                        <div className="text-[10px] text-[#63809b] truncate">{m.customStatus}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {offlineMembers.length > 0 && (
                <>
                  <div className="text-[10.5px] font-extrabold uppercase text-[#00f0ff] px-1.5 pb-1.5">
                    ⬡ Не в сети — {offlineMembers.length}
                  </div>
                  <div className="space-y-1 opacity-55">
                    {offlineMembers.map((m) => (
                      <div key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md">
                        <HexAvatar
                          initials={m.initials}
                          color={m.avatarColor}
                          sizeClass="w-8 h-8 text-[10px]"
                          online={false}
                          showDot
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-[#b4cde0] truncate">{m.nick}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </aside>
          )}
            </>
          )}
          </div>
        </div>

        {/* Bottom Shortcut Binds Strip */}
        <div className="shrink-0 hidden sm:flex h-7 px-3.5 bg-[#03060c] border-t border-[#00f0ff]/15 items-center justify-between gap-4 text-[10px] font-mono-tech text-[#63809b]">
          <span className="truncate">
            БИНДЫ: МИКР [Alt+M] • ЗВУК [Alt+D] • КАМЕРА [Alt+C] • ЭКРАН ПРЕВЬЮ [Alt+F]
          </span>
          <span className="text-[#00f0ff]/80 whitespace-nowrap shrink-0">
            GEEK // CYBER.NET · P2P
          </span>
        </div>
      </div>
    </section>
  );
}
