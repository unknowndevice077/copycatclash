import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CHAT_MAX_LEN, EMOTES, containsProfanity, type ChatMessage, type EmoteEvent, type ReportInput } from '@ccc/shared';
import { sfx } from '../audio/sfx';
import { actions } from '../net/actions';
import { Modal } from './Modal';

/** Quick emote wheel (6 emotes). Not rendered during drawing. */
export function EmoteBar({ disabled = false }: { disabled?: boolean }) {
  const [cool, setCool] = useState(false);
  const send = (id: (typeof EMOTES)[number]['id']) => {
    if (cool || disabled) return;
    actions.emote(id);
    sfx.pop();
    setCool(true);
    setTimeout(() => setCool(false), 900);
  };
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Emotes">
      {EMOTES.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => send(e.id)}
          disabled={cool || disabled}
          className="grid h-11 w-11 place-items-center rounded-full border-3 border-ink bg-paper text-xl shadow-chunky-sm transition hover:-translate-y-0.5 disabled:opacity-50"
          aria-label={`Send emote: ${e.label}`}
          title={e.label}
        >
          {e.glyph}
        </button>
      ))}
    </div>
  );
}

/** Floating emote bubbles for recent emotes. */
export function EmoteFloats({ emotes, nameOf }: { emotes: EmoteEvent[]; nameOf: (id: string) => string }) {
  const recent = emotes.filter((e) => Date.now() - e.at < 3500);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 700);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2" aria-live="polite">
      <AnimatePresence>
        {recent.map((e) => {
          const glyph = EMOTES.find((x) => x.id === e.emote)?.glyph ?? '❓';
          return (
            <motion.div
              key={`${e.playerId}-${e.at}`}
              initial={{ opacity: 0, y: 30, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30 }}
              className="paper flex items-center gap-2 px-3 py-1.5"
            >
              <span className="text-2xl">{glyph}</span>
              <span className="text-sm font-extrabold">{nameOf(e.playerId)}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function ChatBox({ messages, channel, placeholder = 'Say something nice…' }: { messages: ChatMessage[]; channel: 'party' | 'match' | 'room'; placeholder?: string }) {
  const [text, setText] = useState('');
  const [warn, setWarn] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const shown = messages.filter((m) => m.channel === channel);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [shown.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (containsProfanity(t)) setWarn('Keep it friendly — that will be filtered.');
    else setWarn('');
    const ok = await actions.chat(channel, t);
    if (ok !== null) setText('');
  };

  return (
    <div className="paper flex h-full min-h-[180px] flex-col p-3">
      <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto pr-1 text-sm" aria-live="polite" aria-label={`${channel} chat`}>
        {shown.length === 0 && <p className="text-muted">No messages yet.</p>}
        {shown.map((m) => (
          <p key={m.id}>
            <span className="font-extrabold">{m.fromName}:</span> <span className="break-words">{m.text}</span>
          </p>
        ))}
      </div>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <label className="sr-only" htmlFor={`chat-${channel}`}>
          Chat message
        </label>
        <input id={`chat-${channel}`} className="input !min-h-[40px] text-sm" maxLength={CHAT_MAX_LEN} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
        <button type="submit" className="btn-primary !px-3 text-base">
          Send
        </button>
      </form>
      {warn && <p className="mt-1 text-xs font-bold text-coral">{warn}</p>}
    </div>
  );
}

const REASONS: Array<{ id: ReportInput['reason']; label: string }> = [
  { id: 'offensive_drawing', label: 'Offensive drawing' },
  { id: 'offensive_name', label: 'Offensive name' },
  { id: 'griefing', label: 'Griefing / sabotage' },
  { id: 'cheating', label: 'Cheating' },
  { id: 'other', label: 'Something else' },
];

export function ReportButton({ playerId, name }: { playerId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="chip bg-paper text-ink hover:bg-paperdim" onClick={() => setOpen(true)} aria-label={`Report ${name}`}>
        ⚑ Report
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Report ${name}`}>
        <div className="grid gap-2">
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="btn-ghost justify-start"
              onClick={() => {
                void actions.report(playerId, r.id);
                setOpen(false);
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
