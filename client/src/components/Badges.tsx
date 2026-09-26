import { TEAM_COLORS, TIER_COLORS, type RankInfo, type TeamId } from '@ccc/shared';
import { frameClass } from '../lib/cosmetics';

export function RankBadge({ rank, elo, compact = false }: { rank: RankInfo; elo?: number; compact?: boolean }) {
  const color = TIER_COLORS[rank.tier];
  return (
    <div className="inline-flex items-center gap-2" aria-label={`Rank ${rank.label}${elo !== undefined ? `, ${elo} Elo` : ''}`}>
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-3 border-ink font-display text-sm text-ink shadow-chunky-sm"
        style={{ background: color }}
        aria-hidden
      >
        {rank.tier[0]}
        {rank.division ? <sub className="text-[9px]">{rank.division}</sub> : null}
      </span>
      {!compact && (
        <div className="min-w-[96px]">
          <div className="font-display text-sm leading-none">{rank.label}</div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full border-2 border-ink bg-night2">
            <div className="h-full rounded-full" style={{ width: `${Math.round(rank.progress * 100)}%`, background: color }} />
          </div>
          {elo !== undefined && <div className="mt-0.5 text-[11px] font-bold opacity-80">{elo} Elo</div>}
        </div>
      )}
    </div>
  );
}

/** Team identity uses color + icon + pattern so it's readable without color vision. */
export function TeamTag({ team, label, size = 'md' }: { team: TeamId; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const c = TEAM_COLORS[team];
  const pad = size === 'lg' ? 'px-4 py-1.5 text-xl' : size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <span
      className={`pattern-${team} inline-flex max-w-full items-center gap-1.5 truncate rounded-full border-3 border-ink font-display shadow-chunky-sm ${pad}`}
      style={{ backgroundColor: c.main, color: c.text }}
    >
      <span aria-hidden>{c.icon}</span>
      {label ?? c.name}
    </span>
  );
}

export function Avatar({ name, color, frame = 'plain', size = 44, ghost = false }: { name: string; color: string; frame?: string; size?: number; ghost?: boolean }) {
  const initials = name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full border-3 border-ink font-display text-ink ${frameClass(frame)} ${ghost ? 'opacity-70' : ''}`}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      aria-hidden
    >
      {ghost ? '👻' : initials}
    </span>
  );
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-5xl sm:text-7xl' : size === 'sm' ? 'text-2xl' : 'text-4xl';
  return (
    <div className={`select-none font-display leading-[0.9] ${text}`} aria-label="Copy Cat Clash">
      <span className="outline-text inline-block -rotate-3 text-sun">Copy</span>{' '}
      <span className="outline-text inline-block rotate-2 text-coral">Cat</span>{' '}
      <span className="outline-text inline-block -rotate-1 text-volt">Clash</span>
    </div>
  );
}
