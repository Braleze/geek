import { useEffect, useRef, useState } from 'react';
import { ExternalLink, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { RickrollSynthPlayer } from '../utils/rickrollAudio';

interface RickrollStageProps {
  onClose: () => void;
  onResetKeypad: () => void;
}

const LYRICS = [
  "We're no strangers to love...",
  'You know the rules and so do I',
  'Never gonna give you up!',
  'Never gonna let you down!',
  'Never gonna run around and desert you!',
  'Never gonna make you cry!',
  'Never gonna say goodbye!',
  'Never gonna tell a lie and hurt you!',
];

export function RickrollStage({ onClose, onResetKeypad }: RickrollStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<RickrollSynthPlayer | null>(null);
  const [muted, setMuted] = useState(false);
  const [lyricIndex, setLyricIndex] = useState(0);

  // Start synthesized Rickroll soundtrack
  useEffect(() => {
    const player = new RickrollSynthPlayer();
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

  // Cycle lyrics on beat
  useEffect(() => {
    const interval = window.setInterval(() => {
      setLyricIndex((prev) => (prev + 1) % LYRICS.length);
    }, 1900);
    return () => window.clearInterval(interval);
  }, []);

  // Render animated retro disco Rickroll stage on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animId = 0;
    let startTime = performance.now();

    const drawFrame = (now: number) => {
      const t = prefersReducedMotion ? 0.5 : (now - startTime) / 1000;
      const w = canvas.width;
      const h = canvas.height;
      const beat = Math.sin(t * 7.5);
      const sway = Math.sin(t * 3.75);
      const bounce = Math.abs(beat) * 10;

      // Dark stage background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#0b0714');
      bgGrad.addColorStop(0.65, '#190f2e');
      bgGrad.addColorStop(1, '#260d32');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Sweeping neon spotlights
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const drawBeam = (originX: number, angleOffset: number, color: string) => {
        const angle = Math.sin(t * 1.4 + angleOffset) * 0.32;
        ctx.save();
        ctx.translate(originX, -10);
        ctx.rotate(angle);
        const beamGrad = ctx.createLinearGradient(0, 0, 0, h * 1.1);
        beamGrad.addColorStop(0, color);
        beamGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(-18, 0);
        ctx.lineTo(18, 0);
        ctx.lineTo(95, h * 1.1);
        ctx.lineTo(-95, h * 1.1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      drawBeam(w * 0.2, 0, 'rgba(0, 240, 255, 0.16)');
      drawBeam(w * 0.8, 2.1, 'rgba(255, 0, 127, 0.18)');
      drawBeam(w * 0.5, 4.2, 'rgba(252, 238, 10, 0.1)');
      ctx.restore();

      // Checkered retro dance floor
      const floorY = h * 0.72;
      ctx.fillStyle = '#120a24';
      ctx.fillRect(0, floorY, w, h - floorY);
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.lineWidth = 1.5;
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(w / 2 + i * 32, floorY);
        ctx.lineTo(w / 2 + i * 76, h);
        ctx.stroke();
      }
      for (let row = 0; row < 5; row++) {
        const y = floorY + Math.pow(row / 4, 1.5) * (h - floorY);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Audio equalizer bars behind Rick
      const barCount = 18;
      const barWidth = (w * 0.72) / barCount;
      const startX = w * 0.14;
      for (let i = 0; i < barCount; i++) {
        const barH = 16 + Math.abs(Math.sin(t * 6 + i * 0.7)) * 68;
        ctx.fillStyle =
          i % 3 === 0
            ? 'rgba(0, 240, 255, 0.35)'
            : i % 3 === 1
              ? 'rgba(255, 0, 127, 0.35)'
              : 'rgba(252, 238, 10, 0.3)';
        ctx.fillRect(startX + i * barWidth + 2, floorY - barH, barWidth - 6, barH);
      }

      // Stylized Dancing Rick Figure
      const cx = w / 2 + sway * 16;
      const cy = floorY - 12 - bounce;

      ctx.save();
      ctx.translate(cx, cy);

      // Shadow on floor
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 14 + bounce, 40, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Legs (black trousers + dancing knee bend)
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-12, -50);
      ctx.lineTo(-18 + sway * 8, -22);
      ctx.lineTo(-14 - sway * 6, 4);
      ctx.moveTo(12, -50);
      ctx.lineTo(18 + sway * 8, -22);
      ctx.lineTo(16 + sway * 5, 4);
      ctx.stroke();

      // Shoes
      ctx.fillStyle = '#020617';
      ctx.fillRect(-24 - sway * 6, 1, 18, 8);
      ctx.fillRect(8 + sway * 5, 1, 18, 8);

      // Iconic Beige Trench Coat & Black Turtleneck
      ctx.save();
      ctx.rotate(sway * 0.09);

      // Coat body
      ctx.fillStyle = '#d6b48a';
      ctx.beginPath();
      ctx.moveTo(-26, -122);
      ctx.lineTo(26, -122);
      ctx.lineTo(35, -36);
      ctx.lineTo(-35, -36);
      ctx.closePath();
      ctx.fill();

      // Black Turtleneck V-panel
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.moveTo(-12, -122);
      ctx.lineTo(12, -122);
      ctx.lineTo(6, -65);
      ctx.lineTo(-6, -65);
      ctx.closePath();
      ctx.fill();

      // Coat lapels
      ctx.fillStyle = '#b99364';
      ctx.beginPath();
      ctx.moveTo(-24, -122);
      ctx.lineTo(-10, -122);
      ctx.lineTo(-14, -82);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(24, -122);
      ctx.lineTo(10, -122);
      ctx.lineTo(14, -82);
      ctx.closePath();
      ctx.fill();

      // Swinging Arms (classic Rickroll groove!)
      ctx.strokeStyle = '#d6b48a';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      // Left arm
      ctx.beginPath();
      ctx.moveTo(-24, -114);
      ctx.lineTo(-42 - beat * 8, -88 + sway * 10);
      ctx.lineTo(-28 + beat * 12, -72 - sway * 12);
      ctx.stroke();
      // Right arm
      ctx.beginPath();
      ctx.moveTo(24, -114);
      ctx.lineTo(42 + beat * 8, -88 - sway * 10);
      ctx.lineTo(28 - beat * 12, -72 + sway * 12);
      ctx.stroke();

      // Hands
      ctx.fillStyle = '#f5cfa8';
      ctx.beginPath();
      ctx.arc(-28 + beat * 12, -72 - sway * 12, 6, 0, Math.PI * 2);
      ctx.arc(28 - beat * 12, -72 + sway * 12, 6, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.fillStyle = '#f5cfa8';
      ctx.beginPath();
      ctx.arc(0, -142, 18, 0, Math.PI * 2);
      ctx.fill();

      // Iconic Red/Auburn 80s Pompadour Hair
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.moveTo(-18, -144);
      ctx.quadraticCurveTo(-20, -170, 4, -168);
      ctx.quadraticCurveTo(24, -166, 18, -143);
      ctx.quadraticCurveTo(4, -152, -18, -144);
      ctx.fill();

      // Cool Neon Sunglasses
      ctx.fillStyle = '#090d16';
      ctx.fillRect(-13, -147, 11, 6);
      ctx.fillRect(2, -147, 11, 6);
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(-11, -145, 4, 2);
      ctx.fillRect(4, -145, 4, 2);

      // Smile
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -136, 6, 0.15, Math.PI - 0.15);
      ctx.stroke();

      ctx.restore();
      ctx.restore();

      // Floating musical notes
      ctx.font = 'bold 20px Outfit, sans-serif';
      for (let i = 0; i < 4; i++) {
        const noteY = h * 0.45 - ((t * 45 + i * 65) % 150);
        const noteX = w * (0.16 + i * 0.22) + Math.sin(t * 2 + i) * 14;
        ctx.fillStyle = i % 2 === 0 ? '#00f0ff' : '#ff007f';
        ctx.globalAlpha = Math.max(0.15, Math.min(0.9, (noteY - 20) / 140));
        ctx.fillText(i % 2 === 0 ? '♪' : '♫', noteX, noteY);
      }
      ctx.globalAlpha = 1;

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
      data-testid="rickroll-stage"
    >
      <div className="w-full flex items-center justify-between gap-4 mb-4">
        <div className="text-left">
          <p className="text-xs font-mono-tech text-[#fcee0a] tracking-widest uppercase">
            ДОСТУП РАЗРЕШЁН · СЕКРЕТНЫЙ ПРОТОКОЛ
          </p>
          <h2 className="font-cyber font-black text-xl sm:text-2xl text-white">
            ВЫ БЫЛИ ЗАРИКРОЛЛЕНЫ!
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть секретную комнату"
          className="w-10 h-10 rounded-xl bg-white/5 border border-white/15 text-slate-300 hover:text-white hover:border-[#ff007f] flex items-center justify-center transition-colors shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Retro CRT Rickroll Stage */}
      <div className="relative w-full rounded-2xl overflow-hidden border-2 border-[#ff007f]/70 shadow-neon-pink bg-[#0b0714] mb-5">
        <canvas
          ref={canvasRef}
          width={560}
          height={300}
          className="w-full h-auto block"
          aria-label="Анимация танца Рика Эстли — Never Gonna Give You Up"
        />

        {/* Lyrics Banner */}
        <div className="px-4 py-3 bg-[#150f24]/95 border-t border-white/10">
          <p className="font-cyber font-bold text-sm sm:text-base text-[#00f0ff] tracking-wide">
            {LYRICS[lyricIndex]}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="w-full flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted((prev) => !prev)}
            className="px-3.5 py-2.5 rounded-xl bg-[#1c1432] border border-[#00f0ff]/40 text-white hover:border-[#00f0ff] text-[11px] font-cyber font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-[#ff007f]" /> : <Volume2 className="w-4 h-4 text-[#00f0ff]" />}
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

        <a
          href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#00f0ff] via-[#ff007f] to-[#fcee0a] text-[#0b0714] text-[11px] font-cyber font-black flex items-center gap-1.5 hover:opacity-95 transition-opacity whitespace-nowrap"
        >
          <span>YOUTUBE ОРИГИНАЛ</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
