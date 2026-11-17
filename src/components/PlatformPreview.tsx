import { useState, type FormEvent } from 'react';
import { Hash, Headphones, Mic, MicOff, Send, Sparkles, Volume2, VolumeX } from 'lucide-react';
import {
  PREVIEW_CHANNELS,
  createUserPreviewMessage,
  type PreviewChannelId,
  type PreviewMessage,
} from '../utils/platformPreview';

export function PlatformPreview() {
  const [activeChannelId, setActiveChannelId] = useState<PreviewChannelId>('general');
  const [customMessages, setCustomMessages] = useState<Record<PreviewChannelId, PreviewMessage[]>>({
    general: [],
    ideas: [],
    beta: [],
  });
  const [draft, setDraft] = useState('');
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [noiseSuppression, setNoiseSuppression] = useState(true);

  const activeChannel =
    PREVIEW_CHANNELS.find((ch) => ch.id === activeChannelId) ?? PREVIEW_CHANNELS[0];
  const allMessages = [...activeChannel.messages, ...customMessages[activeChannel.id]];

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const newMsg = createUserPreviewMessage(draft);
    if (!newMsg) return;

    setCustomMessages((prev) => ({
      ...prev,
      [activeChannel.id]: [...prev[activeChannel.id], newMsg].slice(-6),
    }));
    setDraft('');
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
            ИНТЕРАКТИВНЫЙ ПРОТОТИП
          </p>
          <h2
            id="preview-heading"
            className="font-cyber font-black text-3xl md:text-4xl text-white uppercase"
          >
            Как выглядит Geek внутри
          </h2>
        </div>
        <p className="text-sm text-slate-400 max-w-md">
          Переключайте текстовые каналы, напишите пробное сообщение или проверьте панель управления голосовой комнатой.
        </p>
      </div>

      <div className="rounded-3xl bg-[#150f24]/92 border border-[#00f0ff]/40 shadow-neon-cyan overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[400px]">
          {/* Left Channels & Voice Sidebar */}
          <aside className="lg:col-span-4 bg-[#0e091b] border-b lg:border-b-0 lg:border-r border-white/10 p-5 flex flex-col justify-between gap-6">
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
                <span className="font-cyber font-bold text-sm text-white tracking-wider">
                  GEEK · КОМЬЮНИТИ
                </span>
                <span className="text-[11px] font-mono-tech text-[#00f0ff]">ПРЕВЬЮ</span>
              </div>

              <p className="text-[11px] font-mono-tech text-slate-400 uppercase tracking-wider mb-2">
                Текстовые каналы
              </p>
              <div className="space-y-1.5 mb-6" role="tablist" aria-label="Демо текстовых каналов">
                {PREVIEW_CHANNELS.map((channel) => {
                  const isActive = channel.id === activeChannel.id;
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveChannelId(channel.id)}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono-tech flex items-center gap-2 transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#00f0ff]/15 border border-[#00f0ff]/60 text-white shadow-[0_0_16px_rgba(0,240,255,0.2)]'
                          : 'border border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Hash className={`w-3.5 h-3.5 ${isActive ? 'text-[#00f0ff]' : 'text-slate-500'}`} />
                      <span>{channel.name}</span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] font-mono-tech text-slate-400 uppercase tracking-wider mb-2">
                Голосовая комната
              </p>
              <div className="rounded-xl bg-[#150f24] border border-[#ff007f]/35 p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-white font-semibold">
                    <Volume2 className="w-3.5 h-3.5 text-[#ff007f]" />
                    <span>Лаунж #1</span>
                  </span>
                  <span className="text-[11px] font-mono-tech text-[#fcee0a]">3 участника</span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          micMuted || deafened ? 'bg-slate-500' : 'bg-[#00f0ff]'
                        }`}
                      />
                      <span>Вы (Гость)</span>
                    </span>
                    <span className="text-[10px] font-mono-tech text-slate-400">
                      {deafened ? 'Звук выкл' : micMuted ? 'Микрофон выкл' : 'В эфире'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#ff007f]" />
                      <span>Niko</span>
                    </span>
                    <span className="text-[10px] font-mono-tech">В эфире</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-500" />
                      <span>Vex</span>
                    </span>
                    <span className="text-[10px] font-mono-tech">Слушает</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Voice Controls */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMicMuted((prev) => !prev)}
                aria-pressed={micMuted}
                className={`flex-1 py-2 px-2.5 rounded-xl border text-[11px] font-mono-tech flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  micMuted
                    ? 'bg-[#ff007f]/15 border-[#ff007f]/60 text-[#ff007f]'
                    : 'bg-[#150f24] border-white/15 text-slate-200 hover:border-[#00f0ff]/60'
                }`}
              >
                {micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-[#00f0ff]" />}
                <span>{micMuted ? 'Микр. выкл' : 'Микрофон'}</span>
              </button>

              <button
                type="button"
                onClick={() => setDeafened((prev) => !prev)}
                aria-pressed={deafened}
                className={`flex-1 py-2 px-2.5 rounded-xl border text-[11px] font-mono-tech flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  deafened
                    ? 'bg-[#ff007f]/15 border-[#ff007f]/60 text-[#ff007f]'
                    : 'bg-[#150f24] border-white/15 text-slate-200 hover:border-[#00f0ff]/60'
                }`}
              >
                {deafened ? <VolumeX className="w-3.5 h-3.5" /> : <Headphones className="w-3.5 h-3.5 text-[#00f0ff]" />}
                <span>{deafened ? 'Без звука' : 'Звук вкл'}</span>
              </button>

              <button
                type="button"
                onClick={() => setNoiseSuppression((prev) => !prev)}
                aria-pressed={noiseSuppression}
                title="Интеллектуальное шумоподавление"
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-mono-tech flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                  noiseSuppression
                    ? 'bg-[#fcee0a]/15 border-[#fcee0a]/60 text-[#fcee0a]'
                    : 'bg-[#150f24] border-white/15 text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Шум</span>
              </button>
            </div>
          </aside>

          {/* Right Live Chat Stream */}
          <div className="lg:col-span-8 p-5 sm:p-6 flex flex-col justify-between bg-[#150f24]/70">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-[#00f0ff]" />
                  <span className="font-cyber font-bold text-sm sm:text-base text-white">
                    {activeChannel.name}
                  </span>
                </div>
                <span className="text-xs text-slate-400">{activeChannel.topic}</span>
              </div>

              <div className="space-y-3.5 mb-5 max-h-[250px] overflow-y-auto pr-1" data-testid="preview-messages">
                {allMessages.map((msg) => {
                  const nameColor =
                    msg.roleColor === 'cyan'
                      ? 'text-[#00f0ff]'
                      : msg.roleColor === 'pink'
                        ? 'text-[#ff007f]'
                        : 'text-[#fcee0a]';
                  return (
                    <div
                      key={msg.id}
                      className="rounded-xl bg-[#0b0714]/75 border border-white/8 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`font-cyber font-bold text-xs ${nameColor}`}>
                          {msg.author}
                        </span>
                        <span className="text-[11px] font-mono-tech text-slate-500">
                          {msg.time}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed">{msg.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleSend} className="flex items-center gap-2.5 pt-2 border-t border-white/10">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Написать в #${activeChannel.name}...`}
                aria-label={`Сообщение в канал ${activeChannel.name}`}
                className="flex-1 px-4 py-3 rounded-xl bg-[#0b0714] border border-white/15 focus:border-[#00f0ff] focus:outline-none text-sm text-white placeholder:text-slate-500"
              />
              <button
                type="submit"
                className="cyber-btn px-4 sm:px-5 py-3 bg-[#00f0ff] text-[#0b0714] font-cyber font-black text-xs tracking-wider flex items-center gap-1.5 hover:opacity-90 cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ОТПРАВИТЬ</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
