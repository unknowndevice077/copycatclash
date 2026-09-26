import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MODE_PRESETS, TEAM_SIZES, type ProfileResponse } from '@ccc/shared';
import { Avatar, RankBadge } from '../components/Badges';
import { SettingsDialog } from '../components/Dialogs';
import { AVATAR_FRAMES, CURSOR_SKINS, SHOWDOWN_EFFECTS, BANNER_STYLES } from '../lib/cosmetics';
import { api } from '../net/api';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';

export function ProfileScreen() {
  const { id = '' } = useParams();
  const me = useSession((s) => s.player?.id);
  const frame = useSettings((s) => s.avatarFrame);
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState('');
  const [cosmeticsOpen, setCosmeticsOpen] = useState(false);

  useEffect(() => {
    setData(null);
    setError('');
    api
      .profile(id)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load profile'));
  }, [id]);

  if (error) return <main className="grid min-h-full place-items-center p-4 font-display text-2xl">{error}</main>;
  if (!data) return <main className="grid min-h-full place-items-center p-4 font-display text-2xl">Loading…</main>;
  const { player, history, best, totals } = data;
  const isMe = me === player.id;
  const level = player.level;
  const allCosmetics = [...CURSOR_SKINS, ...AVATAR_FRAMES, ...BANNER_STYLES, ...SHOWDOWN_EFFECTS];

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-3 py-4">
      <Link to="/" className="btn-dark text-base">
        ← Home
      </Link>
      <section className="paper flex flex-wrap items-center gap-4 p-5">
        <Avatar name={player.name} color="#ffd23f" size={80} frame={isMe ? frame : 'plain'} />
        <div className="flex-1">
          <h1 className="font-display text-4xl">{player.name}</h1>
          <p className="font-extrabold">
            Level {level} · {player.isGuest ? 'Guest' : `@${player.username}`} · 🔥 {player.dailyStreak}-day streak · ⚡ best win streak {player.bestWinStreak}
          </p>
          <div className="mt-2 h-3 max-w-sm overflow-hidden rounded-full border-2 border-ink bg-paperdim">
            <div className="h-full bg-mint" style={{ width: `${(player.xpIntoLevel / player.xpForNextLevel) * 100}%` }} />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm font-extrabold">
          <dt>Matches</dt>
          <dd>{totals.matches}</dd>
          <dt>Wins</dt>
          <dd>{totals.wins}</dd>
          <dt>Rounds won</dt>
          <dd>{totals.roundsWon}</dd>
          <dt>Avg score</dt>
          <dd>{totals.avgScore}%</dd>
        </dl>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {TEAM_SIZES.map((b) => {
          const r = player.ratings[b];
          return (
            <div key={b} className="paper p-4">
              <h2 className="font-display text-xl">{b}</h2>
              <RankBadge rank={r.rank} elo={r.elo} />
              <p className="mt-1 text-sm font-bold">
                {r.wins}W · {r.losses}L · {r.draws}D ({r.games} games)
              </p>
            </div>
          );
        })}
      </section>

      <section className="paper p-4">
        <h2 className="font-display text-xl">Best drawings</h2>
        {best.length === 0 ? (
          <p className="font-bold text-muted">No drawings yet.</p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {best.map((d) => (
              <figure key={`${d.matchId}-${d.round}`} className="rounded-xl border-2 border-ink bg-paperdim p-1.5">
                <div className="grid grid-cols-2 gap-1">
                  <img src={d.referenceUrl} alt={`Reference: ${d.photoTitle}`} className="aspect-[4/3] w-full rounded-md object-cover" loading="lazy" />
                  <img src={d.imageUrl} alt="Drawing" className="aspect-[4/3] w-full rounded-md bg-white object-cover" loading="lazy" />
                </div>
                <figcaption className="mt-1 flex justify-between text-xs font-extrabold">
                  <span className="truncate">{d.photoTitle}</span>
                  <span>{d.score}%</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <section className="paper p-4">
        <h2 className="font-display text-xl">Match history</h2>
        {history.length === 0 ? (
          <p className="font-bold text-muted">No matches yet.</p>
        ) : (
          <ul className="mt-2 divide-y-2 divide-ink/10">
            {history.map((h) => (
              <li key={h.matchId} className="flex items-center gap-3 py-2">
                {h.thumbnail ? <img src={h.thumbnail} alt="" className="h-12 w-16 rounded-md border-2 border-ink bg-white object-cover" loading="lazy" /> : <span className="h-12 w-16" />}
                <span className={`chip ${h.result === 'win' ? 'bg-mint' : h.result === 'loss' ? 'bg-coral text-paper' : 'bg-paperdim'}`}>{h.result.toUpperCase()}</span>
                <span className="flex-1 text-sm font-extrabold">
                  {MODE_PRESETS[h.mode].label} {Object.keys(h.score).length > 2 ? `free for all · you ${h.score[h.team] ?? 0}` : `${h.bucket} · ${h.score.A ?? 0}–${h.score.B ?? 0}`} {h.ghost ? '· 👻' : ''} {h.ranked ? '' : '· casual'}
                </span>
                {h.ranked && <span className={`font-display ${h.delta >= 0 ? 'text-mint' : 'text-coral'}`}>{h.delta >= 0 ? `+${h.delta}` : h.delta}</span>}
                <time className="hidden text-xs font-bold text-muted sm:block" dateTime={new Date(h.endedAt).toISOString()}>
                  {new Date(h.endedAt).toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isMe && (
        <section className="paper p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Cosmetics</h2>
            <button type="button" className="btn-primary text-base" onClick={() => setCosmeticsOpen(true)}>
              Customize
            </button>
          </div>
          <p className="font-bold">
            {allCosmetics.filter((c) => c.level <= level).length} of {allCosmetics.length} unlocked. Level up to unlock more.
          </p>
          <SettingsDialog open={cosmeticsOpen} onClose={() => setCosmeticsOpen(false)} />
        </section>
      )}
    </main>
  );
}
