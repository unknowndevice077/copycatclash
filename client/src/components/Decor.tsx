import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const DOODLES = [
  'M10 40 Q30 5 50 40 T90 40',
  'M20 20 L80 20 L50 75 Z',
  'M50 10 A40 40 0 1 1 49.9 10',
  'M15 50 C15 20 45 20 50 45 C55 20 85 20 85 50 C85 75 50 90 50 90 C50 90 15 75 15 50Z',
  'M10 70 L30 30 L50 60 L70 20 L90 70',
  'M50 10 L61 38 L90 38 L66 56 L75 85 L50 67 L25 85 L34 56 L10 38 L39 38Z',
];
const COLORS = ['#ffd23f', '#ff5a5f', '#2d7dff', '#3bceac', '#9d4edd'];

/** Animated doodles that draw themselves; used behind the queue screen. */
export function DoodleBackground({ count = 12 }: { count?: number }) {
  const [items] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      d: DOODLES[i % DOODLES.length],
      color: COLORS[i % COLORS.length],
      left: Math.random() * 90,
      top: Math.random() * 85,
      size: 60 + Math.random() * 90,
      delay: Math.random() * 3,
      rot: Math.random() * 40 - 20,
    })),
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((it, i) => (
        <svg key={i} viewBox="0 0 100 100" className="absolute opacity-40" style={{ left: `${it.left}%`, top: `${it.top}%`, width: it.size, height: it.size, transform: `rotate(${it.rot}deg)` }}>
          <motion.path
            d={it.d}
            fill="none"
            stroke={it.color}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 1, 0] }}
            transition={{ duration: 5, delay: it.delay, repeat: Infinity, times: [0, 0.4, 0.8, 1] }}
          />
        </svg>
      ))}
    </div>
  );
}

const SLIDES = [
  { icon: '👀', title: 'Peek', body: 'Everyone sees the same photo for a few seconds. Memorise the layout and colors!' },
  { icon: '🖌️', title: 'Draw', body: 'Recreate it with your team on one shared canvas. Each teammate draws in their own cursor color.' },
  { icon: '🤖', title: 'Judge', body: 'An AI judge scores how close each drawing is: layout, shapes, colors, key details. Not how pretty!' },
  { icon: '🏆', title: 'Win', body: 'The closest drawing takes the round. First team to 5 points wins the match and climbs the ranks.' },
];

export function HowToPlay() {
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  return (
    <section className="paper p-4" aria-roledescription="carousel" aria-label="How to play">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">How to play</h2>
        <div className="flex gap-1.5">
          {SLIDES.map((s, idx) => (
            <button
              key={s.title}
              type="button"
              onClick={() => setI(idx)}
              className={`h-3 w-3 rounded-full border-2 border-ink ${idx === i ? 'bg-coral' : 'bg-paperdim'}`}
              aria-label={`Show step ${idx + 1}: ${s.title}`}
              aria-current={idx === i}
            />
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="mt-3 flex min-h-[92px] items-start gap-3" aria-live="polite">
          <span className="text-4xl" aria-hidden>
            {slide.icon}
          </span>
          <div>
            <h3 className="font-display text-lg">
              {i + 1}. {slide.title}
            </h3>
            <p className="text-sm font-bold">{slide.body}</p>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="btn-ghost !min-h-[44px] !px-3 text-sm" onClick={() => setI((i + SLIDES.length - 1) % SLIDES.length)} aria-label="Previous step">
          ←
        </button>
        <button type="button" className="btn-ghost !min-h-[44px] !px-3 text-sm" onClick={() => setI((i + 1) % SLIDES.length)} aria-label="Next step">
          →
        </button>
      </div>
    </section>
  );
}
