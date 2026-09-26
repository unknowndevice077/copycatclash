import { useEffect, useRef, useState } from 'react';
import { CANVAS_H, CANVAS_W, applyFill, clearCanvas, drawStroke, type Ctx2D, type DrawOp, type ReplayData, type TeamId } from '@ccc/shared';
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

/** Scrubbable time-lapse of both team canvases for one round. */
export function ReplayPlayer({ matchId, round }: { matchId: string; round: number }) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const refs = { A: useRef<HTMLCanvasElement>(null), B: useRef<HTMLCanvasElement>(null) };

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
    for (const team of ['A', 'B'] as TeamId[]) {
      const c = refs[team].current;
      const ctx = c?.getContext('2d', { willReadFrequently: true });
      if (c && ctx) renderAt(ctx as unknown as Ctx2D, data.ops[team], t, c.width, c.height);
    }
    // refs are stable objects; re-render only on data/time change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, t]);

  if (!data) return <p className="p-4 text-center font-bold">Loading replay…</p>;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {(['A', 'B'] as TeamId[]).map((team) => (
          <canvas key={team} ref={refs[team]} width={CANVAS_W / 2} height={CANVAS_H / 2} className="w-full rounded-xl border-2 border-ink bg-white" aria-label={`Team ${team} time-lapse`} />
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
