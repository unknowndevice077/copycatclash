import { censor, containsProfanity, displayNameSchema } from '@ccc/shared';

const hex = (code: number): string => '\\u' + code.toString(16).padStart(4, '0');
const range = (from: number, to: number): string => `${hex(from)}-${hex(to)}`;

// Control chars, zero-width chars, line/paragraph separators and bidi overrides.
const INVISIBLE_CHARS = new RegExp(
  `[${range(0x00, 0x1f)}${range(0x7f, 0x9f)}${range(0x200b, 0x200f)}${range(0x2028, 0x202e)}${range(0x2066, 0x2069)}]`,
  'g',
);

/** Strips invisible characters and HTML-significant characters, collapses whitespace. */
export function cleanText(input: string, maxLen: number): string {
  return input
    .normalize('NFKC')
    .replace(INVISIBLE_CHARS, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

export function validateDisplayName(raw: string): NameCheck {
  const cleaned = cleanText(raw, 32);
  const parsed = displayNameSchema.safeParse(cleaned);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' };
  if (containsProfanity(parsed.data)) return { ok: false, error: 'Please pick a friendlier name' };
  return { ok: true, name: parsed.data };
}

export function cleanChat(raw: string, maxLen: number): string {
  return censor(cleanText(raw, maxLen));
}
