type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = (process.env.LOG_LEVEL as Level | undefined) ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

type Fields = Record<string, unknown>;

function emit(level: Level, msg: string, fields?: Fields): void {
  if (ORDER[level] < ORDER[minLevel]) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Fields) => emit('debug', msg, fields),
  info: (msg: string, fields?: Fields) => emit('info', msg, fields),
  warn: (msg: string, fields?: Fields) => emit('warn', msg, fields),
  error: (msg: string, fields?: Fields) => emit('error', msg, fields),
};

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
