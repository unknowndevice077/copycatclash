import { getDb } from './db';
import { MatchesRepo } from './db/repos/matches';
import { GhostsRepo, LeaderboardRepo, ModerationRepo, PhotosRepo, ScoringLogRepo } from './db/repos/misc';
import { PlayersRepo } from './db/repos/players';
import { MatchRegistry } from './game/MatchRegistry';
import { Matchmaker } from './matchmaking/Matchmaker';
import type { QueueStore } from './matchmaking/QueueStore';
import { PhotoService } from './photos/photoService';
import { ScoringService } from './scoring/scoringService';
import { Moderation } from './social/moderation';
import { PartyManager } from './social/PartyManager';
import { RoomManager } from './social/RoomManager';
import { Presence } from './socket/presence';
import type { TypedServer } from './socket/types';

/** Wires every service together. One instance per process. */
export function createContext(io: TypedServer, store: QueueStore) {
  const db = getDb();
  const players = new PlayersRepo(db);
  const matches = new MatchesRepo(db);
  const ghosts = new GhostsRepo(db);
  const moderationRepo = new ModerationRepo(db);
  const leaderboard = new LeaderboardRepo(db);
  const photos = new PhotoService(new PhotosRepo(db));
  const scoring = new ScoringService(new ScoringLogRepo(db));
  const presence = new Presence(io);
  const moderation = new Moderation(moderationRepo, players, presence);

  // Late-bound so the registry can notify the room manager, which itself needs the registry.
  let rooms: RoomManager | null = null;
  const registry = new MatchRegistry({
    io,
    presence,
    photos,
    scoring,
    players,
    matches,
    ghosts,
    moderation: moderationRepo,
    onRageQuit: (pid, mid) => moderation.onRageQuit(pid, mid),
    onMatchClosed: (m) => rooms?.onMatchClosed(m.id),
    onMatchCreated: (m) => rooms?.onMatchCreated(m.roomCode, m.id),
  });
  rooms = new RoomManager(io, players, presence, registry, photos);
  const parties = new PartyManager(players, presence);
  const matchmaker = new Matchmaker({ store, registry, presence, players, ghosts });

  return { io, db, store, players, matches, ghosts, leaderboard, photos, scoring, presence, moderation, registry, rooms, parties, matchmaker };
}

export type AppContext = ReturnType<typeof createContext>;
