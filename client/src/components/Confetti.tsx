import { useEffect, useRef } from 'react';
import { useSettings } from '../store/settings';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  color: string;
  shape: 'rect' | 'circle' | 'star';
}

const COLORS = ['#ffd23f', '#ff5a5f', '#2d7dff', '#3bceac', '#9d4edd', '#fff8e7'];

/** Canvas confetti burst. `variant` follows the player's showdown-effect cosmetic. */
export function Confetti({ fire, variant = 'confetti' }: { fire: number; variant?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useSettings((s) => s.reducedMotion);

  useEffect(() => {
    if (!fire || reduced) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const shape: Particle['shape'] = variant === 'stars' ? 'star' : variant === 'splat' ? 'circle' : 'rect';
    const parts: Particle[] = Array.from({ length: variant === 'splat' ? 70 : 160 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height * 0.45,
      vx: (Math.random() - 0.5) * 18,
      vy: -Math.random() * 18 - 6,
      r: variant === 'splat' ? 6 + Math.random() * 16 : 4 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape,
    }));
    let frame = 0;
    let ticks = 0;
    const step = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.vy += 0.45;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'star') {
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const rr = i % 2 ? p.r / 2 : p.r;
            ctx.lineTo(Math.cos((i * Math.PI) / 5) * rr, Math.sin((i * Math.PI) / 5) * rr);
          }
          ctx.fill();
        } else ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
      }
      if (++ticks < 220) frame = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [fire, variant, reduced]);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-50" aria-hidden />;
}
