import { useState } from 'react';
import { create } from 'zustand';
import {
  BUG_REPORT_CATEGORIES,
  BUG_REPORT_CATEGORY_LABELS,
  BUG_REPORT_LIMITS,
  type BugReportCategory,
  type BugReportContext,
} from '@ccc/shared';
import { collectContext, sendBugReport } from '../lib/bugReport';
import { Modal } from './Modal';

interface BugReportState {
  open: boolean;
  context: BugReportContext | null;
  show: () => void;
  hide: () => void;
}

/** Context is captured when the form opens, so it describes the moment the player hit the bug. */
export const useBugReport = create<BugReportState>()((set) => ({
  open: false,
  context: null,
  show: () => set({ open: true, context: collectContext() }),
  hide: () => set({ open: false }),
}));

type Status = { kind: 'editing' } | { kind: 'sending' } | { kind: 'sent'; id: string } | { kind: 'failed'; error: string };

function contextSummary(context: BugReportContext): [string, string][] {
  const rows: [string, string | number | undefined][] = [
    ['Room', context.roomCode],
    ['Game phase', context.phase],
    ['Players', context.players],
    ['Screen', context.viewport],
    ['Browser', context.userAgent],
    ['Recent errors', context.errors.length ? `${context.errors.length}` : 'none'],
  ];
  return rows.filter((row): row is [string, string | number] => row[1] !== undefined).map(([k, v]) => [k, String(v)]);
}

export function BugReportDialog() {
  const { open, context, hide } = useBugReport();
  const [category, setCategory] = useState<BugReportCategory>('bug');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'editing' });

  const close = () => {
    hide();
    if (status.kind === 'sent') {
      setDescription('');
      setContact('');
      setCategory('bug');
      setStatus({ kind: 'editing' });
    }
  };

  const tooShort = description.trim().length < BUG_REPORT_LIMITS.descriptionMin;
  const submit = async () => {
    if (!context || tooShort || status.kind === 'sending') return;
    setStatus({ kind: 'sending' });
    const result = await sendBugReport({
      category,
      description: description.trim(),
      contact: contact.trim() || undefined,
      website: website || undefined,
      context,
    });
    setStatus(result.ok ? { kind: 'sent', id: result.id } : { kind: 'failed', error: result.error });
  };

  return (
    <Modal open={open} onClose={close} title={status.kind === 'sent' ? 'Thanks! 🐞' : 'Report a bug'}>
      {status.kind === 'sent' ? (
        <div className="space-y-4">
          <p className="font-bold">
            Your report is in. If you left a way to reach you, we may follow up. Reference: <strong className="font-display">{status.id}</strong>
          </p>
          <button type="button" className="btn-primary w-full" onClick={close}>
            Back to the game
          </button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset>
            <legend className="mb-2 font-extrabold">What kind of problem?</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Problem type">
              {BUG_REPORT_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  onClick={() => setCategory(c)}
                  className={`chip min-h-[40px] px-3 text-sm ${category === c ? 'bg-sun' : 'bg-paperdim'}`}
                >
                  {BUG_REPORT_CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="bug-description" className="font-extrabold">
              What happened?
            </label>
            <textarea
              id="bug-description"
              className="input mt-1 min-h-[120px] resize-y py-2"
              maxLength={BUG_REPORT_LIMITS.descriptionMax}
              placeholder="What were you doing, and what went wrong?"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
            />
            <p className="mt-1 text-right text-sm font-bold text-muted">
              {description.length}/{BUG_REPORT_LIMITS.descriptionMax}
            </p>
          </div>

          <div>
            <label htmlFor="bug-contact" className="font-extrabold">
              Email or Discord <span className="text-sm font-bold text-muted">(optional, only if you want a reply)</span>
            </label>
            <input
              id="bug-contact"
              className="input mt-1"
              maxLength={BUG_REPORT_LIMITS.contactMax}
              autoComplete="email"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
            />
          </div>

          {/* Honeypot: hidden from people and screen readers; bots tend to fill every field. */}
          <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
            <label htmlFor="bug-website">Website</label>
            <input id="bug-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>

          {context && (
            <details className="rounded-xl border-2 border-dashed border-ink/40 p-3 text-sm font-bold">
              <summary className="cursor-pointer">Also sent: room, game phase and browser details</summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {contextSummary(context).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted">{key}</dt>
                    <dd className="break-all">{value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          {status.kind === 'failed' && (
            <p role="alert" className="rounded-xl border-3 border-ink bg-coral p-3 font-bold text-paper">
              {status.error}
            </p>
          )}

          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={tooShort || status.kind === 'sending'}>
              {status.kind === 'sending' ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
