import { z } from 'zod';
import {
  CANVAS_H,
  CANVAS_W,
  CHAT_MAX_LEN,
  DIFFICULTIES,
  EMOTES,
  GAME_MODES,
  NAME_LIMITS,
  PHOTO_CATEGORIES,
  PHOTO_THEMES,
  ROUNDS_TO_WIN_MAX,
  ROUNDS_TO_WIN_MIN,
  STROKE_LIMITS,
  TEAM_IDS,
  TEAM_SIZES,
} from './constants';

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);
const opId = z.string().regex(/^[A-Za-z0-9_-]{4,40}$/);
const roomCode = z.string().regex(/^[A-Z0-9]{6}$/);

export const displayNameSchema = z
  .string()
  .trim()
  .min(NAME_LIMITS.min)
  .max(NAME_LIMITS.max)
  .regex(/^[\p{L}\p{N} _.\-]+$/u, 'Letters, numbers, spaces, _ . - only');

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and _ only');

export const passwordSchema = z.string().min(8).max(128);

export const queueJoinSchema = z.object({
  teamSize: z.enum(TEAM_SIZES),
  mode: z.enum(GAME_MODES),
  ranked: z.boolean(),
});

export const partyJoinSchema = z.object({ code: roomCode });

export const strokeBatchSchema = z
  .object({
    id: opId,
    color: hexColor,
    size: z.number().int().min(STROKE_LIMITS.minSize).max(STROKE_LIMITS.maxSize),
    points: z
      .array(z.number().finite())
      .max(STROKE_LIMITS.maxPointsPerBatch * 3)
      .refine((p) => p.length % 3 === 0, 'points must be x,y,pressure triples'),
    done: z.boolean(),
  })
  .superRefine((batch, ctx) => {
    for (let i = 0; i < batch.points.length; i += 3) {
      const x = batch.points[i];
      const y = batch.points[i + 1];
      const p = batch.points[i + 2];
      if (x < 0 || x > CANVAS_W || y < 0 || y > CANVAS_H || p < 0 || p > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'point out of bounds' });
        return;
      }
    }
  });

export const fillSchema = z.object({
  id: opId,
  color: hexColor,
  x: z.number().int().min(0).max(CANVAS_W - 1),
  y: z.number().int().min(0).max(CANVAS_H - 1),
});

export const eraseSchema = z.object({ ids: z.array(opId).min(1).max(200) });

export const cursorSchema = z.object({
  x: z.number().min(0).max(CANVAS_W),
  y: z.number().min(0).max(CANVAS_H),
});

export const emoteSchema = z.object({ emote: z.enum(EMOTES.map((e) => e.id) as [string, ...string[]]) });

export const chatSendSchema = z.object({
  channel: z.enum(['party', 'match', 'room']),
  text: z.string().trim().min(1).max(CHAT_MAX_LEN),
});

export const reportSchema = z.object({
  playerId: z.string().min(1).max(64),
  reason: z.enum(['offensive_drawing', 'offensive_name', 'griefing', 'cheating', 'other']),
});

export const roomSettingsSchema = z.object({
  mode: z.enum(GAME_MODES),
  teamSize: z.enum(TEAM_SIZES),
  roundsToWin: z.number().int().min(ROUNDS_TO_WIN_MIN).max(ROUNDS_TO_WIN_MAX),
  peekSec: z.number().int().min(3).max(10),
  drawSec: z.number().int().min(20).max(90),
  themes: z.array(z.enum(PHOTO_THEMES)).min(1),
  categories: z.array(z.enum(PHOTO_CATEGORIES)).min(1),
  difficulties: z.array(z.enum(DIFFICULTIES)).min(1),
  thumbnailVisible: z.boolean(),
  memory: z.boolean(),
  relay: z.boolean(),
  relayTurnSec: z.number().int().min(10).max(30),
  colorLock: z.boolean(),
  mirror: z.boolean(),
  limitedPalette: z.boolean(),
  opponentPreview: z.boolean(),
  allowSpectators: z.boolean(),
  isPrivate: z.boolean(),
  useUploadedPhotos: z.boolean(),
});

export const roomJoinSchema = z.object({ code: roomCode, asSpectator: z.boolean() });
export const roomSetTeamSchema = z.object({ team: z.enum([...TEAM_IDS, 'spectator']) });
export const pingSchema = z.object({ clientTime: z.number().finite() });

export type QueueJoinInput = z.infer<typeof queueJoinSchema>;
export type StrokeBatchInput = z.infer<typeof strokeBatchSchema>;
export type FillInput = z.infer<typeof fillSchema>;
export type EraseInput = z.infer<typeof eraseSchema>;
export type CursorInput = z.infer<typeof cursorSchema>;
export type ChatSendInput = z.infer<typeof chatSendSchema>;
export type ReportInput = z.infer<typeof reportSchema>;
export type RoomSettingsInput = z.infer<typeof roomSettingsSchema>;
export type RoomJoinInput = z.infer<typeof roomJoinSchema>;
export type RoomSetTeamInput = z.infer<typeof roomSetTeamSchema>;
export type PartyJoinInput = z.infer<typeof partyJoinSchema>;
export type EmoteInput = z.infer<typeof emoteSchema>;
