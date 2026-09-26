import { useEffect, useRef, type ReactNode } from 'react';
import { CANVAS_H, CANVAS_W, ERASER_RADIUS, hitTestOps, type TeamId } from '@ccc/shared';
import { scratchSpeed, scratchStart, scratchStop } from '../audio/sfx';
import { getSocket } from '../net/socket';
import { CanvasRenderer } from './CanvasRenderer';
import { drawSession } from './drawSession';

export type Tool = 'brush' | 'fill' | 'eraser';

interface Props {
  team: TeamId;
  playerId: string;
  canDraw: boolean;
  tool: Tool;
  color: string;
  size: number;
  label: string;
  /** Rendered on top of the canvas, sized to it (teammate cursors etc.). */
  overlay?: ReactNode;
}

const FLUSH_MS = 30;
let counter = 0;
const newOpId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The shared team canvas: renders ops and turns pointer input into batched stroke events. */
export function DrawCanvas({ team, playerId, canDraw, tool, color, size, label, overlay }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const live = useRef({ tool, color, size, canDraw });
  live.current = { tool, color, size, canDraw };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const renderer = new CanvasRenderer(canvas, () => drawSession.get(team));
    rendererRef.current = renderer;

    const fit = () => {
      const box = wrap.getBoundingClientRect();
      const cssW = Math.min(box.width, (box.height * CANVAS_W) / CANVAS_H);
      const cssH = (cssW * CANVAS_H) / CANVAS_W;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(Math.round(cssW * dpr), Math.round(cssH * dpr));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();
    const unsub = drawSession.subscribe((t, kind) => {
      if (t !== team) return;
      if (kind === 'full') renderer.invalidate();
      else renderer.schedule();
    });
    return () => {
      ro.disconnect();
      unsub();
      renderer.dispose();
    };
  }, [team]);

  // ------------------------------------------------------------------ input
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let strokeId: string | null = null;
    let pending: number[] = [];
    let lastX = -1;
    let lastY = -1;
    let lastT = 0;
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    let lastCursor = 0;
    let erasing = false;
    const erasedIds = new Set<string>();

    const toLogical = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * CANVAS_W;
      const y = ((e.clientY - r.top) / r.height) * CANVAS_H;
      return [Math.max(0, Math.min(CANVAS_W, x)), Math.max(0, Math.min(CANVAS_H, y))];
    };
    const pressureOf = (e: PointerEvent) => (e.pointerType === 'pen' && e.pressure > 0 ? Math.round(e.pressure * 100) / 100 : 0.8);

    const flush = (done: boolean) => {
      if (!strokeId) return;
      const { color: c, size: s } = live.current;
      if (pending.length || done) {
        getSocket()?.emit('draw:stroke', { id: strokeId, color: c, size: s, points: pending, done });
        pending = [];
      }
      if (done) {
        strokeId = null;
        if (flushTimer) clearInterval(flushTimer);
        flushTimer = null;
      }
    };

    const addPoint = (x: number, y: number, p: number, force = false) => {
      if (!strokeId) return;
      if (!force && Math.hypot(x - lastX, y - lastY) < 1.5) return;
      const now = performance.now();
      scratchSpeed(Math.hypot(x - lastX, y - lastY) / Math.max(1, now - lastT));
      lastX = x;
      lastY = y;
      lastT = now;
      const pt = [Math.round(x * 10) / 10, Math.round(y * 10) / 10, p];
      pending.push(...pt);
      drawSession.localStrokeAppend(team, strokeId, pt, false);
      // Keep batches under the server's per-batch cap.
      if (pending.length >= 200 * 3) flush(false);
    };

    const eraseAt = (x: number, y: number) => {
      const ids = hitTestOps(drawSession.get(team), playerId, x, y, ERASER_RADIUS).filter((id) => !erasedIds.has(id));
      if (!ids.length) return;
      ids.forEach((id) => erasedIds.add(id));
      getSocket()?.emit('draw:erase', { ids });
    };

    const sendCursor = (x: number, y: number) => {
      const now = performance.now();
      if (now - lastCursor < 60) return;
      lastCursor = now;
      getSocket()?.emit('draw:cursor', { x, y });
    };

    const down = (e: PointerEvent) => {
      if (!live.current.canDraw || e.button > 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = toLogical(e);
      const { tool: t, color: c, size: s } = live.current;
      if (t === 'fill') {
        const op = { kind: 'fill' as const, id: newOpId(), playerId, color: c, x: Math.floor(Math.min(x, CANVAS_W - 1)), y: Math.floor(Math.min(y, CANVAS_H - 1)), t: 0, hidden: false };
        drawSession.localFill(team, op);
        getSocket()?.emit('draw:fill', { id: op.id, color: op.color, x: op.x, y: op.y });
        return;
      }
      if (t === 'eraser') {
        erasing = true;
        erasedIds.clear();
        eraseAt(x, y);
        return;
      }
      strokeId = newOpId();
      const p = pressureOf(e);
      lastX = x;
      lastY = y;
      lastT = performance.now();
      const first = [Math.round(x * 10) / 10, Math.round(y * 10) / 10, p];
      pending = [...first];
      drawSession.localStrokeBegin(team, { kind: 'stroke', id: strokeId, playerId, color: c, size: s, points: [...first], times: [0], done: false, hidden: false });
      flushTimer = setInterval(() => flush(false), FLUSH_MS);
      scratchStart();
    };

    const move = (e: PointerEvent) => {
      const [x, y] = toLogical(e);
      if (live.current.canDraw) sendCursor(x, y);
      if (erasing) {
        eraseAt(x, y);
        return;
      }
      if (!strokeId) return;
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      for (const ce of events.length ? events : [e]) {
        const [cx, cy] = toLogical(ce);
        addPoint(cx, cy, pressureOf(ce));
      }
    };

    const up = (e: PointerEvent) => {
      if (erasing) {
        erasing = false;
        return;
      }
      if (!strokeId) return;
      const [x, y] = toLogical(e);
      addPoint(x, y, pressureOf(e));
      const id = strokeId;
      drawSession.localStrokeAppend(team, id, [], true);
      flush(true);
      scratchStop();
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      if (flushTimer) clearInterval(flushTimer);
      scratchStop();
    };
  }, [team, playerId]);

  // A stroke in progress is finished if drawing gets disabled (relay turn over, time up).
  useEffect(() => {
    if (!canDraw) scratchStop();
  }, [canDraw]);

  const cursor = !canDraw ? 'not-allowed' : tool === 'fill' ? 'cell' : tool === 'eraser' ? 'grab' : 'crosshair';

  return (
    <div ref={wrapRef} className="relative flex h-full w-full items-start justify-center lg:items-center">
      <div className="relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className="block touch-none select-none rounded-2xl border-3 border-ink bg-white shadow-chunky"
          style={{ cursor }}
        />
        {overlay && <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">{overlay}</div>}
      </div>
    </div>
  );
}
