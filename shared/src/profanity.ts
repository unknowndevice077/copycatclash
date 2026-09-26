/**
 * Lightweight profanity filter shared by client (pre-check) and server (authoritative).
 * Normalises common leetspeak and separator tricks before matching.
 */
const BLOCKED_ROOTS = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'asshole', 'bastard', 'slut',
  'whore', 'fag', 'nigg', 'retard', 'rape', 'nazi', 'hitler', 'porn', 'penis', 'vagina',
  'wank', 'twat', 'bollock', 'kike', 'spic', 'chink', 'tranny', 'dyke', 'jizz', 'cum',
];

/** Words that contain a blocked root but are harmless. */
const ALLOWED_WORDS = ['cumulus', 'document', 'cucumber', 'scunthorpe', 'cockpit', 'peacock', 'hancock', 'dickens', 'grape', 'drape', 'therapist', 'shitake', 'shiitake', 'spice', 'spicy', 'accumulate', 'circumference'];

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't', '€': 'e',
};

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split('')
    .map((c) => LEET[c] ?? c)
    .join('');
}

function stripAllowed(text: string): string {
  let out = text;
  for (const w of ALLOWED_WORDS) out = out.split(w).join(' ');
  return out;
}

export function containsProfanity(text: string): boolean {
  const norm = stripAllowed(normalise(text));
  const squashed = norm.replace(/[^a-z]/g, '').replace(/(.)\1{2,}/g, '$1$1');
  return BLOCKED_ROOTS.some((root) => squashed.includes(root));
}

/** Replaces offending words with asterisks, keeping the rest of the message. */
export function censor(text: string): string {
  return text
    .split(/(\s+)/)
    .map((token) => (token.trim() && containsProfanity(token) ? '*'.repeat(Math.min(token.length, 8)) : token))
    .join('');
}
