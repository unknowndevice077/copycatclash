import { AnimatePresence, motion } from 'framer-motion';
import { useUi } from '../store/ui';

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className={`pointer-events-auto max-w-lg rounded-2xl border-3 border-ink px-4 py-2 text-left text-sm font-extrabold shadow-chunky-sm ${
              t.kind === 'error' ? 'bg-coral text-paper' : t.kind === 'warn' ? 'bg-sun text-ink' : 'bg-mint text-ink'
            }`}
            role={t.kind === 'error' ? 'alert' : 'status'}
          >
            {t.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function LiveAnnouncer() {
  const text = useUi((s) => s.announcement);
  return (
    <div className="sr-only-live" aria-live="assertive" aria-atomic="true">
      {text}
    </div>
  );
}

const CONN_COPY: Record<string, { title: string; body: string; retry: boolean }> = {
  reconnecting: { title: 'Reconnecting…', body: 'Hang tight — your match keeps going and you have 45 seconds to get back in.', retry: false },
  offline: { title: 'Disconnected', body: 'You are offline. Check your connection and try again.', retry: true },
  server_full: { title: 'Server full', body: 'Too many players right now. Please try again in a minute.', retry: true },
  too_many: { title: 'Too many tabs', body: 'Too many connections from your network. Close some tabs and retry.', retry: true },
  unauthorized: { title: 'Signing you back in…', body: 'Your session expired; restoring it now.', retry: false },
};

export function ConnectionOverlay() {
  const conn = useUi((s) => s.conn);
  const copy = CONN_COPY[conn];
  return (
    <AnimatePresence>
      {copy && (
        <motion.div className="fixed inset-0 z-[55] grid place-items-center bg-ink/75 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="alertdialog" aria-label={copy.title}>
          <div className="paper max-w-sm p-6 text-center">
            <div className="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-[6px] border-ink border-t-sun" aria-hidden />
            <h2 className="font-display text-2xl">{copy.title}</h2>
            <p className="mt-2 font-bold">{copy.body}</p>
            {copy.retry && (
              <button type="button" className="btn-primary mt-4" onClick={() => window.location.reload()}>
                Try again
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
