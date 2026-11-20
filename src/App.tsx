import { useEffect, useState, type CSSProperties, type PointerEvent } from 'react';
import { ArrowUp, Bolt, Check, Hash, Mic, PhoneCall, Send, Share2, ShieldCheck } from 'lucide-react';
import { GeekLogo } from './components/GeekLogo';
import { PlatformPreview } from './components/PlatformPreview';
import { RoadmapSection } from './components/RoadmapSection';
import { FaqSection } from './components/FaqSection';
import { FeedbackSection } from './components/FeedbackSection';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { resolveLaunchTarget } from './utils/pwa';

const FEATURES = [
  {
    id: 'channels',
    title: 'Каналы и чаты',
    description:
      'Гибкая структура текстовых и мультимедийных каналов для любого общения и проектов.',
    icon: Hash,
    accent: 'cyan' as const,
  },
  {
    id: 'voice',
    title: 'P2P Голос',
    description:
      'Сверхнизкая задержка, пространственное аудио и кристальная слышимость без лагов.',
    icon: Mic,
    accent: 'pink' as const,
  },
  {
    id: 'security',
    title: 'Безопасность',
    description:
      'Сквозное шифрование, полная защита персональных данных и независимые ноды.',
    icon: ShieldCheck,
    accent: 'yellow' as const,
  },
  {
    id: 'speed',
    title: 'Скорость',
    description:
      'Легковесный клиент, плавная работа интерфейса и мгновенный отклик на любых устройствах.',
    icon: Bolt,
    accent: 'cyan' as const,
  },
];

export default function App() {
  const [linkCopied, setLinkCopied] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [preBetaOpenSignal, setPreBetaOpenSignal] = useState(0);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);

  const handleOpenPreBeta = () => {
    window.__GEEK_OPEN_PREBETA_ON_MOUNT__ = true;
    try {
      if (window.location.hash !== '#prebeta') {
        window.history.replaceState(null, '', '#prebeta');
      }
    } catch {
      // Ignore history restriction
    }
    setPreBetaOpenSignal((prev) => prev + 1);
    document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Track scroll position for floating Back-to-Top button
  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 420);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Support Android/iOS home-screen PWA shortcut (?view=app#preview)
  useEffect(() => {
    const target = resolveLaunchTarget({
      search: window.location.search,
      hash: window.location.hash,
    });
    if (target === 'preview') {
      const timer = window.setTimeout(() => {
        document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 90);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, []);

  const handleShareSite = async () => {
    const shareUrl = window.location.origin + window.location.pathname;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch {
      // Fallback gracefully when clipboard API is restricted
    }
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2200);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between relative bg-[#0b0714] text-slate-200 overflow-x-hidden">
      {/* CRT Scanlines Overlay */}
      <div className="absolute inset-0 scanlines pointer-events-none z-40 opacity-30" />

      {/* Bottom Retrowave Horizon Grid */}
      <div className="absolute bottom-0 left-0 right-0 h-[450px] overflow-hidden pointer-events-none z-0 opacity-70">
        <div className="absolute inset-0 retro-grid" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0714] via-[#0b0714]/70 to-transparent" />
      </div>

      {/* Ambient Neon Glowing Orbs (radial gradients for zero compositor lag) */}
      <div
        className="absolute top-12 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full pointer-events-none z-0"
        style={{
          background: 'radial-gradient(circle, rgba(0, 240, 255, 0.14) 0%, rgba(0, 240, 255, 0) 70%)',
        }}
      />
      <div
        className="absolute top-1/3 left-1/4 w-[460px] h-[460px] rounded-full pointer-events-none z-0"
        style={{
          background: 'radial-gradient(circle, rgba(255, 0, 127, 0.13) 0%, rgba(255, 0, 127, 0) 70%)',
        }}
      />
      <div
        className="absolute bottom-1/3 right-1/4 w-[500px] h-[500px] rounded-full pointer-events-none z-0"
        style={{
          background: 'radial-gradient(circle, rgba(252, 238, 10, 0.1) 0%, rgba(252, 238, 10, 0) 70%)',
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-30 w-full backdrop-blur-md bg-[#0b0714]/75 border-b border-white/5 pt-[env(safe-area-inset-top)]">
        <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-3.5 sm:py-4 flex justify-between items-center gap-2 sm:gap-4">
          <a href="#top" className="flex items-center space-x-2 sm:space-x-3 shrink-0 group">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-[#150f24] border border-[#00f0ff]/50 flex items-center justify-center shadow-neon-cyan overflow-hidden p-0.5">
              <GeekLogo size={40} className="w-full h-full" />
            </div>
            <div>
              <span className="font-cyber font-black text-lg sm:text-2xl tracking-wider text-white block leading-none">
                GEEK
              </span>
              <span className="block text-[9px] sm:text-[10px] font-mono-tech text-[#00f0ff] tracking-widest uppercase mt-0.5 sm:mt-1">
                VOICE &amp; CHAT
              </span>
            </div>
          </a>

          <nav className="hidden lg:flex items-center gap-6 text-xs font-cyber font-bold tracking-wider text-slate-300">
            <a href="#features" className="hover:text-[#00f0ff] transition-colors whitespace-nowrap">
              ВОЗМОЖНОСТИ
            </a>
            <a href="#preview" className="hover:text-[#00f0ff] transition-colors whitespace-nowrap">
              ПРЕВЬЮ
            </a>
            <a href="#roadmap" className="hover:text-[#00f0ff] transition-colors whitespace-nowrap">
              ДОРОЖНАЯ КАРТА
            </a>
            <a href="#faq" className="hover:text-[#00f0ff] transition-colors whitespace-nowrap">
              FAQ
            </a>
            <a href="#feedback" className="hover:text-[#00f0ff] transition-colors whitespace-nowrap">
              ОБРАТНАЯ СВЯЗЬ
            </a>
          </nav>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <PWAInstallButton variant="header" />
          <button
            type="button"
            onClick={handleOpenPreBeta}
            data-testid="header-prebeta-btn"
            className="cyber-btn px-2 sm:px-4 py-2 sm:py-2.5 text-[10px] sm:text-xs font-cyber font-bold tracking-wider bg-[#150f24] border border-[#00f0ff]/70 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#0b0714] shadow-neon-cyan flex items-center gap-1 sm:gap-2 whitespace-nowrap cursor-pointer"
          >
            <PhoneCall className="w-3.5 h-3.5 shrink-0" />
            <span className="sm:hidden">СВЯЗЬ</span>
            <span className="hidden sm:inline">PRE-BETA СВЯЗЬ</span>
          </button>
          <a
            href="https://t.me/geek_mes"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Telegram канал Geek"
            className="cyber-btn px-2 sm:px-4 py-2 sm:py-2.5 text-[10px] sm:text-xs font-cyber font-bold tracking-wider bg-[#150f24] border border-[#ff007f]/60 text-[#ff007f] hover:bg-[#ff007f] hover:text-white shadow-neon-pink flex items-center gap-1 sm:gap-2 whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5 shrink-0" />
            <span className="sm:hidden">TG</span>
            <span className="hidden sm:inline">TELEGRAM</span>
            <span className="hidden xl:inline">КАНАЛ</span>
          </a>
        </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main
        id="top"
        className={`relative ${isPreviewFullscreen ? 'z-50' : 'z-20'} flex-grow flex flex-col items-center justify-center text-center px-4 sm:px-6 py-12 max-w-[1440px] mx-auto w-full`}
      >
        {/* Glowing Logo Container with Cyberpunk Corners */}
        <div className="relative mb-12 floating">
          <div className="absolute -top-4 -left-4 w-10 h-10 border-t-2 border-l-2 border-[#00f0ff] z-20 pointer-events-none" />
          <div className="absolute -top-4 -right-4 w-10 h-10 border-t-2 border-r-2 border-[#ff007f] z-20 pointer-events-none" />
          <div className="absolute -bottom-4 -left-4 w-10 h-10 border-b-2 border-l-2 border-[#fcee0a] z-20 pointer-events-none" />
          <div className="absolute -bottom-4 -right-4 w-10 h-10 border-b-2 border-r-2 border-[#00f0ff] z-20 pointer-events-none" />

          <div className="p-3 bg-gradient-to-br from-[#00f0ff] via-[#ff007f] to-[#fcee0a] rounded-3xl shadow-neon-cyan block">
            <div className="bg-[#150f24] rounded-2xl p-5 overflow-hidden border border-white/10">
              <GeekLogo className="w-40 h-40 md:w-52 md:h-52" />
            </div>
          </div>
        </div>

        {/* Title & Gradient */}
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-cyber font-black tracking-tight mb-5 uppercase text-balance">
          Твой новый мир — <span className="gradient-text">Geek</span>
        </h1>

        {/* Teaser Banner */}
        <div className="inline-flex items-center space-x-3 px-5 py-2 rounded-full bg-[#150f24]/90 border border-[#fcee0a]/50 text-[#fcee0a] mb-8 shadow-neon-yellow text-xs sm:text-sm md:text-base font-mono-tech backdrop-blur-md">
          <span>СКОРО ТУТ БУДЕТ НЕЧТО ГРАНДИОЗНОЕ</span>
        </div>

        {/* Description */}
        <p className="text-base sm:text-lg md:text-xl text-gray-300 max-w-2xl mb-12 leading-relaxed font-light">
          Самый мощный аналог Discord для геймеров, разработчиков и креативных комьюнити.
          Кристально чистый голос, абсолютная конфиденциальность и нулевой пинг.
        </p>

        {/* Prominent Telegram CTA Box */}
        <div className="w-full max-w-xl p-6 md:p-8 rounded-3xl bg-gradient-to-b from-[#150f24] to-[#100a1d] border border-[#ff007f]/50 shadow-neon-pink relative overflow-hidden backdrop-blur-xl mb-14">
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-[#ff007f]/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#ff007f]/15 border border-[#ff007f]/40 text-[#ff007f] flex items-center justify-center shadow-neon-pink">
              <Send className="w-6 h-6" />
            </div>
            <h2 className="font-cyber font-bold text-xl md:text-2xl text-white">
              Следи за запуском в Telegram
            </h2>
            <p className="text-sm text-gray-400 max-w-md">
              Первыми узнай о дате закрытого бета-тестирования, получи эксклюзивный доступ и
              ранние привилегии на сервере.
            </p>
            <div className="w-full flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleOpenPreBeta}
                data-testid="hero-prebeta-btn"
                className="cyber-btn w-full sm:w-auto px-6 py-4 rounded-xl bg-[#00f0ff] text-[#0b0714] font-cyber font-black text-xs sm:text-sm tracking-wider hover:brightness-110 transform hover:scale-[1.02] transition-all duration-200 shadow-neon-cyan flex items-center justify-center gap-2.5 whitespace-nowrap cursor-pointer"
              >
                <PhoneCall className="w-4 h-4 shrink-0" />
                <span>PRE-BETA СВЯЗЬ · 30 МИН</span>
              </button>

              <a
                href="https://t.me/geek_mes"
                target="_blank"
                rel="noopener noreferrer"
                className="cyber-btn w-full sm:w-auto px-7 py-4 rounded-xl bg-gradient-to-r from-[#00f0ff] via-[#ff007f] to-[#fcee0a] text-[#0b0714] font-cyber font-black text-sm tracking-wider hover:opacity-95 transform hover:scale-[1.02] transition-all duration-200 shadow-pink-button-glow flex items-center justify-center gap-3 whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                <span>ПРИСОЕДИНИТЬСЯ К ТГ КАНАЛУ</span>
              </a>

              <PWAInstallButton variant="hero" />

              <button
                type="button"
                onClick={handleShareSite}
                aria-label="Скопировать ссылку на сайт Geek"
                className="cyber-btn w-full sm:w-auto px-5 py-4 rounded-xl bg-[#150f24] border border-[#00f0ff]/55 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#0b0714] font-cyber font-bold text-xs tracking-wider flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
              >
                {linkCopied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                <span>{linkCopied ? 'ССЫЛКА СКОПИРОВАНА' : 'ПОДЕЛИТЬСЯ'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <section
          id="features"
          aria-label="Ключевые возможности Geek"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl text-left"
        >
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            const accentStyles =
              feature.accent === 'cyan'
                ? 'border-[#00f0ff]/30 hover:border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/10 shadow-neon-cyan'
                : feature.accent === 'pink'
                  ? 'border-[#ff007f]/30 hover:border-[#ff007f] text-[#ff007f] bg-[#ff007f]/10 shadow-neon-pink'
                  : 'border-[#fcee0a]/30 hover:border-[#fcee0a] text-[#fcee0a] bg-[#fcee0a]/10 shadow-neon-yellow';

            const cardHover =
              feature.accent === 'cyan'
                ? 'border-[#00f0ff]/35 hover:border-[#00f0ff] hover:shadow-neon-cyan'
                : feature.accent === 'pink'
                  ? 'border-[#ff007f]/35 hover:border-[#ff007f] hover:shadow-neon-pink'
                  : 'border-[#fcee0a]/35 hover:border-[#fcee0a] hover:shadow-neon-yellow';

            const spotColor =
              feature.accent === 'cyan'
                ? 'rgba(0, 240, 255, 0.2)'
                : feature.accent === 'pink'
                  ? 'rgba(255, 0, 127, 0.22)'
                  : 'rgba(252, 238, 10, 0.18)';

            const handleMove = (event: PointerEvent<HTMLDivElement>) => {
              const rect = event.currentTarget.getBoundingClientRect();
              event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
              event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
            };

            return (
              <div
                key={feature.id}
                onPointerMove={handleMove}
                style={{ '--spot-color': spotColor } as CSSProperties}
                className={`neon-card p-6 rounded-2xl bg-[#150f24]/80 hover:bg-[#1c1432]/95 hover:-translate-y-1 border ${cardHover} backdrop-blur-md transition-all duration-300 group select-none`}
              >
                <div className="relative z-10">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform ${accentStyles}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-cyber font-bold text-lg mb-2 text-white">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-gray-400 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </section>

        {/* Interactive Platform Workspace Preview */}
        <PlatformPreview
          openPreBetaSignal={preBetaOpenSignal}
          onFullscreenChange={setIsPreviewFullscreen}
        />

        {/* Roadmap Section */}
        <RoadmapSection />

        {/* FAQ Section */}
        <FaqSection />

        {/* Feedback Section */}
        <FeedbackSection />
      </main>

      {/* Footer */}
      <footer className="relative z-20 w-full max-w-7xl mx-auto px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-400 font-mono-tech">
        <div className="flex items-center space-x-2">
          <span>&copy; 2026 GEEK PLATFORM. ВСЕ ПРАВА ЗАЩИЩЕНЫ.</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6">
          <a href="#preview" className="hover:text-[#00f0ff] transition-colors">
            Превью
          </a>
          <a href="#roadmap" className="hover:text-[#00f0ff] transition-colors">
            Дорожная карта
          </a>
          <a href="#faq" className="hover:text-[#00f0ff] transition-colors">
            FAQ
          </a>
          <a href="#feedback" className="hover:text-[#00f0ff] transition-colors">
            Обратная связь
          </a>
          <a
            href="https://t.me/geek_mes"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#00f0ff] transition-colors flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Telegram-канал</span>
          </a>
        </div>
      </footer>

      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Вернуться наверх"
          className="fixed bottom-6 right-6 z-30 w-11 h-11 rounded-xl bg-[#150f24]/95 border border-[#00f0ff]/60 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#0b0714] shadow-neon-cyan flex items-center justify-center transition-all cursor-pointer"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}

      <OfflineIndicator />
    </div>
  );
}
