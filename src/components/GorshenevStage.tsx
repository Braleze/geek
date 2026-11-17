import { useEffect, useRef, useState } from 'react';
import { Flame, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { TrackAudioPlayer } from '../utils/audioTracks';

interface GorshenevStageProps {
  onClose: () => void;
  onResetKeypad: () => void;
}

const TRIBUTE_QUOTES = [
  '«Воспоминания о былой любви...»',
  '«Пока звучат песни — легенда остаётся жива.»',
  '«Король и Шут · Светлая память Михаилу Горшенёву.»',
  '«19 июля · Навсегда в наших сердцах.»',
];

export function GorshenevStage({ onClose, onResetKeypad }: GorshenevStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<TrackAudioPlayer | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const player = new TrackAudioPlayer('tribute');
    playerRef.current = player;
    player.start();

    const quoteInterval = window.setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % TRIBUTE_QUOTES.length);
    }, 2800);

    return () => {
      window.clearInterval(quoteInterval);
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

    let animId = 0;
    const startTime = performance.now();

    const embers = Array.from({ length: 28 }, (_, i) => ({
      x: (i * 43) % 520,
      y: (i * 31) % 260,
      r: 1.2 + (i % 3) * 0.7,
      speed: 14 + (i % 5) * 6,
      drift: ((i % 7) - 3) * 4,
    }));

    const drawCandle = (cx: number, cy: number, h: number, t: number, phase: number) => {
      // Candle body
      ctx.fillStyle = '#e7dcc8';
      ctx.fillRect(cx - 5, cy - h, 10, h);
      ctx.fillStyle = '#b79e7a';
      ctx.fillRect(cx + 1, cy - h, 4, h);

      // Wick
      ctx.strokeStyle = '#1f1612';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy - h);
      ctx.lineTo(cx, cy - h - 5);
      ctx.stroke();

      // Flickering flame & halo
      const sway = Math.sin(t * 7 + phase) * 1.8;
      const halo = ctx.createRadialGradient(cx + sway, cy - h - 10, 2, cx + sway, cy - h - 10, 26);
      halo.addColorStop(0, 'rgba(255, 196, 80, 0.55)');
      halo.addColorStop(0.5, 'rgba(225, 29, 72, 0.18)');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx + sway, cy - h - 10, 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(cx, cy - h - 4);
      ctx.quadraticCurveTo(cx - 5 + sway * 0.5, cy - h - 11, cx + sway, cy - h - 18);
      ctx.quadraticCurveTo(cx + 5 + sway * 0.5, cy - h - 11, cx, cy - h - 4);
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(cx + sway * 0.4, cy - h - 9, 2.3, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = (now: number) => {
      const t = (now - startTime) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      // Dark gothic stage backdrop
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#09050c');
      bg.addColorStop(0.55, '#190915');
      bg.addColorStop(1, '#12070d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Crimson moon / memorial aura behind stage
      const aura = ctx.createRadialGradient(w / 2, h * 0.42, 16, w / 2, h * 0.42, 150);
      aura.addColorStop(0, 'rgba(245, 158, 11, 0.24)');
      aura.addColorStop(0.45, 'rgba(225, 29, 72, 0.2)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.42, 150, 0, Math.PI * 2);
      ctx.fill();

      // Overhead warm stage spotlight cone
      ctx.save();
      const beam = ctx.createLinearGradient(w / 2, 0, w / 2, h * 0.85);
      beam.addColorStop(0, 'rgba(253, 224, 71, 0.16)');
      beam.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 26, 0);
      ctx.lineTo(w / 2 + 26, 0);
      ctx.lineTo(w / 2 + 135, h * 0.85);
      ctx.lineTo(w / 2 - 135, h * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Stage floor
      const floorY = h * 0.8;
      ctx.fillStyle = '#0c0509';
      ctx.fillRect(0, floorY, w, h - floorY);
      ctx.strokeStyle = 'rgba(225, 29, 72, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, floorY);
      ctx.lineTo(w, floorY);
      ctx.stroke();

      // Gentle audio-reactive memorial equalizer bars in background
      for (let i = 0; i < 24; i++) {
        const barX = 40 + i * 19;
        const barH = 6 + Math.abs(Math.sin(t * 2.6 + i * 0.55)) * 18;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(225, 29, 72, 0.28)' : 'rgba(245, 158, 11, 0.25)';
        ctx.fillRect(barX, floorY - barH, 8, barH);
      }

      // Rising warm embers
      for (const e of embers) {
        const ey = ((e.y - t * e.speed) % floorY + floorY) % floorY;
        const ex = (e.x + Math.sin(t * 1.3 + e.drift) * 14 + w) % w;
        const alpha = 0.25 + 0.55 * (1 - ey / floorY);
        ctx.fillStyle = `rgba(251, 191, 36, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(ex, ey, e.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Frontman silhouette with punk spikes & guitar at mic stand
      const cx = w / 2;
      const sway = Math.sin(t * 1.8) * 2.5;
      ctx.save();
      ctx.translate(cx + sway * 0.4, floorY);

      // Vintage microphone stand
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-42, 0);
      ctx.lineTo(-42, -96);
      ctx.lineTo(-22, -104);
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.ellipse(-20, -105, 5.5, 4, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // Legs
      ctx.strokeStyle = '#070308';
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-8, -46);
      ctx.lineTo(-16, -2);
      ctx.moveTo(8, -46);
      ctx.lineTo(15, -2);
      ctx.stroke();

      // Long rock coat / torso silhouette
      ctx.fillStyle = '#070308';
      ctx.beginPath();
      ctx.moveTo(-22, -40);
      ctx.lineTo(-17, -100);
      ctx.lineTo(17, -100);
      ctx.lineTo(24, -38);
      ctx.closePath();
      ctx.fill();

      // Crimson rim highlight on jacket
      ctx.strokeStyle = 'rgba(225, 29, 72, 0.7)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Acoustic/rock guitar slung diagonally
      ctx.save();
      ctx.translate(2, -68);
      ctx.rotate(-0.42);
      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(-10, 4, 17, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Guitar neck
      ctx.strokeStyle = '#d6d3d1';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(4, 2);
      ctx.lineTo(40, -2);
      ctx.stroke();
      ctx.restore();

      // Head + signature spiked punk hair silhouette
      ctx.fillStyle = '#070308';
      ctx.beginPath();
      ctx.arc(0, -114, 13, 0, Math.PI * 2);
      ctx.fill();

      // Spiked hair crown
      ctx.beginPath();
      ctx.moveTo(-13, -115);
      ctx.lineTo(-18, -130);
      ctx.lineTo(-8, -124);
      ctx.lineTo(-4, -138);
      ctx.lineTo(2, -126);
      ctx.lineTo(9, -136);
      ctx.lineTo(12, -123);
      ctx.lineTo(20, -126);
      ctx.lineTo(12, -113);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();

      // Memorial candles along front of stage
      drawCandle(86, floorY + 8, 22, t, 0.2);
      drawCandle(114, floorY + 11, 16, t, 1.4);
      drawCandle(w - 114, floorY + 11, 17, t, 2.5);
      drawCandle(w - 86, floorY + 8, 23, t, 3.8);

      animId = window.requestAnimationFrame(draw);
    };

    animId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="flex flex-col items-center w-full" data-testid="gorshenev-stage">
      <div className="w-full flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/60 text-amber-400 flex items-center justify-center">
            <Flame className="w-4 h-4" />
          </span>
          <div>
            <p className="text-[11px] font-mono-tech text-amber-400 tracking-widest uppercase">
              ПАМЯТИ МИХАИЛА ГОРШЕНЁВА · 19 ИЮЛЯ
            </p>
            <h2 className="font-cyber font-black text-base sm:text-xl text-white">
              ВОСПОМИНАНИЯ О БЫЛОЙ ЛЮБВИ
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть секретную комнату"
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/15 text-slate-300 hover:text-white hover:border-rose-500 flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stage Canvas */}
      <div className="relative w-full rounded-2xl overflow-hidden border-2 border-rose-500/70 shadow-[0_0_28px_rgba(225,29,72,0.4)] bg-[#09050c] mb-4">
        <canvas
          ref={canvasRef}
          width={520}
          height={280}
          className="w-full h-auto block"
          aria-label="Сцена памяти Михаила Горшенёва"
        />
        <div className="px-4 py-3 bg-[#150f24]/95 border-t border-rose-500/30 text-center">
          <p className="font-cyber text-xs sm:text-sm text-amber-300 tracking-wide">
            {TRIBUTE_QUOTES[quoteIndex]}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMuted((prev) => !prev)}
            className="cyber-btn px-4 py-2.5 text-xs font-cyber font-bold bg-[#150f24] border border-amber-400/60 text-amber-300 hover:bg-amber-400 hover:text-[#0b0714] flex items-center gap-2 cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{isMuted ? 'ЗВУК ВКЛ' : 'БЕЗ ЗВУКА'}</span>
          </button>

          <button
            type="button"
            onClick={onResetKeypad}
            className="cyber-btn px-4 py-2.5 text-xs font-cyber font-bold bg-[#150f24] border border-rose-500/60 text-rose-400 hover:bg-rose-500 hover:text-white flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>СБРОСИТЬ КОД</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="cyber-btn px-5 py-2.5 text-xs font-cyber font-black bg-gradient-to-r from-rose-600 via-amber-400 to-rose-500 text-[#0b0714] flex items-center gap-2 hover:opacity-95 cursor-pointer"
        >
          <span>ВЕРНУТЬСЯ НА САЙТ</span>
        </button>
      </div>
    </div>
  );
}
