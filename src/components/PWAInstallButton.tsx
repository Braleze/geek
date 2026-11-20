import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Download, Monitor, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { defaultInstallGuideTab, type InstallGuideTab } from '../utils/pwa';

interface PWAInstallButtonProps {
  variant?: 'header' | 'hero';
}

export function PWAInstallButton({ variant = 'header' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [activeTab, setActiveTab] = useState<InstallGuideTab>(() =>
    defaultInstallGuideTab({ isIOS, isAndroid }),
  );
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!showGuide) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowGuide(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showGuide]);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      setInstalling(true);
      try {
        await install();
      } finally {
        setInstalling(false);
      }
      return;
    }
    setActiveTab(defaultInstallGuideTab({ isIOS, isAndroid }));
    setShowGuide(true);
  };

  const buttonNode =
    variant === 'header' ? (
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={installing}
        data-testid="pwa-install-header-btn"
        aria-label="Установить Geek как приложение на телефон или ПК"
        className="cyber-btn px-2.5 sm:px-3.5 py-2 sm:py-2.5 text-[10.5px] sm:text-xs font-cyber font-bold tracking-wider bg-[#150f24] border border-[#fcee0a]/65 text-[#fcee0a] hover:bg-[#fcee0a] hover:text-[#0b0714] shadow-neon-yellow flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
      >
        {isInstallable ? (
          <Download className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="sm:hidden">APP</span>
        <span className="hidden sm:inline">{isInstallable ? 'УСТАНОВИТЬ' : 'ПРИЛОЖЕНИЕ'}</span>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={installing}
        data-testid="pwa-install-hero-btn"
        aria-label="Установить приложение Geek на Android или iPhone"
        className="cyber-btn w-full sm:w-auto px-5 py-4 rounded-xl bg-[#150f24] border border-[#fcee0a]/70 text-[#fcee0a] hover:bg-[#fcee0a] hover:text-[#0b0714] font-cyber font-bold text-xs tracking-wider shadow-neon-yellow flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
      >
        {isInstallable ? (
          <Download className="w-4 h-4 shrink-0" />
        ) : (
          <Smartphone className="w-4 h-4 shrink-0" />
        )}
        <span>{isInstallable ? 'УСТАНОВИТЬ НА ТЕЛЕФОН' : 'СКАЧАТЬ ПРИЛОЖЕНИЕ (PWA)'}</span>
      </button>
    );

  const modalNode = showGuide ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-guide-title"
      data-testid="pwa-install-modal"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] text-left"
      onClick={() => setShowGuide(false)}
    >
      <div
        data-testid="pwa-install-modal-card"
        className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl bg-[#120b22] border border-[#00f0ff]/55 shadow-neon-cyan relative text-slate-200 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Pinned Modal Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#00f0ff]/15 border border-[#00f0ff]/50 text-[#00f0ff] flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-mono-tech text-[#fcee0a] tracking-widest uppercase">
                GEEK // PWA APP
              </p>
              <h3
                id="pwa-guide-title"
                className="font-cyber font-bold text-sm sm:text-lg text-white leading-tight truncate"
              >
                Установить Geek на телефон
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowGuide(false)}
            aria-label="Закрыть инструкцию установки"
            data-testid="pwa-install-modal-close"
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4 geek-chat-scroll">
          <p className="text-xs text-slate-300 leading-relaxed">
            Приложение откроется на весь экран без адресной строки и сохранит быстрый доступ к{' '}
            <span className="text-[#00f0ff] font-semibold">интерактивному клиенту</span> и{' '}
            <span className="text-[#ff7aa8] font-semibold">таймеру запуска Geek</span>.
          </p>

          {/* Platform Switcher Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#090514] border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('android')}
              className={`py-2 px-2 rounded-lg text-[11px] font-cyber font-bold tracking-wide flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'android'
                  ? 'bg-[#00f0ff] text-[#0b0714]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span>Android</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ios')}
              className={`py-2 px-2 rounded-lg text-[11px] font-cyber font-bold tracking-wide flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'ios'
                  ? 'bg-[#00f0ff] text-[#0b0714]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Share className="w-3.5 h-3.5 shrink-0" />
              <span>iPhone</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('desktop')}
              className={`py-2 px-2 rounded-lg text-[11px] font-cyber font-bold tracking-wide flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'desktop'
                  ? 'bg-[#00f0ff] text-[#0b0714]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5 shrink-0" />
              <span>ПК</span>
            </button>
          </div>

          {activeTab === 'android' && (
            <ol className="space-y-2.5 text-xs text-slate-200 leading-relaxed">
              <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#090514]/80 border border-white/10">
                <span className="w-5 h-5 rounded-md bg-[#00f0ff]/20 border border-[#00f0ff]/50 text-[#00f0ff] font-mono-tech font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Откройте сайт в <strong>Chrome</strong>, <strong>Edge</strong>,{' '}
                  <strong>Яндекс Браузере</strong> или <strong>Samsung Internet</strong> на Android.
                </span>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#090514]/80 border border-white/10">
                <span className="w-5 h-5 rounded-md bg-[#00f0ff]/20 border border-[#00f0ff]/50 text-[#00f0ff] font-mono-tech font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Нажмите меню браузера <strong>⋮</strong> в правом верхнем углу и выберите{' '}
                  <strong className="text-[#fcee0a]">«Установить приложение»</strong> (или «Добавить на главный экран»).
                </span>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#090514]/80 border border-white/10">
                <span className="w-5 h-5 rounded-md bg-[#00f0ff]/20 border border-[#00f0ff]/50 text-[#00f0ff] font-mono-tech font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Подтвердите установку — иконка <strong>Geek</strong> появится на рабочем столе (долгое нажатие откроет быстрый ярлык <strong>Live чат</strong>).
                </span>
              </li>
            </ol>
          )}

          {activeTab === 'ios' && (
            <ol className="space-y-2.5 text-xs text-slate-200 leading-relaxed">
              <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#090514]/80 border border-white/10">
                <span className="w-5 h-5 rounded-md bg-[#ff007f]/20 border border-[#ff007f]/50 text-[#ff7aa8] font-mono-tech font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Откройте сайт в браузере <strong>Safari</strong> на iPhone или iPad.
                </span>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#090514]/80 border border-white/10">
                <span className="w-5 h-5 rounded-md bg-[#ff007f]/20 border border-[#ff007f]/50 text-[#ff7aa8] font-mono-tech font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Нажмите кнопку <strong>«Поделиться»</strong> в нижней панели браузера.
                </span>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#090514]/80 border border-white/10">
                <span className="w-5 h-5 rounded-md bg-[#ff007f]/20 border border-[#ff007f]/50 text-[#ff7aa8] font-mono-tech font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Выберите <strong className="text-[#fcee0a]">«На экран „Домой“»</strong> и нажмите <strong>«Добавить»</strong>.
                </span>
              </li>
            </ol>
          )}

          {activeTab === 'desktop' && (
            <ol className="space-y-2.5 text-xs text-slate-200 leading-relaxed">
              <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#090514]/80 border border-white/10">
                <span className="w-5 h-5 rounded-md bg-[#fcee0a]/20 border border-[#fcee0a]/50 text-[#fcee0a] font-mono-tech font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  В <strong>Chrome</strong> или <strong>Edge</strong> нажмите иконку установки в правой части адресной строки.
                </span>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#090514]/80 border border-white/10">
                <span className="w-5 h-5 rounded-md bg-[#fcee0a]/20 border border-[#fcee0a]/50 text-[#fcee0a] font-mono-tech font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Нажмите <strong>«Установить»</strong> — Geek откроется в отдельном окне как десктоп-клиент.
                </span>
              </li>
            </ol>
          )}
        </div>

        {/* Pinned Modal Footer */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-white/10 bg-[#0e081c]">
          <span className="text-[11px] font-mono-tech text-emerald-400 flex items-center gap-1.5 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Автообновления включены</span>
          </span>
          <button
            type="button"
            onClick={() => setShowGuide(false)}
            className="px-4 py-2 rounded-xl bg-[#00f0ff] text-[#0b0714] font-cyber font-bold text-xs tracking-wider hover:brightness-110 cursor-pointer shrink-0"
          >
            ПОНЯТНО
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {buttonNode}
      {modalNode && typeof document !== 'undefined' ? createPortal(modalNode, document.body) : null}
    </>
  );
}

