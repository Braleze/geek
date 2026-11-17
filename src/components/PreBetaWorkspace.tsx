import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Check,
  Clock,
  Copy,
  Headphones,
  KeyRound,
  Link2,
  Mic,
  MicOff,
  Paperclip,
  PhoneCall,
  PhoneOff,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatCountdownMs } from '../utils/preBetaSession';
import type { usePreBetaCall } from '../hooks/usePreBetaCall';

type PreBetaController = ReturnType<typeof usePreBetaCall>;

interface PreBetaWorkspaceProps {
  controller: PreBetaController;
  initialJoinCode?: string;
  showMembers: boolean;
}

function getInitials(nick: string): string {
  const parts = nick.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (nick.trim().slice(0, 2) || 'GK').toUpperCase();
}

export function PreBetaWorkspace({
  controller,
  initialJoinCode = '',
  showMembers,
}: PreBetaWorkspaceProps) {
  const {
    nick,
    setNick,
    quota,
    roomSnapshot,
    myPeerId,
    remainingMs,
    error,
    setError,
    busy,
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
  } = controller;

  const [friendCodeInput, setFriendCodeInput] = useState(initialJoinCode);
  const [chatDraft, setChatDraft] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialJoinCode && !friendCodeInput) {
      setFriendCodeInput(initialJoinCode);
    }
  }, [initialJoinCode, friendCodeInput]);

  const messageCount = roomSnapshot?.messages.length ?? 0;
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messageCount]);

  const handleCopyText = async (value: string, kind: 'code' | 'link') => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      }
    } catch {
      // Clipboard fallback
    }
    if (kind === 'code') {
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    } else {
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1800);
    }
  };

  const handleJoinSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void joinRoomByCode(friendCodeInput, nick);
  };

  const handleSendChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendMessage(chatDraft)) {
      setChatDraft('');
    }
  };

  const rtcLabel =
    rtcStatus === 'connected'
      ? 'P2P АУДИО ПОДКЛЮЧЕНО'
      : rtcStatus === 'negotiating'
        ? 'СОГЛАСОВАНИЕ P2P КАНАЛА...'
        : rtcStatus === 'waiting-peer'
          ? 'ОЖИДАНИЕ 2-ГО УЧАСТНИКА'
          : 'ЧАТ + СИГНАЛИНГ АКТИВЕН';

  if (!roomSnapshot) {
    const quotaTimeLabel = formatCountdownMs(quota.remainingMs);
    const isExhausted = quota.status === 'EXHAUSTED';
    const isActiveQuota = quota.status === 'ACTIVE' && Boolean(quota.code);

    return (
      <div className="flex-1 flex flex-col justify-between bg-[#08101c]/95 p-4 sm:p-6 min-w-0">
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

        <div className="space-y-5">
          {/* Header Banner */}
          <div className="rounded-xl border border-[#ff2a85]/45 bg-gradient-to-r from-[#ff2a85]/12 via-[#0a1320] to-[#00f0ff]/12 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 text-[10px] font-mono-tech uppercase tracking-widest text-[#ff7aa8]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>PRE-BETA // ПРЯМАЯ СВЯЗЬ 1-НА-1</span>
              </div>
              <h3 className="font-cyber font-black text-lg sm:text-xl text-white mt-1">
                Живой тест голоса и чата до релиза
              </h3>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Получите уникальный одноразовый код, отправьте его другу и общайтесь напрямую в этом превью.
                Лимит до релиза: <strong className="text-[#fcee0a]">30 минут всего</strong>, максимум{' '}
                <strong className="text-[#00f0ff]">2 человека</strong> в одном диалоге.
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-start sm:items-end gap-1 rounded-lg bg-[#04070d]/90 border border-[#fcee0a]/45 px-3.5 py-2">
              <span className="text-[9.5px] font-mono-tech uppercase text-[#fcee0a]">
                ЛИМИТ ДО РЕЛИЗА
              </span>
              <span
                data-testid="prebeta-quota-timer"
                className="font-cyber font-black text-lg text-white tabular-nums"
              >
                {quotaTimeLabel}
              </span>
            </div>
          </div>

          {/* Optional Nickname Bar */}
          <div className="rounded-xl bg-[#060b14] border border-[#00f0ff]/20 p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
            <label
              htmlFor="prebeta-nick-input"
              className="text-[11px] font-mono-tech uppercase text-[#00f0ff] shrink-0"
            >
              Ваш позывной:
            </label>
            <input
              id="prebeta-nick-input"
              type="text"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="Например: CyberNiko (необязательно)"
              maxLength={22}
              className="flex-1 bg-[#04070d] border border-[#00f0ff]/25 focus:border-[#00f0ff] focus:outline-none rounded-lg px-3 py-2 text-xs sm:text-sm text-white placeholder:text-[#63809b]"
            />
          </div>

          {error && (
            <div
              role="alert"
              data-testid="prebeta-error"
              className="rounded-xl border border-[#ff2a85] bg-[#ff2a85]/15 px-4 py-3 flex items-center gap-2.5 text-xs sm:text-sm text-[#ffc2d8]"
            >
              <ShieldAlert className="w-4 h-4 text-[#ff2a85] shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Two Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: Host creates / uses 1-time code */}
            <div className="rounded-xl bg-[#060b14]/95 border border-[#00f0ff]/35 p-4 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono-tech uppercase text-[#00f0ff]">
                    ШАГ 1 // ЕДИНОРАЗОВЫЙ КОД
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#00f0ff]/10 border border-[#00f0ff]/30 text-[#00f0ff]">
                    1-НА-1
                  </span>
                </div>
                <h4 className="font-cyber font-bold text-base text-white">
                  Создать диалог и позвать друга
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Устройство получает один уникальный код на 30 минут до релиза. Повторная выдача нового кода заблокирована.
                </p>
              </div>

              {isExhausted ? (
                <div className="rounded-lg bg-[#ff2a85]/10 border border-[#ff2a85]/40 p-3 text-xs text-[#ff9ec0]">
                  Ваш 30-минутный pre-beta лимит до релиза исчерпан. Вы по-прежнему можете подключиться по активному коду друга справа.
                </div>
              ) : isActiveQuota ? (
                <div className="space-y-2.5">
                  <div className="rounded-lg bg-[#04070d] border border-[#10b981]/50 p-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[9.5px] font-mono-tech text-[#6ee7b7] uppercase">
                        ВАШ ЕДИНОРАЗОВЫЙ КОД УЖЕ ВЫДАН
                      </div>
                      <div
                        data-testid="prebeta-issued-code"
                        className="font-cyber font-black text-base text-white tracking-wider mt-0.5"
                      >
                        {quota.code}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => quota.code && void handleCopyText(quota.code, 'code')}
                      className="px-2.5 py-1.5 rounded-md bg-[#10b981]/15 border border-[#10b981]/45 text-[#6ee7b7] text-[11px] font-bold flex items-center gap-1 cursor-pointer hover:brightness-110"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'СКОПИРОВАНО' : 'КОД'}</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => quota.code && void joinRoomByCode(quota.code, nick || 'Создатель')}
                    data-testid="prebeta-resume-btn"
                    className="w-full py-2.5 px-4 rounded-lg bg-[#00f0ff] text-[#031518] font-cyber font-black text-xs uppercase tracking-wider hover:brightness-110 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>ВОЙТИ В СВОЙ ДИАЛОГ ({quotaTimeLabel})</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy || quota.status === 'LOADING'}
                  onClick={() => void issueCodeAndJoin()}
                  data-testid="prebeta-issue-btn"
                  className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-[#00f0ff] to-[#38bdf8] text-[#031518] font-cyber font-black text-xs uppercase tracking-wider hover:brightness-110 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{busy ? 'ЗАПУСК КАНАЛА...' : 'ПОЛУЧИТЬ ЕДИНОРАЗОВЫЙ КОД'}</span>
                </button>
              )}
            </div>

            {/* Card 2: Friend enters code */}
            <form
              onSubmit={handleJoinSubmit}
              className="rounded-xl bg-[#060b14]/95 border border-[#ff2a85]/35 p-4 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono-tech uppercase text-[#ff7aa8]">
                    ШАГ 2 // ВХОД ПО КОДУ ДРУГА
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#ff2a85]/10 border border-[#ff2a85]/30 text-[#ff7aa8]">
                    МАКС. 2/2
                  </span>
                </div>
                <h4 className="font-cyber font-bold text-base text-white">
                  Подключиться к собеседнику
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Введите код, который прислал вам друг. Если в комнате уже 2 человека или время истекло, вход будет отклонён.
                </p>
              </div>

              <div className="space-y-2.5">
                <label htmlFor="prebeta-code-input" className="sr-only">
                  Код комнаты друга
                </label>
                <input
                  id="prebeta-code-input"
                  data-testid="prebeta-code-input"
                  type="text"
                  value={friendCodeInput}
                  onChange={(e) => {
                    setError(null);
                    setFriendCodeInput(e.target.value.toUpperCase());
                  }}
                  placeholder="GK-XXXX-XXXX"
                  className="w-full bg-[#04070d] border border-[#ff2a85]/40 focus:border-[#ff2a85] focus:outline-none rounded-lg px-3 py-2.5 font-cyber text-sm tracking-widest text-white placeholder:text-[#63809b]"
                />
                <button
                  type="submit"
                  disabled={busy}
                  data-testid="prebeta-join-btn"
                  className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-[#ff2a85] to-[#db2777] text-white font-cyber font-black text-xs uppercase tracking-wider hover:brightness-110 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{busy ? 'ПОДКЛЮЧЕНИЕ...' : 'ПОДКЛЮЧИТЬСЯ К РАЗГОВОРУ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-[#00f0ff]/15 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tech text-[#63809b]">
          <span>ПРОТОКОЛ: WEBSOCKET СИГНАЛИНГ + WEBRTC P2P AUDIO</span>
          <span>ОГРАНИЧЕНИЕ PRE-BETA: 30:00 ДО РЕЛИЗА · 2 УЧАСТНИКА</span>
        </div>
      </div>
    );
  }

  const peers = roomSnapshot.participants;
  const countdownText = formatCountdownMs(remainingMs);
  const inviteUrl = `${window.location.origin}${window.location.pathname}?prebeta=${encodeURIComponent(roomSnapshot.code)}#preview`;

  return (
    <>
      {/* Left Pre-Beta Room Sidebar */}
      <aside className="lg:w-[272px] bg-[#060b14]/92 border-b lg:border-b-0 lg:border-r border-[#00f0ff]/15 flex flex-col justify-between shrink-0">
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

        <div>
          <div className="px-3.5 py-2.5 border-b border-[#ff2a85]/25 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[9px] font-extrabold uppercase tracking-wider text-[#ff7aa8]">
                PRE-BETA КАНАЛ 1-НА-1
              </div>
              <div
                data-testid="prebeta-active-code"
                className="text-[14px] font-cyber font-black text-white truncate mt-0.5 tracking-wider"
              >
                {roomSnapshot.code}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyText(roomSnapshot.code, 'code')}
              aria-label="Скопировать код комнаты"
              className="bg-[#00f0ff]/10 border border-[#00f0ff]/40 text-[#00f0ff] text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 cursor-pointer hover:bg-[#00f0ff] hover:text-[#031518] transition-colors shrink-0"
            >
              {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCode ? 'ОК' : 'КОД'}</span>
            </button>
          </div>

          {/* Countdown & Share Link Card */}
          <div className="mx-2.5 mt-2.5 mb-2 p-2.5 rounded-lg bg-gradient-to-br from-[#ff2a85]/15 to-[#0a1320]/90 border border-[#ff2a85]/45 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[9px] font-extrabold text-[#b4cde0] uppercase">
                  ОСТАТОК ДО РЕЛИЗА
                </div>
                <div
                  data-testid="prebeta-countdown"
                  className="text-base font-cyber font-black text-[#fcee0a] tabular-nums flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>{countdownText}</span>
                </div>
              </div>
              <span
                data-testid="prebeta-peer-count"
                className="text-[10.5px] font-extrabold px-2 py-0.5 rounded bg-[#10b981]/15 border border-[#10b981]/45 text-[#6ee7b7]"
              >
                {peers.length}/{roomSnapshot.maxParticipants}
              </span>
            </div>

            <button
              type="button"
              onClick={() => void handleCopyText(inviteUrl, 'link')}
              className="w-full py-1.5 px-2 rounded bg-[#04070d]/80 border border-[#00f0ff]/30 text-[#00f0ff] text-[10.5px] font-bold flex items-center justify-center gap-1.5 hover:bg-[#00f0ff]/15 cursor-pointer transition-colors"
            >
              {copiedLink ? <Check className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
              <span>{copiedLink ? 'ССЫЛКА СКОПИРОВАНА' : 'ССЫЛКА-ПРИГЛАШЕНИЕ ДРУГУ'}</span>
            </button>
          </div>

          {/* Live Voice Participants */}
          <div className="px-2.5 py-1.5">
            <div className="text-[10px] font-extrabold uppercase text-[#63809b] px-1 py-1.5">
              🔊 ЖИВОЙ ДИАЛОГ ({peers.length}/2)
            </div>
            <div className="px-2.5 py-1.5 rounded-md text-[13px] font-semibold flex items-center justify-between border mb-1.5 bg-[#10b981]/15 border-[#10b981]/45 text-[#6ee7b7]">
              <span className="flex items-center gap-1.5 truncate">
                <Volume2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Pre-Beta Голос</span>
              </span>
              <span className="text-[9px] font-extrabold text-[#10b981]">LIVE</span>
            </div>

            <div className="space-y-1 pl-1">
              {peers.map((peer) => {
                const isMe = peer.peerId === myPeerId;
                return (
                  <div
                    key={peer.peerId}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs border ${
                      !peer.micMuted
                        ? 'bg-[#10b981]/12 border-[#10b981]/45 text-white'
                        : 'border-transparent text-[#b4cde0]'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 geek-hex flex items-center justify-center font-extrabold text-[10px] text-white shrink-0 ${
                        peer.isHost ? 'bg-[#ff2a85]/45' : 'bg-[#00f0ff]/35'
                      }`}
                    >
                      {getInitials(peer.nick)}
                    </div>
                    <span className="truncate flex-1">
                      {peer.nick}
                      {isMe ? ' (Вы)' : ''}
                    </span>
                    {peer.micMuted ? (
                      <MicOff className="w-3 h-3 text-[#ff2a85] shrink-0" />
                    ) : (
                      <Mic className="w-3 h-3 text-[#10b981] shrink-0" />
                    )}
                  </div>
                );
              })}

              {peers.length < 2 && (
                <div className="px-2 py-1.5 rounded-md border border-dashed border-[#00f0ff]/25 text-[11px] text-[#63809b]">
                  Свободный слот (1/2) — передайте код другу
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Voice Dock + Bottom Bar */}
        <div>
          <div className="bg-[#06101a]/95 border-t border-[#00f0ff]/35 px-2.5 py-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase text-[#10b981] truncate">
                  {rtcLabel}
                </div>
                <div className="text-[11px] font-semibold text-slate-300 truncate">
                  {hasMicAudio ? 'Микрофон активен (WebRTC)' : 'Чат активен (без микрофона)'}
                </div>
              </div>
              <button
                type="button"
                onClick={leaveRoom}
                data-testid="prebeta-leave-btn"
                className="px-2.5 py-1 rounded text-[10.5px] font-extrabold cursor-pointer bg-[#ff2a85]/25 border border-[#ff2a85] text-[#ff80a0] hover:bg-[#ff2a85] hover:text-white transition-colors flex items-center gap-1 shrink-0"
              >
                <PhoneOff className="w-3 h-3" />
                <span>ВЫЙТИ</span>
              </button>
            </div>
          </div>

          <div className="h-[54px] px-2.5 bg-[#040810] border-t border-[#00f0ff]/15 flex items-center justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold text-white truncate">
                {peers.find((p) => p.peerId === myPeerId)?.nick ?? 'Вы'}
              </div>
              <div className="text-[10px] text-[#00f0ff] truncate">
                {deafened ? 'Звук выкл' : micMuted ? 'Микрофон выкл' : 'В диалоге 1-на-1'}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={toggleMicMute}
                aria-pressed={micMuted}
                aria-label={micMuted ? 'Включить микрофон Pre-Beta' : 'Выключить микрофон Pre-Beta'}
                className={`w-8 h-8 geek-hex flex items-center justify-center cursor-pointer transition-colors ${
                  micMuted ? 'bg-[#ff2a85]/25 text-[#ff2a85]' : 'bg-[#0d1829] text-[#00f0ff]'
                }`}
              >
                {micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={toggleDeafen}
                aria-pressed={deafened}
                aria-label={deafened ? 'Включить звук Pre-Beta' : 'Отключить звук Pre-Beta'}
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

      {/* Main Live Dialogue Chat Stream */}
      <div className="flex-1 flex flex-col justify-between min-w-0 bg-[#08101c]/90">
        <div>
          <div className="m-3 mb-1 px-3 py-2 rounded-[10px] bg-[#0a1320]/90 border border-[#ff2a85]/35 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[#ff2a85] text-lg font-black">#</span>
              <div className="min-w-0">
                <div className="text-[9.5px] font-extrabold uppercase text-[#ff7aa8] truncate">
                  PRE-BETA ЖИВОЙ ДИАЛОГ // {roomSnapshot.code}
                </div>
                <div className="text-sm font-extrabold text-white truncate">
                  прямая-связь-1-на-1
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-mono-tech text-[#fcee0a]">
                ⏱ {countdownText}
              </span>
            </div>
          </div>

          <div
            ref={messagesContainerRef}
            data-testid="prebeta-messages"
            className="px-3 py-2 space-y-2 max-h-[360px] overflow-y-auto"
          >
            {roomSnapshot.messages.map((msg) => {
              const timeStr = new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const isMine = msg.authorPeerId === myPeerId;
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 px-3 py-2.5 rounded-lg border ${
                    msg.system
                      ? 'bg-[#ff2a85]/10 border-[#ff2a85]/30'
                      : isMine
                        ? 'bg-[#00f0ff]/10 border-[#00f0ff]/35'
                        : 'bg-[#0a1320]/90 border-[#00f0ff]/15'
                  }`}
                >
                  <div
                    className={`w-9 h-9 geek-hex flex items-center justify-center font-extrabold text-xs text-white shrink-0 ${
                      msg.system ? 'bg-[#ff2a85]' : isMine ? 'bg-[#3b82f6]' : 'bg-[#10b981]'
                    }`}
                  >
                    {msg.system ? 'PB' : getInitials(msg.authorNick)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[13px] font-extrabold ${
                          msg.system ? 'text-[#ff7aa8]' : 'text-[#00f0ff]'
                        }`}
                      >
                        {msg.authorNick}
                      </span>
                      <span className="text-[10.5px] text-[#63809b] font-mono">{timeStr}</span>
                    </div>
                    <p className="text-[13.5px] text-[#e6f7ff] mt-1 leading-snug break-words">
                      {msg.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-3 pb-3 pt-1">
          <div className="rounded-lg bg-[#0a1320]/95 border border-[#00f0ff]/40 px-2.5 py-2 space-y-1.5">
            <div className="flex items-center justify-between text-[9px] font-extrabold uppercase text-[#63809b]">
              <span>PRE-BETA КОНСОЛЬ // ЖИВОЙ ЭФИР</span>
              <span>КОД {roomSnapshot.code}</span>
            </div>
            <form onSubmit={handleSendChat} data-testid="prebeta-chat-form" className="flex items-center gap-2">
              <span
                className="w-9 h-9 rounded-md bg-[#00f0ff]/10 border border-[#00f0ff]/40 text-[#00f0ff] flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <Paperclip className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                placeholder="Написать собеседнику в реальном времени..."
                aria-label="Сообщение в живой Pre-Beta диалог"
                data-testid="prebeta-chat-input"
                className="flex-1 min-w-0 bg-[#050a12] border border-[#00f0ff]/20 focus:border-[#00f0ff] focus:outline-none rounded-md px-3 py-2 text-sm text-[#e6f7ff] placeholder:text-[#63809b]"
              />
              <button
                type="submit"
                data-testid="prebeta-chat-send"
                className="bg-[#00f0ff] text-[#031518] px-3.5 py-2 rounded-md font-extrabold text-[11.5px] uppercase hover:brightness-110 transition-all cursor-pointer shrink-0"
              >
                ОТПРАВИТЬ
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Right Live Members Panel */}
      {showMembers && (
        <aside
          aria-label="Участники Pre-Beta диалога"
          className="lg:w-[225px] bg-[#060b14]/92 border-t lg:border-t-0 lg:border-l border-[#00f0ff]/15 px-2.5 py-3 shrink-0"
        >
          <div className="text-[10.5px] font-extrabold uppercase text-[#00f0ff] px-1.5 pb-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>В ДИАЛОГЕ — {peers.length}/2</span>
          </div>
          <div className="space-y-1.5">
            {peers.map((peer) => (
              <div
                key={peer.peerId}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-md bg-[#0a1320]/80 border border-[#00f0ff]/15"
              >
                <div className="w-8 h-8 geek-hex bg-[#00f0ff]/25 flex items-center justify-center font-extrabold text-[10px] text-white shrink-0">
                  {getInitials(peer.nick)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">
                    {peer.nick}
                    {peer.peerId === myPeerId ? ' (Вы)' : ''}
                  </div>
                  <div className="text-[10px] text-[#6ee7b7] truncate">
                    {peer.isHost ? 'Создатель кода' : 'Приглашённый друг'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}
    </>
  );
}
