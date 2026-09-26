import { useEffect, useRef, useState } from 'react';
import { msUntil } from '../net/clock';

/** Remaining ms until a server timestamp, updated every animation frame (or `intervalMs`). */
export function useCountdown(serverTs: number, intervalMs = 100): number {
  const [left, setLeft] = useState(() => msUntil(serverTs));
  useEffect(() => {
    setLeft(msUntil(serverTs));
    const id = setInterval(() => setLeft(msUntil(serverTs)), intervalMs);
    return () => clearInterval(id);
  }, [serverTs, intervalMs]);
  return left;
}

/** Fires `fn` once each time the countdown crosses one of the given second marks. */
export function useSecondMarks(msLeft: number, marks: number[], fn: (mark: number) => void): void {
  const fired = useRef(new Set<number>());
  const last = useRef(msLeft);
  useEffect(() => {
    if (msLeft > last.current + 500) fired.current.clear();
    last.current = msLeft;
    for (const m of marks) {
      if (msLeft <= m * 1000 && msLeft > 0 && !fired.current.has(m)) {
        fired.current.add(m);
        fn(m);
      }
    }
  }, [msLeft, marks, fn]);
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
