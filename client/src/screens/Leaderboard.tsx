import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TEAM_SIZES, type LeaderboardEntry, type TeamSize } from '@ccc/shared';
import { RankBadge } from '../components/Badges';
import { api } from '../net/api';
import { useSession } from '../store/session';

export function LeaderboardScreen() {
  const me = useSession((s) => s.player?.id);
  const [bucket, setBucket] = useState<TeamSize>('1v1');
  const [period, setPeriod] = useState<'all' | 'weekly'>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setRows(null);
    api
      .leaderboard(bucket, period, query)
      .then((r) => setRows(r.entries))
      .catch(() => setRows([]));
  }, [bucket, period, query]);

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-3 py-4">
      <div className="flex items-center justify-between">
        <Link to="/" className="btn-dark text-base">
          ← Home
        </Link>
        <h1 className="heading text-4xl text-sun">Leaderboard</h1>
      </div>
      <div className="paper flex flex-wrap items-center gap-2 p-3">
        <div className="flex gap-1.5" role="tablist" aria-label="Team size">
          {TEAM_SIZES.map((b) => (
            <button key={b} type="button" role="tab" aria-selected={bucket === b} className={`chip min-h-[44px] px-4 text-sm ${bucket === b ? 'bg-coral text-paper' : 'bg-paperdim'}`} onClick={() => setBucket(b)}>
              {b}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5" role="tablist" aria-label="Period">
          {(['all', 'weekly'] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={period === p} className={`chip min-h-[44px] px-4 text-sm ${period === p ? 'bg-sun' : 'bg-paperdim'}`} onClick={() => setPeriod(p)}>
              {p === 'all' ? 'All-time' : 'This week'}
            </button>
          ))}
        </div>
        <label htmlFor="lb-search" className="sr-only">
          Search players
        </label>
        <input id="lb-search" className="input ml-auto max-w-[220px]" placeholder="Search player…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <section className="paper overflow-hidden">
        {rows === null ? (
          <p className="p-6 text-center font-display text-xl">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center font-bold">No players found. Play a ranked match to get on the board!</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-ink font-display text-paper">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Rank</th>
                <th className="hidden px-3 py-2 sm:table-cell">W / G</th>
                <th className="px-3 py-2 text-right">{period === 'weekly' ? 'Week Δ' : 'Elo'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.playerId} className={`border-t-2 border-ink/10 font-extrabold ${r.playerId === me ? 'bg-sun/40' : ''}`}>
                  <td className="px-3 py-2">{r.position <= 3 ? ['🥇', '🥈', '🥉'][r.position - 1] : r.position}</td>
                  <td className="px-3 py-2">
                    <Link to={`/profile/${r.playerId}`} className="hover:underline">
                      {r.name}
                    </Link>{' '}
                    <span className="text-xs text-muted">Lv {r.level}</span>
                  </td>
                  <td className="px-3 py-2">
                    <RankBadge rank={r.rank} compact />
                  </td>
                  <td className="hidden px-3 py-2 sm:table-cell">
                    {r.wins} / {r.games}
                  </td>
                  <td className="px-3 py-2 text-right font-display">{period === 'weekly' ? `${r.weeklyDelta >= 0 ? '+' : ''}${r.weeklyDelta}` : r.elo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
