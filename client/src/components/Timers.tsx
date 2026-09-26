import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';
import { useSettings } from '../store/settings';

export function TimerRing({ msLeft, totalMs, size = 64 }: { msLeft: number; totalMs: number; size?: number }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const frac = totalMs > 0 ? Math.max(0, Math.min(1, msLeft / totalMs)) : 0;
  const secs = Math.ceil(msLeft / 1000);
  const urgent = msLeft <= 5000;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="timer" aria-label={`${secs} seconds left`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(var(--c-ink))" strokeWidth={10} fill="rgb(var(--c-paper))" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={urgent ? 'rgb(var(--c-coral))' : 'rgb(var(--c-mint))'}
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
        />
      </svg>
      <span className={`absolute font-display text-xl text-ink ${urgent ? 'animate-wiggle' : ''}`}>{secs}</span>
    </div>
  );
}

export function CountdownBar({ msLeft, totalMs }: { msLeft: number; totalMs: number }) {
  const frac = totalMs > 0 ? Math.max(0, Math.min(1, msLeft / totalMs)) : 0;
  return (
    <div className="h-5 w-full overflow-hidden rounded-full border-3 border-ink bg-night2" role="progressbar" aria-valuenow={Math.ceil(msLeft / 1000)} aria-valuemin={0} aria-valuemax={Math.ceil(totalMs / 1000)}>
      <div className={`h-full ${frac < 0.4 ? 'bg-coral' : 'bg-sun'} transition-[width] duration-100 ease-linear`} style={{ width: `${frac * 100}%` }} />
    </div>
  );
}

/** Number that ticks up to its value. */
export function AnimatedNumber({ value, decimals = 0, duration = 1.2, prefix = '' }: { value: number; decimals?: number; duration?: number; prefix?: string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const reduced = useSettings((s) => s.reducedMotion);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, { duration, ease: 'easeOut', onUpdate: (v) => setShown(v) });
    from.current = value;
    return () => controls.stop();
  }, [value, duration, reduced]);
  return (
    <span>
      {prefix}
      {shown.toFixed(decimals)}
    </span>
  );
}
