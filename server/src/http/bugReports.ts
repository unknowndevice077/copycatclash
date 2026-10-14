import { randomBytes } from 'node:crypto';
import express, { type Request, type Response, type Router } from 'express';
import { BUG_REPORT_CATEGORY_LABELS, bugReportSchema, type BugReport } from '@ccc/shared';
import { log } from '../util/logger';

/**
 * In-game bug reports. The free hosting plan keeps no files between restarts, so a report is
 * never stored here: it is logged, then forwarded to a GitHub issue and/or a Discord channel,
 * whichever is configured (see README, "Bug reports").
 */
export interface BugReportOptions {
  game: string;
  githubRepo?: string;
  githubToken?: string;
  discordWebhook?: string;
  /** Browser origins allowed to post reports. Omit when the app's own CORS middleware covers /api. */
  allowedOrigins?: string[];
}

const PER_IP = { limit: 5, windowMs: 15 * 60_000 };
/** Overall cap, so a flood from many addresses can't burn the GitHub API quota. */
const GLOBAL = { limit: 60, windowMs: 60 * 60_000 };
const FORWARD_TIMEOUT_MS = 8_000;

class WindowCounter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly limit: number, private readonly windowMs: number) {}

  /** Records a hit; false once the key is over its limit for the current window. */
  take(key: string, now = Date.now()): boolean {
    if (this.hits.size > 10_000) this.prune(now);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

export function newReportId(): string {
  return `BR-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/** A fenced block that the text inside can't close early. */
function fenced(text: string, lang = 'text'): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}${lang}\n${text}\n${fence}`;
}

/** One line, no control characters, and no @ that GitHub or Discord would turn into a ping. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return cut.replace(/@/g, '@​');
}

function contextLines(report: BugReport): string {
  const c = report.context;
  const rows: [string, string | number | undefined][] = [
    ['page', c.path],
    ['room', c.roomCode],
    ['phase', c.phase],
    ['players', c.players],
    ['screen', c.viewport],
    ['language', c.language],
    ['browser', c.userAgent],
  ];
  return rows
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key.padEnd(9)}${String(value)}`)
    .join('\n');
}

export function issueTitle(game: string, report: BugReport): string {
  const label = BUG_REPORT_CATEGORY_LABELS[report.category];
  return `[${game}] ${label}: ${oneLine(report.description, 70)}`;
}

export function issueBody(game: string, id: string, report: BugReport, receivedAt: Date): string {
  const parts = [
    `**Game:** ${game}  `,
    `**Category:** ${BUG_REPORT_CATEGORY_LABELS[report.category]}  `,
    `**Report:** ${id}  `,
    `**Received:** ${receivedAt.toISOString()}`,
    '',
    '### What happened',
    fenced(report.description),
    '',
    '### Contact',
    report.contact ? fenced(report.contact) : '_Not given._',
    '',
    '### Context',
    fenced(contextLines(report)),
  ];
  if (report.context.errors.length > 0) {
    parts.push('', '### Recent errors in the browser', fenced(report.context.errors.join('\n')));
  }
  parts.push('', '<sub>Sent from the in-game bug report form.</sub>');
  return parts.join('\n');
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<globalThis.Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
  });
}

async function toGitHub(opts: BugReportOptions, id: string, report: BugReport, receivedAt: Date): Promise<string> {
  const url = `https://api.github.com/repos/${opts.githubRepo}/issues`;
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${opts.githubToken}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': `${opts.game}-bug-reports`,
  };
  const issue = { title: issueTitle(opts.game, report), body: issueBody(opts.game, id, report, receivedAt) };
  let res = await postJson(url, { ...issue, labels: ['bug report', report.category] }, headers);
  // A token without label permission (or a label GitHub refuses) still gets the issue filed.
  if (res.status === 422) res = await postJson(url, issue, headers);
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const created = (await res.json()) as { html_url?: string };
  return created.html_url ?? 'github';
}

async function toDiscord(opts: BugReportOptions, id: string, report: BugReport): Promise<string> {
  const c = report.context;
  const fields = [
    { name: 'Category', value: BUG_REPORT_CATEGORY_LABELS[report.category], inline: true },
    { name: 'Report', value: id, inline: true },
    c.roomCode ? { name: 'Room', value: oneLine(c.roomCode, 20), inline: true } : null,
    c.phase ? { name: 'Phase', value: oneLine(c.phase, 40), inline: true } : null,
    report.contact ? { name: 'Contact', value: oneLine(report.contact, 120), inline: true } : null,
    { name: 'Browser', value: oneLine(`${c.viewport} · ${c.userAgent}`, 1000) },
    c.errors.length ? { name: 'Recent errors', value: fenced(c.errors.join('\n').slice(0, 900)) } : null,
  ].filter(Boolean);
  const res = await postJson(opts.discordWebhook as string, {
    username: `${opts.game} bug reports`,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: issueTitle(opts.game, report).slice(0, 250),
        description: fenced(report.description.slice(0, 3800)),
        color: 0xe5484d,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  });
  if (!res.ok) throw new Error(`Discord answered ${res.status}`);
  return 'discord';
}

export function bugReportRoutes(opts: BugReportOptions): Router {
  const router = express.Router();
  const perIp = new WindowCounter(PER_IP.limit, PER_IP.windowMs);
  const global = new WindowCounter(GLOBAL.limit, GLOBAL.windowMs);
  const allowed = opts.allowedOrigins;

  if (allowed) {
    const anyOrigin = allowed.includes('*');
    router.use('/api/bug-report', (req, res, next) => {
      const origin = req.headers.origin;
      if (origin && (anyOrigin || allowed.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type');
      }
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
    });
  }

  router.post('/api/bug-report', express.json({ limit: '24kb' }), (req: Request, res: Response) => {
    const ip = req.ip ?? 'unknown';
    if (!perIp.take(ip) || !global.take('all')) {
      res.status(429).json({ ok: false, error: 'Too many reports from here. Please try again in a few minutes.' });
      return;
    }
    const parsed = bugReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Please describe the problem in at least a few words.' });
      return;
    }
    const report = parsed.data;
    const id = newReportId();
    if (report.website) {
      // Bot that filled the hidden field: pretend it worked and drop it.
      log.warn('bug report honeypot hit', { id });
      res.json({ ok: true, id });
      return;
    }

    const receivedAt = new Date();
    log.info('bug report', { id, category: report.category, room: report.context.roomCode, phase: report.context.phase });

    const targets: Promise<string>[] = [];
    if (opts.githubRepo && opts.githubToken) targets.push(toGitHub(opts, id, report, receivedAt));
    if (opts.discordWebhook) targets.push(toDiscord(opts, id, report));
    if (targets.length === 0) {
      // Nowhere to send it: keep the whole report in the server log instead.
      log.warn('bug report not forwarded (no GitHub or Discord configured)', { id, report });
      res.json({ ok: true, id });
      return;
    }

    void Promise.allSettled(targets).then((results) => {
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed.length === results.length) {
        log.error('bug report could not be forwarded', { id, reasons: failed.map((f) => String(f.reason)), report });
      } else {
        const sent = results.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled').map((r) => r.value);
        log.info('bug report forwarded', { id, to: sent, failed: failed.map((f) => String(f.reason)) });
      }
    });
    res.json({ ok: true, id });
  });

  return router;
}
