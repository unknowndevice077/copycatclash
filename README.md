# Copy Cat Clash

Real-time PvP drawing game. Both teams see the same reference photo, recreate it on a shared team canvas, and an AI judge scores which drawing is closer. First team to 5 round points wins.

- **1v1 / 2v2 / 3v3**, ranked (Classic) and casual queues, parties, custom rooms with spectators
- **Custom-room formats:** team battle (pick Team A or B, then share a canvas with your team) or **free for all** (up to 5 players, each drawing their own picture; the best score takes the round, and anyone within 2 points shares it)
- **Modes:** Classic, Speed, Memory, Relay, Color Lock, Mirror Match, Limited Palette
- **Scoring:** Claude vision judge (server-side only) with an automatic local pixel-comparison fallback
- **263 curated royalty-free photos** (Unsplash License) across 7 categories, with attribution
- Elo per team size, tiers and divisions, XP and levels, streaks, cosmetics, leaderboards, ghost opponents

## Quick start

Requires Node 20+ (tested on 22).

```bash
npm install
npm run dev
```

Open http://localhost:5173. The server runs on :3001, and Vite proxies `/api` and `/socket.io` to it.

The photo library ships in `server/photos/`. If it's missing, run `npm run photos:fetch`.

To enable the AI judge, copy `.env.example` to `server/.env` and set `ANTHROPIC_API_KEY`. Without a key, every round is scored by the pixel judge and marked "estimated".

### Playing on your local network (phones, tablets, other PCs)

1. `npm run build`, then `cd server && node dist/index.js`. This single server serves the game. `PORT` in `server/.env` sets the port.
2. On the host device, tap **📱 1v1 a friend**. The room screen shows a QR code and a 6-letter code.
   - When you open the game via `localhost`, the QR code automatically uses this PC's network address. The server finds it at `/api/network` and skips virtual adapters like WSL, Docker and VPNs.
3. The other device scans the QR code, or opens `http://<PC-LAN-IP>:<PORT>` and types the code in **Custom rooms**. The host presses **START MATCH**.

Requirements: all devices on the same Wi-Fi, the network marked **Private** in Windows, and Node allowed through Windows Firewall (Windows asks the first time).

Plain http works on a LAN. The server only forces https (`upgrade-insecure-requests`, HSTS) when `COOKIE_SECURE`/production is on. Copying to the clipboard and native sharing need https on most phones, so the game falls back to showing the link or downloading the image.

### Playing several players on one machine

Add `?profile=<name>` to the URL (for example `http://localhost:5173/?profile=p2`). Each profile gets its own guest identity in the same browser. See [PLAYTEST.md](PLAYTEST.md).

## Scripts (run from the repo root)

| Command | What it does |
|---|---|
| `npm run dev` | Server (tsx watch) and client (Vite) together |
| `npm run build` | Builds the client to `client/dist` and bundles the server to `server/dist` |
| `npm start` | Runs the production server. It also serves `client/dist`. |
| `npm run typecheck` | Strict TypeScript check of all three packages |
| `npm run db:migrate` | Applies SQLite migrations. They also run automatically on boot. |
| `npm run photos:fetch` | Downloads the curated starter library listed in `server/photos/sources.json` |
| `npm run photos:seed` | Rebuilds `server/photos/photos.json` from the files in `server/photos/library/` |
| `npm run photos:unsplash -- --per-category 20` | Pulls more photos from the Unsplash API (needs `UNSPLASH_ACCESS_KEY`) |
| `npm run test:scoring` | Runs the pixel judge on sample pairs and checks that good drawings beat bad ones |

## Environment variables

See `.env.example` for the full list. The important ones:

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Server-side only, never sent to the browser. If it's missing, the pixel judge is used. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Any vision-capable Claude model |
| `JWT_SECRET` | random per boot in dev | **Required in production.** Signs session tokens. |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated. Same-origin production doesn't need it. |
| `UNSPLASH_ACCESS_KEY` | none | Only for `PHOTO_PROVIDER=unsplash` or `photos:unsplash` |
| `PHOTO_PROVIDER` | `local` | `local` (curated library) or `unsplash` (live, falls back to local) |
| `TRUST_PROXY` | `false` | Set to `true` behind Render, Nginx and similar, so per-IP limits see real IPs |
| `REDIS_URL` | none | Shared queues plus the Socket.IO Redis adapter (see Scaling) |
| `DATA_DIR` | `./data` | SQLite database and archived round images |
| `SCORING_SIMULATE_AI_FAILURE` | `false` | Forces the fallback judge (for testing) |
| `BUG_REPORT_GITHUB_REPO` | none | `owner/repo` that receives in-game bug reports as issues (keep it private) |
| `BUG_REPORT_GITHUB_TOKEN` | none | Fine-grained token with Issues: read and write on that repo only |
| `BUG_REPORT_DISCORD_WEBHOOK` | none | Discord channel webhook for bug reports |

## Bug reports

Players can send a bug report from inside the game (⚙️ Settings, the 🐞 button in a room, and the match results screen). The form asks what happened, an optional email or Discord handle for a reply, and attaches the room code, game phase, player count, screen size, browser and the last few errors the page logged. Players see exactly what's attached before sending. No IP address is forwarded.

The free Render plan keeps no files between restarts, so reports aren't stored on the server. Each one is written to the server log and forwarded to whichever of these you configure:

- **GitHub issues:** set `BUG_REPORT_GITHUB_REPO` (`owner/repo`) and `BUG_REPORT_GITHUB_TOKEN`, a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with **Issues: Read and write** on that one repository. Use a **private** repo, since players may leave contact details. Issues are labelled `bug report` plus the category.
- **Discord:** set `BUG_REPORT_DISCORD_WEBHOOK` to a channel webhook URL (Channel settings → Integrations → Webhooks). Mentions are disabled.

With neither set, the full report is still in the server log. Limits: 5 reports per IP per 15 minutes and 60 per hour overall; a hidden honeypot field drops bot submissions.

## Deploy to Render

The repo includes a `render.yaml` Blueprint and a production `Dockerfile`. One web service serves the API, WebSockets and the client.

1. Push the repo to GitHub or GitLab.
2. In Render, go to **New → Blueprint** and pick the repo. Render reads `render.yaml` and creates:
   - a Docker web service with the health check at `/healthz`
   - a generated `JWT_SECRET`
3. When prompted, enter `ANTHROPIC_API_KEY`. `UNSPLASH_ACCESS_KEY` and `CORS_ORIGIN` are optional.
4. Deploy. The game is live at `https://<service-name>.onrender.com`.

Notes:

- **Plan:** the Blueprint uses the **free** plan (no card needed). Free services have no persistent disk, so players, ranks and history reset whenever the service restarts, redeploys or sleeps. It sleeps after about 15 minutes idle, and the first visit after that takes around a minute to wake it. For permanent data, set `plan: starter` and add a `disk:` (1 GB at `/app/server/data`).
- **Instances:** keep `numInstances: 1`. Live matches are held in memory (see Scaling).
- WebSockets work on Render out of the box. `TRUST_PROXY=true` is already set.

### Plain Docker

```bash
cp .env.example .env       # set JWT_SECRET (and ANTHROPIC_API_KEY)
docker compose up --build  # http://localhost:3001
```

## Adding photos

1. Put images in `server/photos/library/<category>/`. The categories are `animals`, `landscapes`, `food`, `buildings`, `objects`, `vehicles` and `abstract`.
2. Add a sidecar `<image>.json` next to each image:
   ```json
   { "title": "Red door", "difficulty": "easy", "author": "Jane Doe",
     "sourceUrl": "https://unsplash.com/photos/...", "license": "Unsplash License",
     "licenseUrl": "https://unsplash.com/license" }
   ```
3. Run `npm run photos:seed`, then restart the server.

Rules for photos: they must be royalty-free, have **no identifiable people**, and carry a license and attribution. Photos are normalized to 1024×768 (4:3) with metadata stripped when they're downloaded, and again when served.

Photo secrecy: the reference photo is only delivered during the PEEK phase, through a one-time, player-bound URL with `Cache-Control: no-store`. The library isn't publicly served. Round references become viewable only after that round has been scored.

## Tuning scoring

- **Rubric and prompt:** `server/src/scoring/rubricPrompt.ts`. It sets the weights (composition 40%, shapes 25%, color 25%, details 10%), the calibration anchors and the output format.
- **AI call:** `server/src/scoring/aiJudge.ts`. Both drawings are judged in one call with random X/Y labels, and the output must match a JSON schema validated by zod, with one retry. If that fails, it falls back to two single-drawing calls.
- **Service:** `server/src/scoring/scoringService.ts`. It handles blank detection (under 0.4% ink scores 0 with no API call), the result cache (keyed by photo + drawing hash), the 6 s deadline, concurrency and per-match/global rate limits, and a circuit breaker that switches everything to the pixel judge after repeated failures.
- **Pixel fallback:** `server/src/scoring/pixelJudge.ts`. At 64×64 it combines an HSV histogram (0.30), a Sobel edge IoU (0.25) and 8×8 grid color distance (0.45), stretched by `calibrate()`. Run `npm run test:scoring` after changing it.
- **Draw rule:** a score gap under 2 points is a draw, and both teams get +1. Set `SCORING_TIE_BREAK_BY_PIXELS=true` to break those draws by pixel score instead. A blank canvas never beats a real attempt.
- Every scoring call is logged (source, latency, score, error) to stdout and to the `scoring_log` table.

## Scaling horizontally

Queues go through the `QueueStore` interface (`server/src/matchmaking/QueueStore.ts`). Setting `REDIS_URL` switches from `MemoryQueueStore` to `RedisQueueStore` and turns on the Socket.IO Redis adapter. That's a config change, not a code change. The matchmaking tick takes a Redis lock, so only one instance forms matches at a time.

What stays per-instance: live `Match` objects, parties and custom rooms. To run more than one instance you also need:

1. Sticky sessions (any Socket.IO deployment needs these for the polling transport).
2. Routing match traffic to the instance that owns the match. You can pin players by hashing the match id, or forward events with `io.serverSideEmit`.

Until then, run one instance. A single Node process comfortably handles many concurrent matches, because drawing traffic is small batched point arrays.

## Architecture

```
shared/   Types, zod schemas, typed socket events, constants, ranks, rules, stroke renderer (used by both sides)
server/   Express + Socket.IO. Server-authoritative state machine, scoring, SQLite, photos
client/   React + Vite + Tailwind + Zustand + Framer Motion
```

Match flow: `MATCH_FOUND → TEAM_INTRO → [PEEK → DRAW → SCORING → SHOWDOWN]×N → MATCH_RESULT`. All timers live on the server, and clients render countdowns from server timestamps using a ping-based clock offset.

The server never trusts client pixels. Clients stream stroke batches (validated for draw window, bounds, size, relay turn and color lock), and the server renders the final PNG from its stored ops with node-canvas, using the same renderer code as the browser.

### Socket events

Every event and its payload type is in `shared/src/events.ts`.

- **Client → server:** `time:ping`, `queue:join|leave|ghost`, `party:create|join|leave`, `room:create|join|update|setTeam|start|leave|list`, `match:accept|resync|rematch|leave`, `draw:stroke|fill|erase|undo|redo|clear|cursor`, `emote`, `chat:send`, `report`
- **Server → client:** `session:ready|profile`, `lobby:stats`, `notice`, `queue:status`, `party:state`, `room:state`, `match:found|snapshot|phase|result|rematchVotes|closed|preview`, `round:peek|showdown`, `player:status`, `draw:stroke|fill|visibility|reject|cursor`, `relay:turn`, `emote`, `chat:message`

### Database

The SQLite schema is in `server/src/db/migrations/001_init.ts`. Tables: players, ratings, matches, match_players, rounds (with replay ops), ghosts, photos, player_photo_history, reports, rage_quits and scoring_log. Migrations are applied automatically on boot, or with `npm run db:migrate`.

## Photo credits

All starter photos come from [Unsplash](https://unsplash.com) under the [Unsplash License](https://unsplash.com/license) and are downloaded through the Lorem Picsum mirror. Each photo's photographer and source page are listed in `server/photos/sources.json` and credited in-game on the showdown screen.
