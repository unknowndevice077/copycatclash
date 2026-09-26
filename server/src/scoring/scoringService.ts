import { EventEmitter } from 'node:events';
import type { ScoreDetail, TeamId } from '@ccc/shared';
import { config } from '../config';
import type { ScoringLogRepo } from '../db/repos/misc';
import { toScoringJpeg } from '../photos/preprocess';
import { LruCache, MinuteWindow, Semaphore } from '../util/concurrency';
import { sha256 } from '../util/ids';
import { errMessage, log } from '../util/logger';
import { aiConfigured, isApiUnavailable, judgePair, judgeSingle, MalformedVerdictError, type Verdict } from './aiJudge';
import { pixelScore } from './pixelJudge';

/** Below this share of inked pixels a canvas counts as blank and scores 0 without calling the judge. */
const BLANK_COVERAGE = 0.004;

export interface DrawingInput {
  png: Buffer;
  coverage: number;
}

export interface ScoreRequest {
  matchId: string;
  round: number;
  photoId: string;
  mirrored: boolean;
  /** Normalised 1024x768 reference (already mirrored if needed). */
  reference: Buffer;
  /** One drawing per side taking part (two in team matches, up to five in a free-for-all). */
  drawings: Partial<Record<TeamId, DrawingInput>>;
}

export interface ScoreOutcome {
  details: Partial<Record<TeamId, ScoreDetail>>;
  usedFallback: boolean;
}

interface Prepared {
  team: TeamId;
  jpeg: Buffer;
  key: string;
  pixel: number;
}

export class ScoringService extends EventEmitter {
  private readonly cache = new LruCache<string, Verdict>(2000);
  private readonly semaphore = new Semaphore(config.ai.maxConcurrency);
  private readonly globalWindow = new MinuteWindow(config.ai.maxCallsPerMinute);
  private readonly perMatch = new Map<string, number>();
  private consecutiveFailures = 0;
  private degradedUntil = 0;
  private simulateFailure = config.ai.simulateFailure;

  constructor(private readonly logRepo: ScoringLogRepo) {
    super();
  }

  get aiDegraded(): boolean {
    return !aiConfigured() || this.simulateFailure || Date.now() < this.degradedUntil;
  }

  setSimulatedFailure(on: boolean): void {
    const before = this.aiDegraded;
    this.simulateFailure = on;
    if (before !== this.aiDegraded) this.emit('degraded', this.aiDegraded);
    log.warn('AI failure simulation toggled', { on });
  }

  releaseMatch(matchId: string): void {
    this.perMatch.delete(matchId);
  }

  async scoreRound(req: ScoreRequest): Promise<ScoreOutcome> {
    const refJpeg = await toScoringJpeg(req.reference);
    const result: Partial<Record<TeamId, ScoreDetail>> = {};
    const pending: Prepared[] = [];
    let usedFallback = false;

    for (const team of Object.keys(req.drawings) as TeamId[]) {
      const d = req.drawings[team];
      if (!d) continue;
      if (d.coverage < BLANK_COVERAGE) {
        result[team] = { score: 0, reason: 'The canvas was blank.', source: 'blank', estimated: false, pixelScore: 0 };
        this.record(req, team, 'blank', 0, 0, null);
        continue;
      }
      const jpeg = await toScoringJpeg(d.png);
      const pixel = (await pixelScore(refJpeg, jpeg)).score;
      const key = sha256(`${req.photoId}|${req.mirrored ? 'm' : 'n'}|${sha256(d.png)}`);
      const cached = this.cache.get(key);
      if (cached) {
        result[team] = { score: round1(cached.score), reason: cached.reason, source: 'ai', estimated: false, pixelScore: pixel };
        this.record(req, team, 'ai-cache', 0, cached.score, null);
      } else {
        pending.push({ team, jpeg, key, pixel });
      }
    }

    if (pending.length) {
      const verdicts = this.canUseAi(req.matchId) ? await this.runAi(req, refJpeg, pending) : null;
      for (const p of pending) {
        const v = verdicts?.[p.team];
        if (v) {
          this.cache.set(p.key, v);
          result[p.team] = { score: round1(v.score), reason: v.reason, source: 'ai', estimated: false, pixelScore: p.pixel };
        } else {
          usedFallback = true;
          result[p.team] = { score: p.pixel, reason: fallbackReason(p.pixel), source: 'fallback', estimated: true, pixelScore: p.pixel };
          this.record(req, p.team, 'fallback', 0, p.pixel, null);
        }
      }
    }
    return { details: result, usedFallback };
  }

  private canUseAi(matchId: string): boolean {
    if (this.aiDegraded) return false;
    const used = this.perMatch.get(matchId) ?? 0;
    if (used >= config.ai.maxCallsPerMatch) {
      log.warn('per-match AI budget exhausted', { matchId });
      return false;
    }
    if (!this.globalWindow.tryAcquire()) {
      log.warn('global AI rate limit reached; using fallback');
      return false;
    }
    this.perMatch.set(matchId, used + 1);
    return true;
  }

  /** Runs the AI judge under the concurrency limit and a hard deadline. Returns null on failure. */
  private async runAi(req: ScoreRequest, ref: Buffer, pending: Prepared[]): Promise<Partial<Record<TeamId, Verdict>> | null> {
    const controller = new AbortController();
    const deadline = Date.now() + config.ai.timeoutMs;
    const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
    const started = Date.now();
    try {
      const verdicts = await this.semaphore.run(async () => {
        if (Date.now() >= deadline) throw new Error('queued past deadline');
        if (pending.length === 2) {
          try {
            const pair = await judgePair(ref, pending[0].jpeg, pending[1].jpeg, controller.signal);
            // judgePair labels its first drawing A; map back to the real teams.
            return { [pending[0].team]: pair.A, [pending[1].team]: pair.B } as Partial<Record<TeamId, Verdict>>;
          } catch (err) {
            if (!(err instanceof MalformedVerdictError)) throw err;
            log.warn('pair judging malformed twice; falling back to separate calls', { matchId: req.matchId });
          }
        }
        const singles = await Promise.all(pending.map((p) => judgeSingle(ref, p.jpeg, controller.signal)));
        const out: Partial<Record<TeamId, Verdict>> = {};
        pending.forEach((p, i) => (out[p.team] = singles[i]));
        return out;
      });
      const latency = Date.now() - started;
      for (const p of pending) this.record(req, p.team, 'ai', latency, verdicts[p.team]?.score ?? null, null);
      this.onSuccess();
      return verdicts;
    } catch (err) {
      const latency = Date.now() - started;
      const message = controller.signal.aborted ? `timeout after ${config.ai.timeoutMs}ms` : errMessage(err);
      for (const p of pending) this.record(req, p.team, 'ai-error', latency, null, message);
      log.warn('AI judge failed; using pixel fallback', { matchId: req.matchId, round: req.round, error: message, apiDown: isApiUnavailable(err) });
      this.onFailure();
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= config.ai.failuresBeforeDegraded && Date.now() >= this.degradedUntil) {
      this.degradedUntil = Date.now() + config.ai.degradedCooldownMs;
      this.consecutiveFailures = 0;
      log.error('AI judge marked degraded; all scoring uses the pixel fallback', { cooldownMs: config.ai.degradedCooldownMs });
      this.emit('degraded', true);
      setTimeout(() => this.emit('degraded', this.aiDegraded), config.ai.degradedCooldownMs + 50).unref();
    }
  }

  private record(req: ScoreRequest, team: TeamId, source: string, latencyMs: number, score: number | null, error: string | null): void {
    log.info('score', { matchId: req.matchId, round: req.round, team, source, latencyMs, score, error });
    try {
      this.logRepo.insert({ matchId: req.matchId, round: req.round, team, source, latencyMs, score, error });
    } catch (err) {
      log.warn('failed to write scoring log', { error: errMessage(err) });
    }
  }
}

function round1(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;
}

function fallbackReason(score: number): string {
  if (score >= 70) return 'Layout and colors line up closely (estimated).';
  if (score >= 45) return 'Main colors and shapes are in the right areas (estimated).';
  if (score >= 20) return 'Some colors match, but the layout drifts (estimated).';
  return 'Little overlap with the photo’s colors and layout (estimated).';
}
