import { useEffect, useRef, useState } from 'react';
import { CANVAS_H, CANVAS_W, TEAM_COLORS, applyFill, clearCanvas, drawStroke, type Ctx2D, type DrawOp, type ReplayData, type TeamId } from '@ccc/shared';
import { api } from '../net/api';

function renderAt(ctx: Ctx2D, ops: DrawOp[], t: number, w: number, h: number): void {
  clearCanvas(ctx, w, h);
  const scale = w / CANVAS_W;
  for (const op of ops) {
    if (op.hidden) continue;
    if (op.kind === 'fill') {
      if (op.t <= t) applyFill(ctx, op, w, h, scale);
      continue;
    }
    let n = 0;
    while (n < op.times.length && op.times[n] <= t) n++;
    if (n > 0) drawStroke(ctx, { ...op, points: op.points.slice(0, n * 3) }, scale);
  }
}

/** Scrubbable time-lapse of every side's canvas for one round. `names` labels each canvas. */
export function ReplayPlayer({ matchId, round, names }: { matchId: string; round: number; names?: Partial<Record<TeamId, string>> }) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const refs = useRef(new Map<TeamId, HTMLCanvasElement>());

  useEffect(() => {
    setData(null);
    setT(0);
    setPlaying(true);
    api
      .replay(matchId, round)
      .then(setData)
      .catch(() => setData(null));
  }, [matchId, round]);

  useEffect(() => {
    if (!data || !playing) return;
    let frame = 0;
    let last = performance.now();
    const speed = data.drawMs / 6000; // Whole round replays in ~6 seconds.
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setT((prev) => {
        const next = prev + dt * speed;
        if (next >= data.drawMs) {
          setPlaying(false);
          return data.drawMs;
        }
        return next;
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [data, playing]);

  useEffect(() => {
    if (!data) return;
    for (const team of data.teamIds) {
      const c = refs.current.get(team);
      const ctx = c?.getContext('2d', { willReadFrequently: true });
      if (c && ctx) renderAt(ctx as unknown as Ctx2D, data.ops[team] ?? [], t, c.width, c.height);
    }
    // refs are stable objects; re-render only on data/time change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, t]);

  if (!data) return <p className="p-4 text-center font-bold">Loading replay…</p>;
  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${data.teamIds.length > 2 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
        {data.teamIds.map((team) => (
          <figure key={team} className="min-w-0">
            <canvas
              ref={(el) => {
                if (el) refs.current.set(team, el);
                else refs.current.delete(team);
              }}
              width={CANVAS_W / 2}
              height={CANVAS_H / 2}
              className="w-full rounded-xl border-2 border-ink bg-white"
              style={{ borderColor: TEAM_COLORS[team].main }}
              aria-label={`${names?.[team] ?? TEAM_COLORS[team].name} time-lapse`}
            />
            {names?.[team] && <figcaption className="truncate text-center text-xs font-extrabold">{names[team]}</figcaption>}
          </figure>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost !min-h-[44px] !px-3" onClick={() => (t >= data.drawMs ? (setT(0), setPlaying(true)) : setPlaying(!playing))} aria-label={playing ? 'Pause replay' : 'Play replay'}>
          {playing ? '⏸' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={data.drawMs}
          step={50}
          value={t}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          className="flex-1 accent-coral"
          aria-label="Scrub the time-lapse"
        />
        <span className="w-12 text-right font-display tabular-nums">{Math.round(t / 1000)}s</span>
      </div>
    </div>
  );
}
