import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MODE_PRESETS, TEAM_COLORS, rankOrder, type TeamId } from '@ccc/shared';
import { sfx, vibrate } from '../audio/sfx';
import { ReplayPlayer } from '../canvas/ReplayPlayer';
import { Avatar, RankBadge, TeamTag } from '../components/Badges';
import { Confetti } from '../components/Confetti';
import { AnimatedNumber } from '../components/Timers';
import { ChatBox, EmoteBar, EmoteFloats, ReportButton } from '../components/Social';
import { buildShareImage, shareOrDownload } from '../lib/share';
import { isFfa, scoreLine, sideName, sidesOf } from '../lib/sides';
import { actions } from '../net/actions';
import { useMatch } from '../store/match';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { AttributionLine } from './Showdown';

const BANNER_CLASS: Record<string, string> = {
  classic: 'heading',
  comic: 'heading -rotate-3 rounded-3xl border-4 border-ink bg-paper px-6 py-2 !text-ink shadow-chunky-lg',
  graffiti: 'heading skew-x-[-8deg] tracking-widest [text-shadow:4px_4px_0_#9d4edd,8px_8px_0_#140a2b]',
};

export function ResultScreen() {
  const { result, players, myTeam, matchId, rules, rematchVotes, chat, emotes, showdown, closedReason } = useMatch();
  const me = useSession((s) => s.player?.id ?? '');
  const { bannerStyle, showdownEffect } = useSettings();
  const toast = useUi((s) => s.toast);
  const [selected, setSelected] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const [sharing, setSharing] = useState(false);

  const outcome = !result || !myTeam ? 'spectate' : result.winner === 'draw' ? 'draw' : result.winner === myTeam ? 'win' : 'loss';
  const myElo = result?.eloChanges[me];
  const rankedUp = myElo ? rankOrder(myElo.rankAfter) > rankOrder(myElo.rankBefore) : false;

  useEffect(() => {
    if (!result) return;
    if (outcome === 'win') {
      sfx.fanfare();
      vibrate([100, 60, 100, 60, 200]);
      setConfetti(Date.now());
    } else if (outcome === 'loss') {
      sfx.lose();
      vibrate(400);
    }
    if (rankedUp) setTimeout(() => sfx.rankUp(), 1600);
  }, [result, outcome, rankedUp]);

  if (!result || !matchId) return null;
  const rounds = [...result.rounds].sort((a, b) => a.round - b.round);
  const round = rounds[selected] ?? rounds[0];
  const mvp = players.find((p) => p.id === result.mvpPlayerId);
  const myXp = result.xp[me];
  const title = outcome === 'win' ? 'VICTORY!' : outcome === 'loss' ? 'DEFEAT' : outcome === 'draw' ? 'DRAW!' : 'MATCH OVER';
  const canRematch = closedReason === null && !rematchVotes.includes(me) && !!myTeam;
  const sides = sidesOf(rules);
  const ffa = isFfa(rules);
  const nameOf = (t: TeamId) => sideName(t, rules, players, myTeam);
  const names = Object.fromEntries(sides.map((t) => [t, nameOf(t)]));
  // Winner first (they may have won by forfeit with fewer rounds), then by rounds won.
  const standings = [...sides].sort((a, b) => Number(b === result.winner) - Number(a === result.winner) || result.finalScore[b] - result.finalScore[a]);

  const share = async () => {
    if (!round) return;
    setSharing(true);
    try {
      // Two drawings on the card: both teams, or (free-for-all) yours and the round's best other one.
      const mine = myTeam ?? sides[0];
      const rival = [...sides].filter((t) => t !== mine).sort((a, b) => (round.scores[b] ?? 0) - (round.scores[a] ?? 0))[0] ?? sides[1];
      const pair: [TeamId, TeamId] = sides.length === 2 ? [sides[0], sides[1]] : [mine, rival];
      const blob = await buildShareImage(round, scoreLine(result.finalScore, sides, myTeam), pair, names);
      const how = await shareOrDownload(blob);
      toast({ kind: 'info', code: 'share', message: how === 'shared' ? 'Shared!' : 'Image downloaded.' }, 2500);
    } catch {
      toast({ kind: 'error', code: 'share', message: 'Could not create the share image.' });
    } finally {
      setSharing(false);
    }
  };

  const requeue = async () => {
    const r = rules;
    await actions.leaveMatch();
    if (r && !r.custom) await actions.joinQueue(r.teamSize, r.mode, r.ranked);
  };

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-3 py-5">
      <Confetti fire={confetti} variant={showdownEffect} />
      <section className="text-center">
        <motion.h1
          className={`inline-block text-6xl sm:text-8xl ${BANNER_CLASS[bannerStyle] ?? 'heading'} ${outcome === 'win' ? 'text-sun' : outcome === 'loss' ? 'text-coral' : 'text-mint'}`}
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12 }}
        >
          {title}
        </motion.h1>
        {ffa ? (
          <ol className="mx-auto mt-3 flex max-w-2xl flex-wrap items-center justify-center gap-2 font-display text-xl">
            {standings.map((t, i) => (
              <li key={t} className="flex items-center gap-1.5">
                <span className="text-sun">{i + 1}.</span>
                <TeamTag team={t} size="sm" label={names[t]} />
                {result.finalScore[t]}
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-3 flex items-center justify-center gap-3 font-display text-3xl">
            <TeamTag team="A" />
            {result.finalScore.A} – {result.finalScore.B}
            <TeamTag team="B" />
          </div>
        )}
        <p className="mt-1 font-extrabold">
          {rules ? `${MODE_PRESETS[rules.mode].label} · ${ffa ? 'Free for all' : rules.teamSize}` : ''} {result.ranked ? '· Ranked' : '· Unranked'} {result.ghost ? '· vs Ghost (Elo ×0.5)' : ''}
          {result.forfeit ? ' · won by forfeit' : ''}
        </p>
      </section>

      <div className={`grid gap-4 ${ffa ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        <section className="paper space-y-2 p-4">
          <h2 className="font-display text-xl">Your progress</h2>
          {myElo && result.ranked ? (
            <>
              <div className="flex items-center gap-3">
                <RankBadge rank={myElo.rankAfter} elo={myElo.after} />
                <span className={`font-display text-3xl ${myElo.delta >= 0 ? 'text-mint' : 'text-coral'}`}>
                  <AnimatedNumber value={myElo.delta} prefix={myElo.delta >= 0 ? '+' : ''} duration={1.6} />
                </span>
              </div>
              {rankedUp && (
                <motion.p className="rounded-xl border-3 border-ink bg-sun px-3 py-1 text-center font-display text-lg" initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} transition={{ delay: 1.5 }}>
                  ⬆️ Rank up! {myElo.rankAfter.label}
                </motion.p>
              )}
            </>
          ) : (
            <p className="font-bold">No rating change for this match.</p>
          )}
          {myXp && (
            <p className="font-extrabold">
              +{myXp.gained} XP · Level {myXp.level} {myXp.leveledUp && <span className="chip bg-mint">Level up!</span>}
            </p>
          )}
        </section>

        {!ffa && (
        <section className="paper p-4">
          <h2 className="font-display text-xl">MVP</h2>
          {mvp ? (
            <div className="mt-2 flex items-center gap-3">
              <Avatar name={mvp.name} color={mvp.labelColor} size={56} ghost={mvp.isGhost} />
              <div>
                <div className="font-display text-2xl">{mvp.name} 🌟</div>
                <div className="text-sm font-bold">{Math.round(result.contributions[mvp.id] ?? 0)}% average contribution</div>
              </div>
            </div>
          ) : (
            <p className="font-bold">No MVP this time.</p>
          )}
        </section>
        )}

        <section className="paper p-4">
          <h2 className="font-display text-xl">{ffa ? 'Rounds won' : 'Contribution'}</h2>
          {ffa ? (
            <ul className="mt-2 space-y-1.5">
              {standings.map((t) => {
                const p = players.find((x) => x.team === t);
                const pct = (result.finalScore[t] / Math.max(1, ...sides.map((s) => result.finalScore[s]))) * 100;
                return (
                  <li key={t} className="flex items-center gap-2 text-sm font-extrabold">
                    <span className="w-5 text-center" aria-hidden>
                      {TEAM_COLORS[t].icon}
                    </span>
                    <span className="w-24 truncate">{names[t]}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-ink bg-paperdim">
                      <div className={`pattern-${t} h-full`} style={{ width: `${pct}%`, backgroundColor: TEAM_COLORS[t].main }} />
                    </div>
                    <span className="w-10 text-right">{result.finalScore[t]}</span>
                    {p && p.id !== me && !p.isGhost && <ReportButton playerId={p.id} name={p.name} />}
                  </li>
                );
              })}
            </ul>
          ) : (
          <ul className="mt-2 space-y-1.5">
            {sides.flatMap((t) =>
              players
                .filter((p) => p.team === t)
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm font-extrabold">
                    <span className="w-5 text-center" aria-hidden>
                      {TEAM_COLORS[t].icon}
                    </span>
                    <span className="w-24 truncate">{p.name}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-ink bg-paperdim">
                      <div className={`pattern-${t} h-full`} style={{ width: `${result.contributions[p.id] ?? 0}%`, backgroundColor: TEAM_COLORS[t].main }} />
                    </div>
                    <span className="w-10 text-right">{Math.round(result.contributions[p.id] ?? 0)}%</span>
                    {p.id !== me && !p.isGhost && <ReportButton playerId={p.id} name={p.name} />}
                  </li>
                )),
            )}
          </ul>
          )}
        </section>
      </div>

      <section className="paper space-y-3 p-4">
        <h2 className="font-display text-xl">Round gallery</h2>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Rounds">
          {rounds.map((r, i) => (
            <button
              key={r.round}
              type="button"
              role="tab"
              aria-selected={i === selected}
              onClick={() => setSelected(i)}
              className={`shrink-0 rounded-xl border-3 border-ink p-1 ${i === selected ? 'bg-sun' : 'bg-paperdim'}`}
            >
              <img src={r.images[myTeam ?? sides[0]] ?? r.referenceUrl} alt={`Round ${r.round}`} className="h-16 w-20 rounded-lg object-cover" />
              <span className="block text-xs font-extrabold">
                R{r.round} {r.winner === 'draw' ? '=' : TEAM_COLORS[r.winner].icon}
              </span>
            </button>
          ))}
        </div>
        {round && (
          <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
            <div>
              <img src={round.referenceUrl} alt={`Reference for round ${round.round}`} className="aspect-[4/3] w-full rounded-xl border-2 border-ink object-cover" />
              <p className="mt-1 font-display">{round.photoTitle}</p>
              <p className="text-sm font-extrabold">
                {sides
                  .filter((t) => round.scores[t] !== undefined)
                  .map((t) => `${ffa ? names[t] : t} ${Math.round(round.scores[t] ?? 0)}%`)
                  .join(' · ')}{' '}
                {round.estimated ? '· estimated' : ''}
              </p>
              {showdown && showdown.round === round.round && <AttributionLine a={showdown.attribution} />}
            </div>
            <ReplayPlayer matchId={matchId} round={round.round} names={ffa ? names : undefined} />
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" className="btn-primary" disabled={!canRematch} onClick={() => void actions.rematch()}>
          🔁 Rematch {rematchVotes.length > 0 ? `(${rematchVotes.length}/${players.filter((p) => !p.isGhost && p.connected).length})` : ''}
        </button>
        {rules && !rules.custom && (
          <button type="button" className="btn-volt" onClick={() => void requeue()}>
            ▶ Requeue
          </button>
        )}
        <button type="button" className="btn-coral" disabled={sharing} onClick={() => void share()}>
          📤 Share
        </button>
        <button type="button" className="btn-ghost" onClick={() => void actions.leaveMatch()}>
          🏠 Lobby
        </button>
      </section>
      <EmoteBar />
      <div className="mx-auto h-56 max-w-xl">
        <ChatBox messages={chat} channel="match" placeholder="GG! (post-match chat)" />
      </div>
      <EmoteFloats emotes={emotes} nameOf={(id) => players.find((p) => p.id === id)?.name ?? 'Player'} />
    </main>
  );
}
