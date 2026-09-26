import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { GHOST_OFFER_AFTER_MS, MODE_PRESETS, type QueueStatus } from '@ccc/shared';
import { Logo } from '../components/Badges';
import { DoodleBackground } from '../components/Decor';
import { ChatBox, EmoteBar, EmoteFloats } from '../components/Social';
import { actions } from '../net/actions';
import { serverNow } from '../net/clock';
import { useLobby } from '../store/lobby';

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function QueueScreen({ status }: { status: QueueStatus }) {
  const [now, setNow] = useState(serverNow());
  const party = useLobby((s) => s.party);
  const chat = useLobby((s) => s.chat);
  const emotes = useLobby((s) => s.emotes);
  const [ghostBusy, setGhostBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, []);

  const waited = now - status.since;
  const nameOf = (id: string) => party?.members.find((m) => m.id === id)?.name ?? 'You';

  return (
    <main className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-4 py-8">
      <DoodleBackground />
      <div className="relative z-10 w-full max-w-lg space-y-5 text-center">
        <Logo size="sm" />
        <motion.div className="paper space-y-4 p-6" initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
          <h1 className="font-display text-3xl">Finding opponents…</h1>
          <p className="font-extrabold">
            {status.teamSize} · {status.ranked ? 'Ranked' : 'Casual'} · {status.mode ? MODE_PRESETS[status.mode].label : ''}
            {status.partySize > 1 ? ` · party of ${status.partySize}` : ''}
          </p>
          <div className="font-display text-6xl tabular-nums" role="timer" aria-label={`Searching for ${Math.floor(waited / 1000)} seconds`}>
            {fmt(waited)}
          </div>
          <div className="flex justify-center gap-3 text-sm font-extrabold">
            <span className="chip bg-paperdim">Est. wait {fmt(status.estimatedWaitMs)}</span>
            <span className="chip bg-paperdim">Skill range ±{status.eloWindow}</span>
          </div>
          <motion.div className="mx-auto h-3 w-48 overflow-hidden rounded-full border-2 border-ink bg-paperdim" aria-hidden>
            <motion.div className="h-full w-1/3 rounded-full bg-coral" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} />
          </motion.div>

          {status.ghostAvailable && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border-3 border-dashed border-ink bg-mint/40 p-3">
              <p className="font-extrabold">Queue is quiet. Race a recorded drawing from a real player near your rating?</p>
              <p className="text-xs font-bold">Clearly labeled as a Ghost · Elo changes are halved.</p>
              <button
                type="button"
                className="btn-volt mt-2"
                disabled={ghostBusy}
                onClick={async () => {
                  setGhostBusy(true);
                  await actions.playGhost();
                  setGhostBusy(false);
                }}
              >
                👻 Play vs Ghost
              </button>
            </motion.div>
          )}
          {!status.ghostAvailable && status.teamSize === '1v1' && waited < GHOST_OFFER_AFTER_MS && (
            <p className="text-xs font-bold text-muted">Ghost matches unlock after {Math.ceil((GHOST_OFFER_AFTER_MS - waited) / 1000)}s if no one shows up.</p>
          )}

          <button type="button" className="btn-ghost" onClick={() => void actions.leaveQueue()}>
            Cancel
          </button>
        </motion.div>
        <EmoteBar />
        {party && (
          <div className="h-48 text-left">
            <ChatBox messages={chat} channel="party" />
          </div>
        )}
      </div>
      <EmoteFloats emotes={emotes} nameOf={nameOf} />
    </main>
  );
}
