/**
 * Free-for-all matches have up to five sides. The original score_a/score_b and ops_a/ops_b columns
 * stay for A and B; these JSON columns hold every side, keyed by team id.
 */
export const up = /* sql */ `
ALTER TABLE matches ADD COLUMN scores_json TEXT;
ALTER TABLE rounds ADD COLUMN teams_json TEXT;
`;
