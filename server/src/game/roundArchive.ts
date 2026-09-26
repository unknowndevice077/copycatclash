import fs from 'node:fs/promises';
import path from 'node:path';
import type { TeamId } from '@ccc/shared';
import { config } from '../config';
import { toThumbnail } from '../photos/preprocess';

function roundDir(matchId: string): string {
  return path.join(config.roundsDir, matchId.replace(/[^A-Za-z0-9_-]/g, ''));
}

export function roundFile(matchId: string, round: number, which: TeamId | 'ref'): string {
  return path.join(roundDir(matchId), which === 'ref' ? `${round}-ref.jpg` : `${round}-${which}.png`);
}

/** Persists the authoritative renders and a reference thumbnail for galleries, history and sharing. */
export async function archiveRound(matchId: string, round: number, reference: Buffer, drawings: Record<TeamId, Buffer>): Promise<void> {
  await fs.mkdir(roundDir(matchId), { recursive: true });
  await Promise.all([
    fs.writeFile(roundFile(matchId, round, 'ref'), await toThumbnail(reference, 768)),
    fs.writeFile(roundFile(matchId, round, 'A'), drawings.A),
    fs.writeFile(roundFile(matchId, round, 'B'), drawings.B),
  ]);
}
