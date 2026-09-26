import { useEffect, useState } from 'react';
import { CANVAS_H, CANVAS_W, type MatchPlayer, type RelayState } from '@ccc/shared';
import { CURSOR_GLYPH } from '../../lib/cosmetics';
import { useCountdown } from '../../lib/hooks';
import { useMatch } from '../../store/match';

export function TeammateCursors({ meId, skin }: { meId: string; skin: string }) {
  const cursors = useMatch((s) => s.cursors);
  const players = useMatch((s) => s.players);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      {Object.entries(cursors).map(([pid, c]) => {
        if (pid === meId || Date.now() - c.at > 2500) return null;
        const p = players.find((x) => x.id === pid);
        if (!p) return null;
        return (
          <div key={pid} className="absolute transition-all duration-75 ease-linear" style={{ left: `${(c.x / CANVAS_W) * 100}%`, top: `${(c.y / CANVAS_H) * 100}%` }}>
            <span className="-ml-1.5 -mt-1.5 block text-base leading-none" style={{ color: p.labelColor, textShadow: '0 0 2px #140a2b' }}>
              {CURSOR_GLYPH[skin] ?? '●'}
            </span>
            <span className="ml-2 whitespace-nowrap rounded-md border-2 border-ink px-1.5 text-[11px] font-extrabold text-ink" style={{ background: p.labelColor }}>
              {p.name}
            </span>
          </div>
        );
      })}
    </>
  );
}

export function TeammateList({ players, meId, relay }: { players: MatchPlayer[]; meId: string; relay: RelayState | null }) {
  return (
    <ul className="paper space-y-1.5 p-3" aria-label="Your team">
      {players.map((p) => (
        <li key={p.id} className="flex items-center gap-2 text-sm font-extrabold">
          <span className="h-4 w-4 shrink-0 rounded-full border-2 border-ink" style={{ background: p.labelColor }} aria-hidden />
          <span className={`truncate ${p.connected ? '' : 'line-through opacity-50'}`}>
            {p.name}
            {p.id === meId ? ' (you)' : ''}
          </span>
          {!p.connected && <span className="chip bg-coral text-paper">away</span>}
          {relay?.activePlayerId === p.id && <span className="chip bg-sun">✍️ drawing</span>}
          {p.allowedColors && p.allowedColors.length < 10 && (
            <span className="ml-auto flex gap-0.5" aria-label={`${p.name}'s colors`}>
              {p.allowedColors.slice(0, 6).map((c) => (
                <span key={c} className="h-3 w-3 rounded-sm border border-ink" style={{ background: c }} />
              ))}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RelayBanner({ relay, meId, players }: { relay: RelayState; meId: string; players: MatchPlayer[] }) {
  const left = useCountdown(relay.turnEndsAt, 200);
  const mine = relay.activePlayerId === meId;
  const name = players.find((p) => p.id === relay.activePlayerId)?.name ?? 'Nobody';
  const order = relay.order.indexOf(meId);
  const active = relay.order.indexOf(relay.activePlayerId ?? '');
  const n = relay.order.length;
  const turnsUntilMine = order >= 0 && active >= 0 ? (order - active + n) % n : 0;
  return (
    <div className={`rounded-2xl border-3 border-ink px-3 py-1.5 text-center font-display shadow-chunky-sm ${mine ? 'animate-pulse bg-sun text-ink' : 'bg-night2 text-paper'}`} role="status">
      {mine ? `Your turn! ${Math.ceil(left / 1000)}s` : `${name} is drawing · ${Math.ceil(left / 1000)}s${turnsUntilMine > 1 ? ` · you're ${turnsUntilMine} turns away` : ' · you are next'}`}
    </div>
  );
}
