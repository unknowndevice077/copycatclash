import { motion } from 'framer-motion';
import { useMatch } from '../store/match';

/** "Judge robot" with a sweeping magnifying glass while both drawings are scored. */
export function JudgingScreen() {
  const aiDegraded = useMatch((s) => s.aiDegraded);
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 px-4">
      <div className="relative h-56 w-56" aria-hidden>
        <motion.svg viewBox="0 0 200 200" className="h-full w-full" animate={{ y: [0, -8, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>
          <line x1="100" y1="18" x2="100" y2="40" stroke="#140a2b" strokeWidth="6" />
          <motion.circle cx="100" cy="14" r="9" fill="#ff5a5f" stroke="#140a2b" strokeWidth="4" animate={{ fill: ['#ff5a5f', '#ffd23f', '#ff5a5f'] }} transition={{ duration: 0.6, repeat: Infinity }} />
          <rect x="40" y="40" width="120" height="100" rx="24" fill="#b8c4d6" stroke="#140a2b" strokeWidth="6" />
          <rect x="58" y="62" width="84" height="46" rx="14" fill="#1b1036" stroke="#140a2b" strokeWidth="4" />
          <motion.circle cx="80" cy="85" r="8" fill="#3bceac" animate={{ scaleY: [1, 0.1, 1] }} transition={{ duration: 2, repeat: Infinity, times: [0, 0.05, 0.1] }} />
          <motion.circle cx="120" cy="85" r="8" fill="#3bceac" animate={{ scaleY: [1, 0.1, 1] }} transition={{ duration: 2, repeat: Infinity, times: [0, 0.05, 0.1] }} />
          <rect x="82" y="118" width="36" height="8" rx="4" fill="#140a2b" />
          <rect x="60" y="140" width="80" height="44" rx="12" fill="#9d4edd" stroke="#140a2b" strokeWidth="6" />
        </motion.svg>
        <motion.div className="absolute text-6xl" style={{ top: '45%', left: '55%' }} animate={{ x: [-90, 20, -90], rotate: [-15, 15, -15] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>
          🔍
        </motion.div>
      </div>
      <motion.h1 className="heading text-5xl text-sun" animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
        Judging…
      </motion.h1>
      <p className="font-extrabold">{aiDegraded ? 'The pixel judge is comparing colors and edges (estimated).' : 'The AI judge is comparing layout, shapes, colors and details.'}</p>
    </main>
  );
}
