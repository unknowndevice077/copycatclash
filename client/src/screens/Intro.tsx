import { motion } from 'framer-motion';
import { MODE_PRESETS, TEAM_COLORS, type MatchPlayer, type TeamId } from '@ccc/shared';
import { Avatar, RankBadge, TeamTag } from '../components/Badges';
import { CountdownBar } from '../components/Timers';
import { EmoteBar } from '../components/Social';
import { useCountdown } from '../lib/hooks';
import { useMatch } from '../store/match';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';

function PlayerCard({ p, me, delay }: { p: MatchPlayer; me: boolean; delay: number }) {
  const frame = useSettings((s) => s.avatarFrame);
  return (
    <motion.li
      className="paper flex items-center gap-3 p-3"
      initial={{ opacity: 0, x: p.team === 'A' ? -60 : 60 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, type: 'spring', stiffness: 220, damping: 18 }}
    >
      <Avatar name={p.name} color={p.labelColor} frame={me ? frame : 'plain'} ghost={p.isGhost} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-lg">
          {p.name} {me && <span className="chip bg-sun align-middle">You</span>} {p.isGhost && <span className="chip bg-mint align-middle">Ghost</span>}
        </div>
        <div className="flex items-center gap-2 text-xs font-extrabold">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-ink" style={{ background: p.labelColor }} aria-hidden />
          Lv {p.level}
        </div>
      </div>
      <RankBadge rank={p.rank} compact />
    </motion.li>
  );
}

function TeamColumn({ team }: { team: TeamId }) {
  const all = useMatch((s) => s.players);
  const players = all.filter((p) => p.team === team).sort((a, b) => a.slot - b.slot);
  const me = useSession((s) => s.player?.id);
  const myTeam = useMatch((s) => s.myTeam);
  return (
    <div className={`space-y-3 rounded-3xl p-3 ${myTeam === team ? 'bg-paper/10' : ''}`}>
      <div className="flex justify-center">
        <TeamTag team={team} size="lg" label={`${TEAM_COLORS[team].name}${myTeam === team ? ' (you)' : ''}`} />
      </div>
      <ul className="space-y-2">
        {players.map((p, i) => (
          <PlayerCard key={p.id} p={p} me={p.id === me} delay={0.15 + i * 0.12} />
        ))}
      </ul>
    </div>
  );
}

export function MatchFoundScreen() {
  const phaseEndsAt = useMatch((s) => s.phaseEndsAt);
  const rules = useMatch((s) => s.rules);
  const left = useCountdown(phaseEndsAt);
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 px-4 py-8">
      <motion.h1 className="heading text-center text-6xl text-sun sm:text-8xl" initial={{ scale: 3, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: -3, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
        MATCH FOUND!
      </motion.h1>
      {rules && (
        <p className="paper px-4 py-2 font-display text-xl">
          {MODE_PRESETS[rules.mode].label} · {rules.teamSize} · {rules.ranked ? 'Ranked' : rules.custom ? 'Custom' : 'Casual'}
          {rules.ghost ? ' · vs Ghost 👻' : ''}
        </p>
      )}
      <div className="w-full max-w-sm">
        <CountdownBar msLeft={left} totalMs={3000} />
        <p className="mt-2 text-center font-extrabold">Auto-accepting…</p>
      </div>
      <EmoteBar />
    </main>
  );
}

export function TeamIntroScreen() {
  const rules = useMatch((s) => s.rules);
  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col justify-center gap-4 px-3 py-6">
      <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
        <TeamColumn team="A" />
        <motion.div className="heading text-center text-7xl text-sun" initial={{ scale: 0, rotate: 180 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.4, type: 'spring' }}>
          VS
        </motion.div>
        <TeamColumn team="B" />
      </div>
      {rules && (
        <motion.p className="text-center font-extrabold" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
          First to {rules.roundsToWin} wins · {rules.peekMs / 1000}s peek · {rules.drawMs / 1000}s draw
          {rules.relay ? ` · relay turns of ${rules.relayTurnMs / 1000}s` : ''}
          {rules.colorLock ? ' · each teammate has their own colors' : ''}
          {rules.mirror ? ' · the photo is mirrored!' : ''}
          {!rules.thumbnailVisible ? ' · the photo disappears after the peek!' : ''}
        </motion.p>
      )}
      <EmoteBar />
    </main>
  );
}
