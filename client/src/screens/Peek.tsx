import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../audio/sfx';
import { CountdownBar } from '../components/Timers';
import { useCountdown, useSecondMarks } from '../lib/hooks';
import { scoreLine, sidesOf } from '../lib/sides';
import { useMatch } from '../store/match';

export function PeekScreen() {
  const { phaseEndsAt, rules, photoUrl, photoMirrored, round, score, suddenDeath, myTeam } = useMatch();
  const left = useCountdown(phaseEndsAt, 50);
  const total = rules?.peekMs ?? 5000;
  useSecondMarks(
    left,
    [2, 1],
    useCallback((m: number) => (m === 2 ? sfx.finalTick() : sfx.tick()), []),
  );

  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-4 px-3 py-4">
      <div className="flex w-full items-center justify-between font-display text-xl">
        <span>
          Round {round}
          {suddenDeath ? ' · SUDDEN DEATH' : ''}
        </span>
        <span>{scoreLine(score, sidesOf(rules), myTeam)}</span>
      </div>
      <motion.h1 className="heading text-4xl text-sun sm:text-5xl" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        {rules && !rules.thumbnailVisible ? 'MEMORISE IT!' : 'PEEK!'}
      </motion.h1>
      <motion.div className="paper w-full overflow-hidden p-2" initial={{ scale: 0.8, rotate: -2 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200 }}>
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-night2">
          {photoUrl ? (
            <img src={photoUrl} alt="Reference photo to recreate" className="h-full w-full select-none object-cover" draggable={false} />
          ) : (
            <div className="grid h-full place-items-center font-display text-2xl text-paper">Loading photo…</div>
          )}
          {photoMirrored && <span className="chip absolute left-3 top-3 bg-sun">🪞 Mirrored</span>}
        </div>
      </motion.div>
      <div className="w-full max-w-xl">
        <CountdownBar msLeft={left} totalMs={total} />
        <p className="mt-1 text-center font-extrabold">Drawing starts in {Math.ceil(left / 1000)}…</p>
      </div>
    </main>
  );
}
