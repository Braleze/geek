import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Clock, Send, Share2 } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import {
  LAUNCH_REDIRECT_URL,
  formatCountdownPart,
  getCountdownSnapshot,
  pluralizeRu,
} from '../utils/launchCountdown';

interface LaunchCountdownCardProps {
  onShareSite: () => void;
  linkCopied: boolean;
}

const DAY_FORMS: readonly [string, string, string] = ['день', 'дня', 'дней'];
const HOUR_FORMS: readonly [string, string, string] = ['час', 'часа', 'часов'];
const MINUTE_FORMS: readonly [string, string, string] = ['минута', 'минуты', 'минут'];
const SECOND_FORMS: readonly [string, string, string] = ['секунда', 'секунды', 'секунд'];

export function LaunchCountdownCard({
  onShareSite,
  linkCopied,
}: LaunchCountdownCardProps) {
  const [countdown, setCountdown] = useState(() => getCountdownSnapshot(Date.now()));

  useEffect(() => {
    const update = () => {
      const next = getCountdownSnapshot(Date.now());
      setCountdown(next);
      return next.isLaunched;
    };

    if (update()) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      if (update()) {
        window.clearInterval(timerId);
      }
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  const units = [
    {
      key: 'days',
      value: formatCountdownPart(countdown.days),
      label: pluralizeRu(countdown.days, DAY_FORMS),
      accent: 'text-[#00f0ff]',
    },
    {
      key: 'hours',
      value: formatCountdownPart(countdown.hours),
      label: pluralizeRu(countdown.hours, HOUR_FORMS),
      accent: 'text-white',
    },
    {
      key: 'minutes',
      value: formatCountdownPart(countdown.minutes),
      label: pluralizeRu(countdown.minutes, MINUTE_FORMS),
      accent: 'text-white',
    },
    {
      key: 'seconds',
      value: formatCountdownPart(countdown.seconds),
      label: pluralizeRu(countdown.seconds, SECOND_FORMS),
      accent: 'text-[#ff007f]',
    },
  ];

  return (
    <section
      aria-label="Обратный отсчёт до запуска Geek"
      data-testid="launch-countdown-card"
      data-launched={countdown.isLaunched ? 'true' : 'false'}
      className="w-full max-w-2xl p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#150f24] to-[#100a1d] border border-[#00f0ff]/45 shadow-neon-cyan relative overflow-hidden backdrop-blur-xl mb-14"
    >
      <div
        className="absolute -right-20 -top-20 w-56 h-56 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(0, 240, 255, 0.16) 0%, rgba(0, 240, 255, 0) 70%)',
        }}
      />
      <div
        className="absolute -left-20 -bottom-20 w-56 h-56 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(255, 0, 127, 0.14) 0%, rgba(255, 0, 127, 0) 70%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center">
        {countdown.isLaunched ? (
          <div className="w-full flex flex-col items-center space-y-5 py-2">
            <p className="text-xs sm:text-sm font-mono-tech text-[#00f0ff] tracking-wider">
              1 декабря 2026 · 12:00 МСК · Запуск состоялся
            </p>
            <h2 className="font-cyber font-black text-2xl sm:text-3xl text-white text-balance">
              GEEK уже доступен
            </h2>
            <p className="text-sm text-gray-300 max-w-md">
              Платформа открыта — переходите в основное приложение GEEK и присоединяйтесь к
              комьюнити.
            </p>
            <a
              href={LAUNCH_REDIRECT_URL}
              data-testid="launch-redirect-btn"
              className="cyber-btn w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-[#00f0ff] via-[#ff007f] to-[#fcee0a] text-[#0b0714] font-cyber font-black text-sm sm:text-base tracking-wider hover:brightness-110 transform hover:scale-[1.02] transition-all duration-200 shadow-pink-button-glow flex items-center justify-center gap-2.5 whitespace-nowrap"
            >
              <span>Перейти в GEEK</span>
              <ArrowUpRight className="w-5 h-5 shrink-0" />
            </a>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-mono-tech text-[#00f0ff] mb-2">
              <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>1 декабря 2026 · 12:00 МСК</span>
            </div>

            <h2 className="font-cyber font-bold text-xl sm:text-2xl text-white mb-6 text-balance">
              До официального запуска GEEK
            </h2>

            {/* 4-unit tabular countdown strip */}
            <div
              role="timer"
              aria-label="Время до запуска Geek 1 декабря 2026 года в 12:00 по Москве"
              data-testid="launch-countdown-timer"
              className="w-full grid grid-cols-2 sm:grid-cols-4 border-t border-white/10 pt-2 pb-2"
            >
              {units.map((unit, index) => {
                const dividerClasses =
                  index === 0
                    ? 'border-r border-b sm:border-b-0 border-white/10'
                    : index === 1
                      ? 'border-b sm:border-b-0 sm:border-r border-white/10'
                      : index === 2
                        ? 'border-r border-white/10'
                        : '';

                return (
                  <div
                    key={unit.key}
                    data-testid={`countdown-${unit.key}`}
                    className={`flex flex-col items-center justify-center py-3.5 sm:py-4 px-2 ${dividerClasses}`}
                  >
                    <span
                      className={`font-mono-tech tabular-nums font-bold text-3xl sm:text-4xl tracking-tight leading-none ${unit.accent}`}
                    >
                      {unit.value}
                    </span>
                    <span className="mt-2 text-xs text-gray-400 font-medium">
                      {unit.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Secondary actions row */}
        <div className="w-full mt-2 pt-5 border-t border-white/10 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3">
          <a
            href="https://t.me/geek_mes"
            target="_blank"
            rel="noopener noreferrer"
            className="cyber-btn w-full sm:w-auto px-5 py-3.5 rounded-xl bg-gradient-to-r from-[#ff007f] to-[#db2777] text-white font-cyber font-bold text-xs sm:text-sm tracking-wider hover:brightness-110 transform hover:scale-[1.02] transition-all duration-200 shadow-pink-button-glow flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Send className="w-4 h-4 shrink-0" />
            <span>TELEGRAM-КАНАЛ</span>
          </a>

          <PWAInstallButton variant="hero" />

          <button
            type="button"
            onClick={onShareSite}
            aria-label="Скопировать ссылку на сайт Geek"
            className="cyber-btn w-full sm:w-auto px-5 py-3.5 rounded-xl bg-[#150f24] border border-[#00f0ff]/55 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#0b0714] font-cyber font-bold text-xs tracking-wider flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
          >
            {linkCopied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            <span>{linkCopied ? 'ССЫЛКА СКОПИРОВАНА' : 'ПОДЕЛИТЬСЯ'}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
