import { z } from 'zod';

/** What a player can file from the in-game "Report a bug" form. */
export const BUG_REPORT_CATEGORIES = ['bug', 'gameplay', 'display', 'connection', 'idea', 'other'] as const;
export type BugReportCategory = (typeof BUG_REPORT_CATEGORIES)[number];

export const BUG_REPORT_CATEGORY_LABELS: Record<BugReportCategory, string> = {
  bug: 'Something broke',
  gameplay: 'Rules or scoring',
  display: 'Looks wrong',
  connection: 'Lag or disconnects',
  idea: 'Idea',
  other: 'Something else',
};

export const BUG_REPORT_LIMITS = {
  descriptionMin: 10,
  descriptionMax: 2000,
  contactMax: 120,
  errorsMax: 8,
  errorLengthMax: 300,
} as const;

const text = (max: number) => z.string().trim().max(max);

/** Collected by the client automatically and shown to the player before sending. */
export const bugReportContextSchema = z.object({
  path: text(200),
  userAgent: text(400),
  viewport: text(20),
  language: text(20).optional(),
  roomCode: text(12).optional(),
  phase: text(40).optional(),
  players: z.number().int().min(0).max(100).optional(),
  errors: z.array(text(BUG_REPORT_LIMITS.errorLengthMax)).max(BUG_REPORT_LIMITS.errorsMax).default([]),
});

export const bugReportSchema = z.object({
  category: z.enum(BUG_REPORT_CATEGORIES),
  description: z.string().trim().min(BUG_REPORT_LIMITS.descriptionMin).max(BUG_REPORT_LIMITS.descriptionMax),
  /** Optional email or Discord handle, only if the player wants a reply. */
  contact: text(BUG_REPORT_LIMITS.contactMax).optional(),
  /** Honeypot: hidden from people, so anything here came from a bot. */
  website: z.string().max(200).optional(),
  context: bugReportContextSchema,
});

export type BugReportContext = z.infer<typeof bugReportContextSchema>;
export type BugReportInput = z.input<typeof bugReportSchema>;
export type BugReport = z.infer<typeof bugReportSchema>;
