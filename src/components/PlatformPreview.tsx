import { useEffect, useState, type FormEvent } from 'react';
import { Headphones, Mic, MicOff, Monitor, Paperclip, PhoneCall, Users, Video, Volume2, VolumeX, Zap } from 'lucide-react';
import {
  BADGE_META,
  PREVIEW_SERVERS,
  createUserPreviewMessage,
  type PreviewBadgeSet,
  type PreviewMessage,
  type PreviewServerId,
} from '../utils/platformPreview';
import { usePreBetaCall } from '../hooks/usePreBetaCall';
import { PreBetaWorkspace } from './PreBetaWorkspace';
import { formatCountdownMs, normalizePreBetaCode } from '../utils/preBetaSession';

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
  const [inVoice, setInVoice] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const [screenActive, setScreenActive] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [inviteCopied, setInviteCopied] = useState(false);

  const preBeta = usePreBetaCall();

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const codeParam = params.get('prebeta');
      if (codeParam) {
        const normalized = normalizePreBetaCode(codeParam);
        if (normalized) {
          setInitialPreBetaCode(normalized);
          setPreBetaMode(true);
        }
      }
    } catch {
      // Ignore malformed URL params
    }
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
  const voicePeers = [
    ...(inVoice
      ? [
          {
            id: 'guest-self',
            nick: 'Вы (Гость)',
            initials: 'ГО',
            avatarColor: '#3b82f6',
            speaking: !micMuted && !deafened,
            inCam: camActive,
            inScreen: screenActive,
          },
        ]
      : []),
    ...activeServer.members
      .filter((m) => m.online && m.inVoice)
      .map((m) => ({
        id: m.id,
        nick: m.nick,
        initials: m.initials,
        avatarColor: m.avatarColor,
        speaking: Boolean(m.speaking),
        inCam: false,
        inScreen: false,
      })),
  ];

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

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const newMsg = createUserPreviewMessage(draft);
    if (!newMsg) return;
    setCustomMessages((prev) => ({
      ...prev,
      [messageKey]: [...(prev[messageKey] ?? []), newMsg].slice(-6),
    }));
    setDraft('');
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
            className={`px-4 py-2.5 rounded-xl font-cyber font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer ${
              preBetaMode
                ? 'bg-[#ff2a85] border border-[#ff2a85] text-white shadow-[0_0_20px_rgba(255,42,133,0.45)]'
                : 'bg-gradient-to-r from-[#ff2a85]/25 to-[#00f0ff]/20 border border-[#ff2a85]/70 text-[#ff9ec7] hover:text-white hover:border-[#ff2a85]'
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
                  ? 'bg-[#00f0ff] border-[#00f0ff] text-[#031518] shadow-[0_0_12px_rgba(0,240,255,0.55)]'
                  : 'bg-[#ff2a85]/15 border-[#ff2a85]/60 text-[#ff8ac4] hover:bg-[#ff2a85]/30 hover:text-white'
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
        <div className="flex flex-col lg:flex-row min-h-[470px]">
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
                    title={srv.name}
                    className={`w-11 h-11 geek-hex font-extrabold text-xs flex items-center justify-center transition-all cursor-pointer ${
                      isAct
                        ? 'bg-[#00f0ff] text-[#031518] shadow-[0_0_14px_rgba(0,240,255,0.6)]'
                        : 'bg-[#0c1626] text-[#b4cde0] hover:bg-[#00f0ff] hover:text-[#031518]'
                    }`}
                  >
                    {srv.icon}
                  </button>
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
                    ? 'bg-[#ff2a85] text-white shadow-[0_0_14px_rgba(255,42,133,0.75)]'
                    : 'bg-[#1a0d1c] text-[#ff8ac4] hover:bg-[#ff2a85] hover:text-white'
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
          <aside className="lg:w-[272px] bg-[#060b14]/92 border-b lg:border-b-0 lg:border-r border-[#00f0ff]/15 flex flex-col justify-between shrink-0">
            <div>
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
                <div
                  className={`px-2.5 py-1.5 rounded-md text-[13px] font-semibold flex items-center justify-between border mb-1.5 ${
                    inVoice
                      ? 'bg-[#10b981]/15 border-[#10b981]/45 text-[#6ee7b7]'
                      : 'border-transparent text-[#b4cde0]'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Volume2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{activeServer.voiceChannel}</span>
                  </span>
                  {inVoice && <span className="text-[9px] font-extrabold text-[#10b981]">LIVE</span>}
                </div>

                {/* Connected Voice Peers with Green Speaking Ring & Animated Bars */}
                <div className="space-y-1 pl-2 mb-2">
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

            <div>
              {/* Voice Dock */}
              <div className="bg-[#06101a]/95 border-t border-[#00f0ff]/35 px-2.5 py-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className={`text-[10px] font-extrabold uppercase ${
                        inVoice ? 'text-[#10b981]' : 'text-[#63809b]'
                      }`}
                    >
                      {inVoice ? '🟢 В ЭФИРЕ' : '📡 ГОЛОСОВОЙ КАНАЛ'}
                    </div>
                    <div className="text-xs font-bold text-white truncate">
                      {activeServer.voiceChannel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInVoice((prev) => !prev)}
                    className={`px-2.5 py-1 rounded text-[10.5px] font-extrabold cursor-pointer transition-colors ${
                      inVoice
                        ? 'bg-[#ff2a85]/25 border border-[#ff2a85] text-[#ff80a0]'
                        : 'bg-[#00f0ff] text-[#031518]'
                    }`}
                  >
                    {inVoice ? 'ВЫЙТИ' : 'ВОЙТИ'}
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
                    <div className="text-[10px] text-[#00f0ff] truncate">
                      {!inVoice ? 'Оффлайн в голосе' : deafened ? 'Звук выкл' : micMuted ? 'Микрофон выкл' : 'В сети'}
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
          <div className="flex-1 flex flex-col justify-between min-w-0 bg-[#08101c]/90">
            <div>
              {/* Audio Stream Header Card with Wave Equalizer */}
              <div className="m-3 mb-1 px-3 py-2 rounded-[10px] bg-[#0a1320]/90 border border-[#00f0ff]/15 flex items-center justify-between gap-3">
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
                        inVoice && !deafened ? 'geek-eq-bar-live opacity-80' : 'opacity-30 scale-y-25'
                      }`}
                      style={inVoice && !deafened ? { animationDelay: delay } : undefined}
                    />
                  ))}
                </div>
              </div>

              {/* Messages Container */}
              <div
                className="px-3 py-2 space-y-2 max-h-[360px] overflow-y-auto"
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
                      <p className="text-[13.5px] text-[#e6f7ff] mt-1 leading-snug break-words">
                        {msg.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Console Input Box */}
            <div className="px-3 pb-3 pt-1">
              <div className="rounded-lg bg-[#0a1320]/95 border border-[#00f0ff]/40 px-2.5 py-2 space-y-1.5">
                <div className="flex items-center justify-between text-[9px] font-extrabold uppercase text-[#63809b]">
                  <span>ОКНО ВВОДА // КОНСОЛЬ</span>
                  <span>КАНАЛ #{activeChannel.name.toUpperCase()}</span>
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
                    placeholder={`Написать в #${activeChannel.name}...`}
                    aria-label={`Сообщение в канал ${activeChannel.name}`}
                    className="flex-1 min-w-0 bg-[#050a12] border border-[#00f0ff]/20 focus:border-[#00f0ff] focus:outline-none rounded-md px-3 py-2 text-sm text-[#e6f7ff] placeholder:text-[#63809b]"
                  />
                  <button
                    type="submit"
                    className="bg-[#00f0ff] text-[#031518] px-3.5 py-2 rounded-md font-extrabold text-[11.5px] uppercase hover:brightness-110 transition-all cursor-pointer shrink-0"
                  >
                    ОТПРАВИТЬ
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* 4. Right Members Panel (toggleable) */}
          {showMembers && (
            <aside
              aria-label="Участники сервера"
              className="lg:w-[225px] bg-[#060b14]/92 border-t lg:border-t-0 lg:border-l border-[#00f0ff]/15 px-2.5 py-3 shrink-0"
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
