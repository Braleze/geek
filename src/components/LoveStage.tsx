import { useEffect, useRef, useState } from 'react';
import { Heart, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { TrackAudioPlayer } from '../utils/audioTracks';

interface LoveStageProps {
  onClose: () => void;
  onResetKeypad: () => void;
}

const CONFESSION_LINES = [
  'Я всё ещё её люблю.',
  'Сколько бы времени ни прошло, это чувство всё ещё живо во мне.',
  'Некоторые люди остаются в сердце навсегда.',
];

export function LoveStage({ onClose, onResetKeypad }: LoveStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<TrackAudioPlayer | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    const player = new TrackAudioPlayer('love');
    playerRef.current = player;
    player.start();

    const lineInterval = window.setInterval(() => {
      setLineIndex((prev) => (prev + 1) % CONFESSION_LINES.length);
    }, 3400);

    return () => {
      window.clearInterval(lineInterval);
      player.stop();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    playerRef.current?.setMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animId = 0;
    const startTime = performance.now();

    const stars = Array.from({ length: 42 }, (_, i) => ({
      x: ((i * 67 + 19) % 520),
      y: ((i * 41 + 11) % 240),
      r: 0.9 + (i % 3) * 0.65,
      phase: i * 0.7,
    }));

    const sparks = Array.from({ length: 20 }, (_, i) => ({
      x: ((i * 53 + 29) % 520),
      y: ((i * 37 + 17) % 280),
      speed: 12 + (i % 4) * 5,
      size: 1.5 + (i % 3) * 0.7,
      drift: ((i % 5) - 2) * 3,
    }));

    const drawHeart = (cx: number, cy: number, scale: number, alpha: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.bezierCurveTo(-24, -4, -36, -24, -18, -36);
      ctx.bezierCurveTo(-6, -44, 0, -32, 0, -24);
      ctx.bezierCurveTo(0, -32, 6, -44, 18, -36);
      ctx.bezierCurveTo(36, -24, 24, -4, 0, 14);
      ctx.closePath();

      const grad = ctx.createLinearGradient(-28, -38, 28, 16);
      grad.addColorStop(0, `rgba(244, 63, 94, ${alpha})`);
      grad.addColorStop(0.55, `rgba(236, 72, 153, ${alpha})`);
      grad.addColorStop(1, `rgba(251, 113, 133, ${alpha})`);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 228, 230, ${Math.min(1, alpha * 0.75)})`;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.restore();
    };

    const draw = (now: number) => {
      const t = prefersReducedMotion ? 0.5 : (now - startTime) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      // Deep romantic night backdrop
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#09040e');
      bg.addColorStop(0.55, '#19081b');
      bg.addColorStop(1, '#120614');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Soft starlight
      for (const s of stars) {
        const twinkle = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.1 + s.phase));
        ctx.fillStyle = `rgba(255, 228, 240, ${twinkle.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Warm crimson-rose ambient aura
      const beat = Math.pow(Math.max(0, Math.sin(t * 2.4)), 4);
      const auraRadius = 115 + beat * 18;
      const aura = ctx.createRadialGradient(w / 2, h * 0.46, 12, w / 2, h * 0.46, auraRadius);
      aura.addColorStop(0, 'rgba(244, 63, 94, 0.34)');
      aura.addColorStop(0.5, 'rgba(236, 72, 153, 0.16)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.46, auraRadius, 0, Math.PI * 2);
      ctx.fill();

      // Gentle rising rose sparks
      for (const sp of sparks) {
        const sy = ((sp.y - t * sp.speed) % h + h) % h;
        const sx = (sp.x + Math.sin(t * 1.1 + sp.drift) * 14 + w) % w;
        const alpha = 0.2 + 0.5 * (1 - sy / h);
        ctx.fillStyle = `rgba(251, 113, 133, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, sp.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pulse wave line across the horizon
      const waveY = h * 0.78;
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const distCenter = Math.abs(x - w / 2) / (w * 0.32);
        const envelope = Math.exp(-distCenter * distCenter * 2.5);
        const pulseOffset =
          envelope * (Math.sin((x - w / 2) * 0.09 - t * 4.2) * (10 + beat * 12));
        const y = waveY + pulseOffset;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Outer heart echo & main glowing heart
      drawHeart(w / 2, h * 0.5, 1.55 + beat * 0.25, 0.16);
      drawHeart(w / 2, h * 0.5, 1.25 + beat * 0.12, 0.92);

      if (!prefersReducedMotion) {
        animId = window.requestAnimationFrame(draw);
      }
    };

    animId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="flex flex-col items-center w-full" data-testid="love-stage">
      <div className="w-full flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5 text-left">
          <span className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-400/60 text-rose-300 flex items-center justify-center shrink-0">
            <Heart className="w-4 h-4 fill-rose-400/40" />
          </span>
          <div>
            <p className="text-[11px] font-mono-tech text-rose-300 tracking-widest uppercase">
              ТИХОЕ ПОСЛАНИЕ · ЛИЧНОЕ
            </p>
            <h2 className="font-cyber font-black text-base sm:text-xl text-white">
              Я ВСЁ ЕЩЁ ЕЁ ЛЮБЛЮ
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть секретную комнату"
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/15 text-slate-300 hover:text-white hover:border-rose-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stage Canvas + Heartfelt Message */}
      <div className="relative w-full rounded-2xl overflow-hidden border-2 border-rose-400/70 shadow-[0_0_28px_rgba(244,63,94,0.35)] bg-[#09040e] mb-4">
        <canvas
          ref={canvasRef}
          width={520}
          height={250}
          className="w-full h-auto block"
          aria-label="Атмосферная сцена с бьющимся сердцем"
        />
        <div className="px-5 py-4 bg-[#150f24]/95 border-t border-rose-400/30 text-center space-y-1.5">
          <p className="text-sm sm:text-base font-semibold text-rose-100 leading-relaxed">
            Я всё ещё её люблю. Сколько бы времени ни прошло, эти чувства остаются со мной.
          </p>
          <p className="font-cyber text-xs text-rose-300/90 tracking-wide">
            {CONFESSION_LINES[lineIndex]}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMuted((prev) => !prev)}
            className="cyber-btn px-4 py-2.5 text-xs font-cyber font-bold bg-[#150f24] border border-rose-400/60 text-rose-200 hover:bg-rose-400 hover:text-[#0b0714] flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{isMuted ? 'ЗВУК ВКЛ' : 'БЕЗ ЗВУКА'}</span>
          </button>

          <button
            type="button"
            onClick={onResetKeypad}
            className="cyber-btn px-4 py-2.5 text-xs font-cyber font-bold bg-[#150f24] border border-pink-500/60 text-pink-300 hover:bg-pink-500 hover:text-white flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" />
            <span>СБРОСИТЬ КОД</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="cyber-btn px-5 py-2.5 text-xs font-cyber font-black bg-gradient-to-r from-rose-500 via-pink-400 to-rose-400 text-[#0b0714] flex items-center gap-2 hover:opacity-95 cursor-pointer whitespace-nowrap"
        >
          <span>ВЕРНУТЬСЯ НА САЙТ</span>
        </button>
      </div>
    </div>
  );
}
