import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TEAM_COLORS, type Attribution, type MatchPlayer, type TeamId, type TeamRoundResult } from '@ccc/shared';
import { sfx, vibrate } from '../audio/sfx';
import { TeamTag } from '../components/Badges';
import { AnimatedNumber } from '../components/Timers';
import { EmoteBar, EmoteFloats } from '../components/Social';
import { useMatch } from '../store/match';
import { useSettings } from '../store/settings';

export function AttributionLine({ a }: { a: Attribution }) {
  if (a.provider === 'upload') return <p className="text-xs font-bold opacity-80">Photo uploaded by the room host.</p>;
  return (
    <p className="text-xs font-bold opacity-80">
      “{a.title}”
      {a.author && (
        <>
          {' '}
          by{' '}
          {a.sourceUrl ? (
            <a href={a.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">
              {a.author}
            </a>
          ) : (
            a.author
          )}
        </>
      )}
      {a.provider === 'unsplash' && (
        <>
          {' '}
          on{' '}
          <a href="https://unsplash.com/?utm_source=copy_cat_clash&utm_medium=referral" target="_blank" rel="noreferrer noopener" className="underline">
            Unsplash
          </a>
        </>
      )}
      {' · '}
      {a.licenseUrl ? (
        <a href={a.licenseUrl} target="_blank" rel="noreferrer noopener" className="underline">
          {a.license}
        </a>
      ) : (
        a.license
      )}
    </p>
  );
}

function TeamPanel({ team, result, winner, delay, players }: { team: TeamId; result: TeamRoundResult; winner: boolean; delay: number; players: MatchPlayer[] }) {
  const c = TEAM_COLORS[team];
  return (
    <motion.figure
      className={`paper relative p-2 ${winner ? (team === 'A' ? 'shadow-glowA' : 'shadow-glowB') : ''}`}
      initial={{ opacity: 0, y: 60, rotate: team === 'A' ? -4 : 4 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ delay, type: 'spring', stiffness: 160, damping: 16 }}
    >
      <div className="mb-1 flex items-center justify-between">
        <TeamTag team={team} size="sm" />
        {winner && (
          <motion.span className="chip bg-sun" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: delay + 1.6 }}>
            👑 Winner
          </motion.span>
        )}
      </div>
      <img src={result.imageUrl} alt={`${c.name} drawing`} className="aspect-[4/3] w-full rounded-xl border-2 border-ink bg-white object-cover" />
      <figcaption className="mt-2 space-y-1">
        <div className="flex items-end justify-between">
          <span className="font-display text-4xl">
            <AnimatedNumber value={result.detail.score} decimals={0} duration={1.4} />
            <span className="text-lg">%</span>
          </span>
          {result.detail.estimated && <span className="chip bg-sun" title="Scored by the pixel fallback judge">≈ estimated</span>}
        </div>
        <div className="h-4 overflow-hidden rounded-full border-2 border-ink bg-paperdim" aria-hidden>
          <motion.div className={`pattern-${team} h-full`} style={{ backgroundColor: c.main }} initial={{ width: 0 }} animate={{ width: `${result.detail.score}%` }} transition={{ delay: delay + 0.2, duration: 1.4, ease: 'easeOut' }} />
        </div>
        <motion.p className="text-sm font-bold italic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 1.2 }}>
          “{result.detail.reason}”
        </motion.p>
        {result.contributions.length > 1 && (
          <ul className="flex flex-wrap gap-1 text-[11px] font-extrabold">
            {result.contributions.map((cb) => {
              const p = players.find((x) => x.id === cb.playerId);
              return (
                <li key={cb.playerId} className="chip" style={{ background: p?.labelColor ?? '#fff' }}>
                  {p?.name ?? 'Player'} {Math.round(cb.pct)}%
                </li>
              );
            })}
          </ul>
        )}
      </figcaption>
    </motion.figure>
  );
}

export function ShowdownScreen() {
  const { showdown, myTeam, players, emotes } = useMatch();
  const reduced = useSettings((s) => s.reducedMotion);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!showdown) return;
    const t = setTimeout(() => {
      if (showdown.winner === 'draw') sfx.pop();
      else if (myTeam && showdown.winner === myTeam) {
        sfx.roundWin();
        vibrate([80, 50, 120]);
        if (!reduced) setShake(true);
      } else if (myTeam) {
        sfx.roundLose();
        vibrate(250);
      }
    }, 1900);
    return () => clearTimeout(t);
  }, [showdown, myTeam, reduced]);

  if (!showdown) return null;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Player';
  const banner = showdown.winner === 'draw' ? 'DRAW! +1 each' : `${TEAM_COLORS[showdown.winner].name} takes it!`;

  return (
    <main className={`mx-auto flex min-h-full max-w-6xl flex-col gap-4 px-3 py-4 ${shake ? 'animate-shake' : ''}`} onAnimationEnd={() => setShake(false)}>
      <div className="flex items-center justify-between font-display text-xl">
        <span>Round {showdown.round} showdown</span>
        <span>
          {showdown.scoreAfter.A} – {showdown.scoreAfter.B}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <motion.figure className="paper p-2" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="mb-1 font-display">Reference{showdown.mirrored ? ' 🪞' : ''}</div>
          <img
            src={showdown.referenceUrl}
            alt={`Reference photo: ${showdown.attribution.title}`}
            className="aspect-[4/3] w-full rounded-xl border-2 border-ink object-cover"
            style={showdown.mirrored && showdown.referenceUrl.startsWith('http') ? { transform: 'scaleX(-1)' } : undefined}
          />
          <figcaption className="mt-2 font-display text-lg">{showdown.attribution.title}</figcaption>
        </motion.figure>
        <TeamPanel team="A" result={showdown.teams.A} winner={showdown.winner === 'A'} delay={0.4} players={players} />
        <TeamPanel team="B" result={showdown.teams.B} winner={showdown.winner === 'B'} delay={0.8} players={players} />
      </div>
      <motion.h2 className="heading text-center text-4xl text-sun sm:text-5xl" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 2, type: 'spring' }}>
        {banner}
      </motion.h2>
      <EmoteBar />
      <footer className="text-center">
        <AttributionLine a={showdown.attribution} />
      </footer>
      <EmoteFloats emotes={emotes} nameOf={nameOf} />
    </main>
  );
}
