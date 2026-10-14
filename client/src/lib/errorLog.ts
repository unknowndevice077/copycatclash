import { BUG_REPORT_LIMITS } from '@ccc/shared';

/** The last few errors this tab saw, attached to bug reports so they are easier to trace. */
const entries: string[] = [];

/** Query strings can carry tokens; never keep them. */
function clean(message: string): string {
  return message.replace(/\?[^\s)'"]*/g, '?…').replace(/\s+/g, ' ').trim();
}

export function noteError(message: string): void {
  const time = new Date().toISOString().slice(11, 19);
  entries.push(`${time} ${clean(message)}`.slice(0, BUG_REPORT_LIMITS.errorLengthMax));
  if (entries.length > BUG_REPORT_LIMITS.errorsMax) entries.shift();
}

export function recentErrors(): string[] {
  return [...entries];
}

export function installErrorLog(): void {
  window.addEventListener('error', (event) => {
    noteError(event.message || String(event.error ?? 'Unknown error'));
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    noteError(`Unhandled promise rejection: ${reason}`);
  });
}
