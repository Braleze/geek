import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { CyberpunkSynthPlayer } from '../utils/rickrollAudio';

interface JohnnyStageProps {
  onClose: () => void;
  onResetKeypad: () => void;
}

const JOHNNY_QUOTES = [
  '«Проснись, самурай. Нам пора сжечь этот город.»',
  "Chippin' in... Протокол Relic 2077 активирован.",
  '«В Найт-Сити легендами становятся не просто так.»',
  '«Никогда не сдавайся без боя, чумба.»',
];

export function JohnnyStage({ onClose, onResetKeypad }: JohnnyStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<CyberpunkSynthPlayer | null>(null);
  const [muted, setMuted] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const player = new CyberpunkSynthPlayer();
    playerRef.current = player;
    player.start();

    return () => {
      player.stop();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    playerRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % JOHNNY_QUOTES.length);
    }, 2400);
    return () => window.clearInterval(interval);
  }, []);

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

    const drawFrame = (now: number) => {
      const t = prefersReducedMotion ? 0.4 : (now - startTime) / 1000;
      const w = canvas.width;
      const h = canvas.height;
      const pulse = Math.sin(t * 6.5);
      const glitchTrigger = !prefersReducedMotion && Math.sin(t * 5.2) > 0.86;
      const glitchOffset = glitchTrigger ? Math.sin(t * 70) * 6 : 0;

      // Night City dark crimson-yellow sky
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#09050f');
      sky.addColorStop(0.55, '#1b0b1e');
      sky.addColorStop(1, '#2b0917');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Giant Samurai neon sun / halo behind Johnny
      const sunGrad = ctx.createRadialGradient(w / 2, h * 0.48, 12, w / 2, h * 0.48, 128);
      sunGrad.addColorStop(0, 'rgba(252, 238, 10, 0.35)');
      sunGrad.addColorStop(0.55, 'rgba(255, 0, 68, 0.24)');
      sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.48, 128, 0, Math.PI * 2);
      ctx.fill();

      // Night City skyline silhouettes
      const buildings = [
        [20, 120, 42],
        [68, 155, 36],
        [110, 95, 48],
        [402, 110, 46],
        [454, 165, 38],
        [498, 130, 44],
      ];
      for (const [bx, bh, bw] of buildings) {
        ctx.fillStyle = '#0e0a19';
        ctx.fillRect(bx, h * 0.78 - bh, bw, bh);
        ctx.fillStyle = 'rgba(0, 240, 255, 0.25)';
        for (let wy = h * 0.78 - bh + 12; wy < h * 0.76; wy += 16) {
          ctx.fillRect(bx + 7, wy, 5, 6);
          ctx.fillRect(bx + bw - 14, wy, 5, 6);
        }
      }

      // Neon Samurai Ring
      ctx.strokeStyle = 'rgba(255, 0, 72, 0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.46, 94 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();

      // Cyberpunk grid floor
      const floorY = h * 0.78;
      ctx.fillStyle = '#0c0714';
      ctx.fillRect(0, floorY, w, h - floorY);
      ctx.strokeStyle = 'rgba(252, 238, 10, 0.4)';
      ctx.lineWidth = 1.5;
      for (let i = -7; i <= 7; i++) {
        ctx.beginPath();
        ctx.moveTo(w / 2 + i * 34, floorY);
        ctx.lineTo(w / 2 + i * 82, h);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, floorY);
      ctx.lineTo(w, floorY);
      ctx.stroke();

      // Johnny Silverhand holographic figure
      const drawJohnny = (dx: number, tintOverlay: string | null) => {
        ctx.save();
        ctx.translate(w / 2 + dx, floorY + Math.sin(t * 2.2) * 2);

        // Long dark hair behind head/shoulders
        ctx.fillStyle = tintOverlay ?? '#11131c';
        ctx.beginPath();
        ctx.moveTo(-26, -158);
        ctx.quadraticCurveTo(0, -178, 26, -158);
        ctx.lineTo(32, -98);
        ctx.lineTo(-32, -98);
        ctx.closePath();
        ctx.fill();

        // Leather Samurai Vest / Jacket torso
        ctx.fillStyle = tintOverlay ?? '#191b26';
        ctx.beginPath();
        ctx.moveTo(-36, -118);
        ctx.lineTo(36, -118);
        ctx.lineTo(42, -16);
        ctx.lineTo(-42, -16);
        ctx.closePath();
        ctx.fill();

        // Tactical strap & silver dog tags
        ctx.strokeStyle = tintOverlay ?? '#94a3b8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-22, -118);
        ctx.lineTo(18, -32);
        ctx.stroke();
        ctx.fillStyle = tintOverlay ?? '#cbd5e1';
        ctx.fillRect(-4, -92, 8, 11);

        // Red Samurai glowing collar
        ctx.strokeStyle = tintOverlay ?? '#ff0048';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-24, -118);
        ctx.lineTo(0, -104);
        ctx.lineTo(24, -118);
        ctx.stroke();

        // Right arm (flesh/glove) resting on guitar neck
        ctx.strokeStyle = tintOverlay ?? '#e2b591';
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-34, -108);
        ctx.lineTo(-52, -74);
        ctx.lineTo(-22, -56);
        ctx.stroke();

        // Iconic Left Chrome Cybernetic Arm!
        const armGrad = ctx.createLinearGradient(28, -112, 62, -62);
        armGrad.addColorStop(0, '#e2e8f0');
        armGrad.addColorStop(0.5, '#64748b');
        armGrad.addColorStop(1, '#f8fafc');
        ctx.strokeStyle = tintOverlay ?? armGrad;
        ctx.lineWidth = 13;
        ctx.beginPath();
        ctx.moveTo(34, -108);
        ctx.lineTo(54, -84);
        ctx.lineTo(44, -124 + Math.sin(t * 4) * 4);
        ctx.stroke();

        // Cybernetic hand rock/salute fingers + cyan Relic spark
        ctx.fillStyle = tintOverlay ?? '#cbd5e1';
        ctx.beginPath();
        ctx.arc(44, -126 + Math.sin(t * 4) * 4, 7, 0, Math.PI * 2);
        ctx.fill();
        if (!tintOverlay) {
          ctx.fillStyle = '#00f0ff';
          ctx.fillRect(39, -135 + Math.sin(t * 4) * 4, 3, 9);
          ctx.fillRect(46, -135 + Math.sin(t * 4) * 4, 3, 9);
        }

        // Electric Cyber Guitar slung across chest
        ctx.save();
        ctx.translate(-6, -60);
        ctx.rotate(-0.42);
        ctx.fillStyle = tintOverlay ?? '#dc2626';
        ctx.beginPath();
        ctx.moveTo(-26, -14);
        ctx.lineTo(18, -10);
        ctx.lineTo(24, 14);
        ctx.lineTo(-28, 18);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = tintOverlay ?? '#fcee0a';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Guitar neck
        ctx.fillStyle = tintOverlay ?? '#0f172a';
        ctx.fillRect(-74, -4, 52, 7);
        ctx.restore();

        // Neck & Head
        ctx.fillStyle = tintOverlay ?? '#e5b894';
        ctx.fillRect(-8, -132, 16, 16);
        ctx.beginPath();
        ctx.arc(0, -144, 18, 0, Math.PI * 2);
        ctx.fill();

        // Beard / Goatee
        ctx.fillStyle = tintOverlay ?? '#1e293b';
        ctx.beginPath();
        ctx.moveTo(-12, -138);
        ctx.quadraticCurveTo(0, -121, 12, -138);
        ctx.lineTo(8, -130);
        ctx.lineTo(-8, -130);
        ctx.closePath();
        ctx.fill();

        // Hair bangs
        ctx.fillStyle = tintOverlay ?? '#0f172a';
        ctx.beginPath();
        ctx.moveTo(-18, -150);
        ctx.quadraticCurveTo(0, -168, 18, -150);
        ctx.lineTo(12, -144);
        ctx.lineTo(-4, -150);
        ctx.lineTo(-14, -143);
        ctx.closePath();
        ctx.fill();

        // Signature Red-Amber Aviator Sunglasses
        ctx.fillStyle = tintOverlay ?? '#ff3b1f';
        ctx.fillRect(-14, -149, 12, 7);
        ctx.fillRect(2, -149, 12, 7);
        ctx.fillStyle = tintOverlay ?? '#fcee0a';
        ctx.fillRect(-12, -148, 5, 2);
        ctx.fillRect(4, -148, 5, 2);
        ctx.strokeStyle = tintOverlay ?? '#cbd5e1';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-2, -146);
        ctx.lineTo(2, -146);
        ctx.stroke();

        ctx.restore();
      };

      // Hologram RGB chromatic aberration glitch layers
      if (glitchTrigger) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        drawJohnny(glitchOffset - 4, '#00f0ff');
        drawJohnny(-glitchOffset + 4, '#ff0048');
        ctx.restore();
      }
      drawJohnny(glitchOffset * 0.3, null);

      // Relic hologram scanlines across canvas
      ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
      for (let sy = (t * 40) % 14; sy < h; sy += 14) {
        ctx.fillRect(0, sy, w, 2);
      }

      if (!prefersReducedMotion) {
        animId = requestAnimationFrame(drawFrame);
      }
    };

    animId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div
      className="flex flex-col items-center text-center"
      data-testid="johnny-stage"
    >
      <div className="w-full flex items-center justify-between gap-4 mb-4">
        <div className="text-left">
          <p className="text-xs font-mono-tech text-[#fcee0a] tracking-widest uppercase">
            RELIC ПРОТОКОЛ · КОД 2077
          </p>
          <h2 className="font-cyber font-black text-xl sm:text-2xl text-white">
            ПРОСНИСЬ, САМУРАЙ!
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть секретную комнату"
          className="w-10 h-10 rounded-xl bg-white/5 border border-white/15 text-slate-300 hover:text-white hover:border-[#fcee0a] flex items-center justify-center transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Night City Johnny Silverhand Stage */}
      <div className="relative w-full rounded-2xl overflow-hidden border-2 border-[#fcee0a]/80 shadow-neon-yellow bg-[#09050f] mb-5">
        <canvas
          ref={canvasRef}
          width={560}
          height={300}
          className="w-full h-auto block"
          aria-label="Голограмма Джонни Сильверхенда в стиле Cyberpunk 2077"
        />

        <div className="px-4 py-3 bg-[#150f24]/95 border-t border-[#fcee0a]/30">
          <p className="font-cyber font-bold text-sm sm:text-base text-[#fcee0a] tracking-wide">
            {JOHNNY_QUOTES[quoteIndex]}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="w-full flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted((prev) => !prev)}
            className="px-3.5 py-2.5 rounded-xl bg-[#1c1432] border border-[#fcee0a]/50 text-white hover:border-[#fcee0a] text-[11px] font-cyber font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-[#ff007f]" /> : <Volume2 className="w-4 h-4 text-[#fcee0a]" />}
            <span>{muted ? 'ЗВУК ВКЛ' : 'БЕЗ ЗВУКА'}</span>
          </button>

          <button
            type="button"
            onClick={onResetKeypad}
            className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-slate-200 hover:text-white hover:border-white/40 text-[11px] font-cyber font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>СБРОСИТЬ КОД</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl bg-[#fcee0a] text-[#0b0714] text-[11px] font-cyber font-black hover:opacity-95 transition-opacity whitespace-nowrap cursor-pointer"
        >
          ВЕРНУТЬСЯ НА САЙТ
        </button>
      </div>
    </div>
  );
}
