import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ChevronDown,
  Headphones,
  HelpCircle,
  Mic,
  MicOff,
  Monitor,
  Paperclip,
  PhoneCall,
  Users,
  Video,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  BADGE_META,
  PREVIEW_QUICK_QUESTIONS,
  PREVIEW_SERVERS,
  createUserPreviewMessage,
  generatePreviewPeerReply,
  getVoicePeersForServer,
  toggleVoiceForViewedServer,
  type PreviewBadgeSet,
  type PreviewMessage,
  type PreviewServerId,
} from '../utils/platformPreview';
import { usePreBetaCall } from '../hooks/usePreBetaCall';
import { PreBetaWorkspace } from './PreBetaWorkspace';
import { formatCountdownMs, normalizePreBetaCode } from '../utils/preBetaSession';
import { probePreviewBackend } from '../utils/previewTransport';

const WAVE_DELAYS = ['0s', '.2s', '.4s', '.1s', '.3s', '.5s', '.15s', '.35s', '.05s', '.25s', '.45s', '.12s'];

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

export function PlatformPreview({ openPreBetaSignal = 0 }: { openPreBetaSignal?: number }) {
  const [activeServerId, setActiveServerId] = useState<PreviewServerId>('cy-4371');
  const [preBetaMode, setPreBetaMode] = useState<boolean>(false);
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
  const [showMembers, setShowMembers] = useState(true);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showQuickQuestions, setShowQuickQuestions] = useState(false);
const UNLOCK_STORAGE_KEY = 'geek_preview_unlock_token';

  const [unlockToken, setUnlockToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(UNLOCK_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [typingPeerName, setTypingPeerName] = useState<string | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const replyCountRef = useRef<number>(0);
  const replyTimersRef = useRef<number[]>([]);
  const liveReplyUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

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
    setVoiceServerId((prev) => {
      const next = toggleVoiceForViewedServer(prev, targetServerId);
      if (next === null) {
        setCamActive(false);
        setScreenActive(false);
      }
      return next;
    });
  };

  const handleLeaveVoice = () => {
    setVoiceServerId(null);
    setCamActive(false);
    setScreenActive(false);
  };

  const handleSelectServer = (srvId: PreviewServerId) => {
    setPreBetaMode(false);
    setActiveServerId(srvId);
  };

  const handleSelectChannel = (chId: string) => {
    setActiveChannelByServer((prev) => ({
      ...prev,
      [activeServer.id]: chId,
    }));
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
      if (isMountedRef.current && cfg.liveEnabled && cfg.replyUrl) {
        liveReplyUrlRef.current = cfg.replyUrl;
      }
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

    const activeToken = unlockToken;
    const newMsg = createUserPreviewMessage(trimmedRaw, new Date(), activeToken ? 2000 : 220);
    if (!newMsg) return;

    const replyIdx = replyCountRef.current;
    replyCountRef.current += 1;
    const historyPool = activeToken ? (customMessages[targetKey] ?? []) : allMessages;
    const recentHistory = historyPool
      .filter((m) => m.text !== '🔐 [Код доступа принят]' && !m.text.startsWith('🔓 ') && !m.text.startsWith('🔒 '))
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

    const replyUrl = liveReplyUrlRef.current;
    if (!replyUrl) {
      scheduleFallbackReply(newMsg.text, targetServerId, targetChannelId, targetKey, replyIdx);
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
        };
        if (!data.ok || !data.reply) throw new Error('Invalid reply');
        if (!isMountedRef.current) return;
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
      .catch(() => {
        if (!isMountedRef.current) return;
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
      className="w-full max-w-6xl mx-auto mt-20 text-left"
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#0b1220]/90 border border-[#00f0ff]/25 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPreBetaMode(false)}
            aria-pressed={!preBetaMode}
            className={`px-4 py-2.5 rounded-xl font-cyber font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer ${
              !preBetaMode
                ? 'bg-[#00f0ff]/20 border border-[#00f0ff] text-white'
                : 'bg-[#060b14] border border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            Обзор клиента (Демо-серверы)
          </button>
          <button
            type="button"
            onClick={() => setPreBetaMode(true)}
            aria-pressed={preBetaMode}
            data-testid="prebeta-banner-btn"
            className={`px-4 py-2.5 rounded-xl font-cyber font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              preBetaMode
                ? 'bg-[#00f0ff] border border-[#00f0ff] text-[#031518] shadow-[0_0_24px_rgba(0,240,255,0.65)]'
                : 'bg-gradient-to-r from-[#ff007f] to-[#ff2a85] border border-[#ff8ac4]/70 text-white shadow-[0_0_24px_rgba(255,0,127,0.55)] hover:brightness-110'
            }`}
          >
            <PhoneCall className="w-4 h-4 shrink-0" />
            <span>
              {preBeta.roomSnapshot
                ? `PRE-BETA СВЯЗЬ АКТИВНА · ${formatCountdownMs(preBeta.remainingMs)}`
                : 'PRE-BETA СВЯЗЬ 1-НА-1 · 30 МИН ДО РЕЛИЗА'}
            </span>
          </button>
        </div>
        <span className="text-[11px] font-mono-tech text-[#fcee0a] px-2">
          1 одноразовый код · макс. 2 участника · лимит 30:00
        </span>
      </div>

      {/* Authentic GEEK // CYBER.NET Application Window */}
      <div className="geek-pcb-bg rounded-2xl border border-[#00f0ff]/35 shadow-neon-cyan overflow-hidden text-[#e6f7ff]">
        {/* Top App Bar */}
        <div className="min-h-[42px] bg-[#04070d]/95 border-b border-[#00f0ff]/15 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 font-black text-xs tracking-wider text-white">
              <Zap className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span>GEEK</span>
            </div>
            <span className="bg-[#ff2a85]/20 border border-[#ff2a85]/50 text-[#ff7aa8] text-[9px] font-extrabold px-1.5 py-0.5 rounded">
              CYBER.NET
            </span>
            <span className="hidden sm:inline-block bg-[#00f0ff]/5 border border-[#00f0ff]/15 text-[#63809b] text-[10px] font-bold px-2.5 py-0.5 rounded">
              МЕСТО ДЛЯ СВОИХ // P2P ПРОТОКОЛ
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setPreBetaMode((prev) => !prev)}
              aria-pressed={preBetaMode}
              data-testid="prebeta-mode-btn"
              className={`inline-flex items-center gap-1.5 text-[10.5px] font-extrabold px-2.5 py-1 rounded-md border transition-all cursor-pointer whitespace-nowrap ${
                preBetaMode
                  ? 'bg-[#00f0ff] border-[#00f0ff] text-[#031518] shadow-[0_0_16px_rgba(0,240,255,0.6)]'
                  : 'bg-gradient-to-r from-[#ff007f] to-[#ff2a85] border-[#ff8ac4]/60 text-white shadow-[0_0_16px_rgba(255,0,127,0.5)] hover:brightness-110'
              }`}
            >
              <PhoneCall className="w-3 h-3" />
              <span>
                {preBeta.roomSnapshot
                  ? `PRE-BETA LIVE (${formatCountdownMs(preBeta.remainingMs)})`
                  : 'PRE-BETA СВЯЗЬ · 30 МИН'}
              </span>
            </button>
            <span className="inline-flex items-center gap-1.5 bg-[#10b981]/10 border border-[#10b981]/40 text-[#6ee7b7] text-[10.5px] font-bold px-2.5 py-1 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
              <span>{preBetaMode ? 'pre-beta-1on1' : activeServer.id}</span>
            </span>
            <button
              type="button"
              onClick={handleCopyInvite}
              className="bg-gradient-to-br from-[#ff2a85]/35 to-[#9d174d]/50 border border-[#ff2a85] text-white text-[10.5px] font-extrabold px-2.5 py-1 rounded-md hover:brightness-110 transition-all cursor-pointer whitespace-nowrap"
            >
              {inviteCopied ? '✓ СКОПИРОВАНО' : '+ ПРИГЛАСИТЬ'}
            </button>
          </div>
        </div>

        {/* Sub Sync Bar */}
        <div className="h-8 bg-[#060b14]/95 border-b border-[#00f0ff]/15 px-3 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 font-bold text-[#00f0ff] min-w-0 truncate">
            <span className="shrink-0">●</span>
            <span className="hidden sm:inline shrink-0">АКТИВНАЯ СЕТЬ:</span>
            <span className="text-white font-extrabold truncate">
              {preBetaMode ? 'PRE-BETA 1-НА-1 // 30 МИН' : 'P2P СИНХРОНИЗАЦИЯ'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowMembers((prev) => !prev)}
            aria-pressed={showMembers}
            className="bg-[#00f0ff]/10 border border-[#00f0ff]/20 hover:border-[#00f0ff]/50 text-[#e6f7ff] text-[10.5px] font-bold px-2.5 py-1 rounded flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
          >
            <Users className="w-3 h-3 text-[#00f0ff]" />
            <span>УЧАСТНИКИ</span>
          </button>
        </div>

        {/* Main 4-Pane Workspace */}
        <div className="flex flex-col lg:flex-row min-h-[470px] lg:h-[640px]">
          {/* 1. Left Hexagonal Servers Rail */}
          <div
            role="navigation"
            aria-label="Серверы Geek"
            className="bg-[#04070d]/95 border-b lg:border-b-0 lg:border-r border-[#00f0ff]/15 px-3 py-2.5 lg:py-3 lg:px-0 lg:w-[66px] flex lg:flex-col items-center gap-2.5 shrink-0 overflow-x-auto"
          >
            <div
              className="w-10 h-10 geek-hex bg-[#0d1829] text-[#fcee09] flex items-center justify-center shrink-0"
              title="Профиль GEEK // CYBER.NET"
            >
              <Zap className="w-4 h-4" />
            </div>

            <div className="w-px h-6 lg:w-6 lg:h-px bg-[#00f0ff]/20 shrink-0" />

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
                    className={`w-11 h-11 geek-hex font-extrabold text-xs flex items-center justify-center transition-all cursor-pointer ${
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
                      className="pointer-events-none absolute -top-0.5 right-1 lg:right-2 w-2.5 h-2.5 rounded-full bg-[#10b981] border border-[#04070d] shadow-[0_0_8px_#10b981]"
                    />
                  )}
                </div>
              );
            })}

            <div className="w-px h-6 lg:w-6 lg:h-px bg-[#ff2a85]/35 shrink-0" />

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
                className={`w-11 h-11 geek-hex font-extrabold text-xs flex items-center justify-center transition-all cursor-pointer ${
                  preBetaMode
                    ? 'bg-[#ff2a85] text-white shadow-[0_0_18px_rgba(255,42,133,0.8)]'
                    : 'bg-[#2b0f26] text-[#ff7aa8] shadow-[0_0_12px_rgba(255,42,133,0.35)] hover:bg-[#ff2a85] hover:text-white'
                }`}
              >
                PB
              </button>
            </div>
          </div>

          {preBetaMode ? (
            <PreBetaWorkspace
              controller={preBeta}
              initialJoinCode={initialPreBetaCode}
              showMembers={showMembers}
            />
          ) : (
            <>

          {/* 2. Channels Sidebar + Voice Dock + User Bar */}
          <aside className="lg:w-[272px] bg-[#060b14]/92 border-b lg:border-b-0 lg:border-r border-[#00f0ff]/15 flex flex-col justify-between shrink-0 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto geek-chat-scroll">
              {/* Server Title Header */}
              <div className="px-3.5 py-2.5 border-b border-[#00f0ff]/15 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[9px] font-extrabold uppercase tracking-wider text-[#00f0ff]">
                    ОТКРЫТЫЙ СЕРВЕР
                  </div>
                  <div className="text-[15px] font-black text-white truncate mt-0.5">
                    {activeServer.name}
                  </div>
                </div>
                <span className="bg-[#00f0ff]/10 border border-[#00f0ff]/40 text-[#00f0ff] text-[9.5px] font-bold px-2 py-0.5 rounded shrink-0">
                  {activeServer.id}
                </span>
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
              </div>
            </div>

            <div className="shrink-0">
              {/* Voice Dock */}
              <div className="bg-[#06101a]/95 border-t border-[#00f0ff]/35 px-2.5 py-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      data-testid="preview-vdock-status"
                      className={`text-[10px] font-extrabold uppercase truncate ${
                        connectedVoiceServer ? 'text-[#10b981]' : 'text-[#63809b]'
                      }`}
                    >
                      {connectedVoiceServer
                        ? connectedVoiceServer.id === activeServer.id
                          ? '🟢 В ЭФИРЕ'
                          : `🟢 В ЭФИРЕ · ${connectedVoiceServer.name}`
                        : '📡 ГОЛОСОВОЙ КАНАЛ'}
                    </div>
                    <div
                      data-testid="preview-vdock-room"
                      className="text-xs font-bold text-white truncate"
                    >
                      {connectedVoiceServer
                        ? connectedVoiceServer.voiceChannel
                        : activeServer.voiceChannel}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="preview-voice-dock-btn"
                    onClick={() =>
                      connectedVoiceServer
                        ? handleLeaveVoice()
                        : handleToggleVoiceChannel(activeServer.id)
                    }
                    className={`px-2.5 py-1 rounded text-[10.5px] font-extrabold cursor-pointer transition-colors shrink-0 ${
                      connectedVoiceServer
                        ? 'bg-[#ff2a85]/25 border border-[#ff2a85] text-[#ff80a0]'
                        : 'bg-[#00f0ff] text-[#031518]'
                    }`}
                  >
                    {connectedVoiceServer ? 'ВЫЙТИ' : 'ВОЙТИ'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!voiceServerId) setVoiceServerId(activeServer.id);
                      setCamActive((prev) => !prev);
                    }}
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
                    onClick={() => {
                      if (!voiceServerId) setVoiceServerId(activeServer.id);
                      setScreenActive((prev) => !prev);
                    }}
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
              </div>

              {/* Bottom User Bar with Hex Controls */}
              <div className="h-[54px] px-2.5 bg-[#040810] border-t border-[#00f0ff]/15 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                  <HexAvatar
                    initials="ГО"
                    color="#3b82f6"
                    sizeClass="w-8 h-8 text-[10px]"
                    online={!deafened}
                    showDot
                  />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[11.5px] font-extrabold text-white whitespace-nowrap shrink-0">Вы (Гость)</span>
                      <span className="inline-flex items-center px-1 py-[1px] rounded text-[8px] font-black uppercase tracking-tight whitespace-nowrap shrink-0 geek-badge-set1">
                        🌙 LUCY NET
                      </span>
                    </div>
                    <div
                      data-testid="preview-guest-status"
                      className="text-[10px] text-[#00f0ff] truncate"
                    >
                      {!connectedVoiceServer
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
                    onClick={() => setMicMuted((prev) => !prev)}
                    aria-pressed={micMuted}
                    aria-label={micMuted ? 'Включить микрофон' : 'Выключить микрофон'}
                    title={micMuted ? 'Включить микрофон' : 'Выключить микрофон'}
                    className={`w-8 h-8 geek-hex flex items-center justify-center cursor-pointer transition-colors ${
                      micMuted ? 'bg-[#ff2a85]/25 text-[#ff2a85]' : 'bg-[#0d1829] text-[#00f0ff]'
                    }`}
                  >
                    {micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeafened((prev) => !prev)}
                    aria-pressed={deafened}
                    aria-label={deafened ? 'Включить звук' : 'Отключить звук'}
                    title={deafened ? 'Включить звук' : 'Отключить звук'}
                    className={`w-8 h-8 geek-hex flex items-center justify-center cursor-pointer transition-colors ${
                      deafened ? 'bg-[#ff2a85]/25 text-[#ff2a85]' : 'bg-[#0d1829] text-[#00f0ff]'
                    }`}
                  >
                    {deafened ? <VolumeX className="w-3.5 h-3.5" /> : <Headphones className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* 3. Main Chat Stream & Console */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#08101c]/90">
            {/* Audio Stream Header Card with Wave Equalizer */}
            <div className="shrink-0 m-3 mb-0 px-3 py-2 rounded-[10px] bg-[#0a1320]/90 border border-[#00f0ff]/15 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[#00f0ff] text-lg font-black">#</span>
                <div className="min-w-0">
                  <div className="text-[9.5px] font-extrabold uppercase text-[#00f0ff] truncate">
                    АКТИВНЫЙ ПОТОК // {activeServer.name.toUpperCase()}
                  </div>
                  <div className="text-sm font-extrabold text-white truncate">
                    {activeChannel.name}
                  </div>
                </div>
              </div>

              {/* Equalizer wave */}
              <div className="hidden sm:flex items-center justify-center gap-[3px] h-5" aria-hidden="true">
                {WAVE_DELAYS.map((delay, i) => (
                  <span
                    key={i}
                    className={`w-[3px] h-full bg-[#00f0ff] rounded-sm ${
                      connectedVoiceServer && !deafened ? 'geek-eq-bar-live opacity-80' : 'opacity-30 scale-y-25'
                    }`}
                    style={connectedVoiceServer && !deafened ? { animationDelay: delay } : undefined}
                  />
                ))}
              </div>
            </div>

            {/* Messages Container (stretches flush to input border) */}
            <div
              ref={messagesScrollRef}
              className="flex-1 min-h-0 px-3 py-3 space-y-2 overflow-y-auto geek-chat-scroll max-h-[380px] lg:max-h-none"
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
            <div className="shrink-0 border-t border-[#00f0ff]/35 bg-[#060c16]/95 px-3 py-2.5 space-y-2">
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
                    : `КАНАЛ #${activeChannel.name.toUpperCase()} // ЧАТ С УЧАСТНИКАМИ`}
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

              <form onSubmit={handleSend} className="flex items-center gap-2">
                <span
                  className="w-9 h-9 rounded-md bg-[#00f0ff]/10 border border-[#00f0ff]/40 text-[#00f0ff] flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <Paperclip className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Задайте вопрос собеседникам в #${activeChannel.name}...`}
                  aria-label={`Сообщение в канал ${activeChannel.name}`}
                  data-testid="preview-chat-input"
                  className="flex-1 min-w-0 bg-[#050a12] border border-[#00f0ff]/25 focus:border-[#00f0ff] focus:outline-none rounded-md px-3 py-2 text-sm text-[#e6f7ff] placeholder:text-[#63809b]"
                />
                <button
                  type="submit"
                  data-testid="preview-chat-send"
                  className="bg-[#00f0ff] text-[#031518] px-3.5 py-2 rounded-md font-extrabold text-[11.5px] uppercase hover:brightness-110 transition-all cursor-pointer shrink-0"
                >
                  ОТПРАВИТЬ
                </button>
              </form>
            </div>
          </div>

          {/* 4. Right Members Panel (toggleable) */}
          {showMembers && (
            <aside
              aria-label="Участники сервера"
              className="lg:w-[225px] bg-[#060b14]/92 border-t lg:border-t-0 lg:border-l border-[#00f0ff]/15 px-2.5 py-3 shrink-0 lg:overflow-y-auto geek-chat-scroll"
            >
              <div className="text-[10.5px] font-extrabold uppercase text-[#00f0ff] px-1.5 pb-1.5">
                ⬢ В сети — {onlineMembers.length}
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
    </section>
  );
}
