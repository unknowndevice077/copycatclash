# Local 2v2 playtest checklist (4 browser tabs)

## Setup

1. `npm install && npm run dev`
2. Open four tabs, each with its own profile, so each tab is a separate player:
   - `http://localhost:5173/?profile=p1`
   - `http://localhost:5173/?profile=p2`
   - `http://localhost:5173/?profile=p3`
   - `http://localhost:5173/?profile=p4`
3. Give each tab a distinct name in the **Your name** box.

Tip: keep DevTools open on one tab. Server logs are JSON lines in the terminal, and `"msg":"score"` lines show each scoring call.

## 1. Matchmaking (queue)

- [ ] In all 4 tabs, pick **2v2 → Casual → Classic → PLAY**. Each tab shows the searching screen with a running timer, estimated wait and skill range. The home page counts update ("N searching").
- [ ] Within about 2 s the **MATCH FOUND** splash appears in all tabs, then auto-accepts.
- [ ] The **Team intro** shows 2 players per team with ranks, colored dots and ▲ / ● team icons.
- [ ] **Cancel** in the queue returns to Home, and the counts drop.

## 2. Party queue

- [ ] Tab p1: **Create party**, then **Copy invite link**. Open the link in tab p2: both show the party with p1 as leader.
- [ ] Party chat works, and the profanity filter masks a swear word.
- [ ] Only the leader can press PLAY. p2's button reads "Waiting for leader".
- [ ] p1 queues 2v2. p3 and p4 queue 2v2 solo. p1 and p2 end up on the **same** team.

## 3. Core round loop

- [ ] **PEEK:** the large photo plus a shrinking bar. A double tick sounds at 2 s left.
- [ ] The DevTools **Network** tab shows `/api/photo/<token>` only at PEEK, with `Cache-Control: no-store`. Reopening the same URL gives a 404 (one-time token).
- [ ] **DRAW:** teammates see each other's strokes live, plus a labeled teammate cursor. The opponent canvas is not visible.
- [ ] Tools work: 4 brush sizes, fill bucket, eraser (only removes **your own** strokes), undo/redo (Ctrl+Z / Ctrl+Shift+Z), and clear-mine.
- [ ] Eyedropper: select 💧 and tap the reference thumbnail. The color is picked.
- [ ] The reference thumbnail can be dragged and hidden (**T**).
- [ ] **SCORING:** judge robot plus drumroll. **SHOWDOWN:** reference, Team A and Team B, animated score bars, a one-line reason each, a winner glow, contribution chips, and a photo attribution footer.
- [ ] Mobile check: DevTools device toolbar at 360×740. The canvas is on top, with a swipeable palette and the toolbar below it. Everything is reachable, with no horizontal scroll.

## 4. Relay mode (custom room)

- [ ] p1: **Create room**, then set Mode preset **Relay**, Team size **2v2**, Relay turn **10s**. p2 to p4 join via `/room/<CODE>?profile=pN`, and use **Join A** / **Join B** to make 2 and 2. Host presses **START MATCH**.
- [ ] During DRAW, the banner reads "Your turn!" for the active player and "<name> is drawing · you are next" for the teammate.
- [ ] The inactive player's tools are disabled. If they draw anyway via the console (`socket.emit`), the server rejects it ("Wait for your relay turn!").
- [ ] Turns rotate every 10 s. Close the active player's tab: the turn passes to the teammate immediately.

## 5. Disconnect / reconnect

- [ ] Mid-DRAW, close tab p3 and reopen `/?profile=p3` within 45 s. The "Reconnecting…" overlay may flash, then the tab returns to the current phase with the correct remaining time, its team's canvas strokes, and the score.
- [ ] While p3 is away, teammates see "away" next to p3, and the round keeps going.
- [ ] Close **both** tabs of one team and wait more than 45 s. The other team wins by **forfeit** ("won by forfeit" on the results screen).
- [ ] Leave three matches in a row with **Lobby** mid-match. From the 3rd one, the player gets a queue-pause notice and PLAY reads "Queue paused".

## 6. AI-fallback switch

- [ ] With `ANTHROPIC_API_KEY` set, the showdown reasons read like the AI ("Nailed the …"), and the `score` logs show `"source":"ai"`.
- [ ] Simulate an outage:
      `curl -X POST localhost:3001/api/dev/ai-failure -H 'content-type: application/json' -d '{"enabled":true}'`
      (or restart with `SCORING_SIMULATE_AI_FAILURE=true`).
- [ ] The next round is scored with no stall. A banner notice appears ("scored by the pixel judge"), both scores carry the **≈ estimated** tag, and the Home page shows the "AI judge is taking a break" strip.
- [ ] Remove the key entirely: the server logs a warning at boot and every round uses the fallback.
- [ ] Turn simulation off (`{"enabled":false}`). New rounds go back to `"source":"ai"`.

## 7. Ghost match

- [ ] First create ghost recordings: play at least **three 1v1 rounds** as p1 against p2. Casual Classic is fine; draw something in each round, because recordings need a score above 5.
- [ ] Close all tabs except p3. Queue **1v1 Ranked** alone. After 20 s, **👻 Play vs Ghost** appears.
- [ ] Start it. The opponent is labeled "👻 <name>" with a Ghost chip. The blurred opponent preview shows the ghost drawing live, and the showdown shows the ghost's full drawing.
- [ ] Results say "vs Ghost (Elo ×0.5)", and the Elo change is about half of a normal match.

## 8. Results & progression

- [ ] The winning side gets confetti and a fanfare, and the losing side hears the lose sound. On a phone, vibration triggers on a round win or loss.
- [ ] The Elo delta counts up, the rank badge updates, and a rank-up banner appears if a division is crossed.
- [ ] The round gallery switches rounds, and the time-lapse replay plays and scrubs.
- [ ] **Rematch** shows votes (1/4…) and starts a new match once everyone votes. **Requeue** works for queue matches.
- [ ] **Share** opens the native share sheet, or downloads a PNG with the reference, both drawings, the scores and the logo.
- [ ] The Profile shows the match in its history with a thumbnail, and the leaderboard lists ranked players (all-time and weekly, with search).

## 9. Accessibility & settings

- [ ] Home, rooms and dialogs are fully keyboard-navigable, with a visible focus ring. Escape closes dialogs.
- [ ] A screen reader (NVDA / VoiceOver) announces phase changes ("Draw now!", scores).
- [ ] Settings: master volume and mute, brush sound, reduce motion (no confetti or shake), high contrast, and cosmetics locked by level.

## 10. Scoring sanity

- [ ] `npm run test:scoring` prints the score table and ends with "All scoring checks passed".
