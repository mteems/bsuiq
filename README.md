# Bronco IQ 2.0

Private analytics site for Boise State MBB staff: roster, player pages and opponent scouting. Bronco IQ 2.0 is **standalone**. It shares no code, database or logins with the Recruiting Hub (`mteems/bsurecruit`) or the 1.0 site on chatgpt.site.

Built from the boisestate.ai handoff package (Oct 16, 2026): scouting v2, playmaking/defense v5, the shot profile prototype, and the design rules below.

## Phases

1. **Formatting (now).** Pages run on a small sample data set that ships as static JSON (`public/data/`). The goal is to get layout, colors and definitions right.
2. **Data migration (next).** Bronco IQ gets its own Cloudflare D1 database, loaded with the 10-season box score and play-by-play archive. The Worker serves the same JSON shapes from the database, so the pages don't change.
3. **Daily ingest.** A scheduled job adds new games during the season.

## Layout

| Path | What it is |
|---|---|
| `src/worker.js` | Staff sign-in, the ESPN game-log proxy (`/api/gamelog/espn-<id>`), static pages and data |
| `src/stats.js` | Derived stats and percentile math, shared by the data build and tests |
| `scripts/build-data.mjs` | `data-src/` → `public/data/` (run after changing sample data) |
| `data-src/` | Sample source data: roster + season totals, D-I percentile tables, per-shot charts |
| `public/index.html` | Home: the 2026-27 roster with percentile chips, plus the next opponents |
| `public/player.html` | Player page (`/player/<id>`): Overview, Shooting, Playmaking & Defense, Game log |
| `public/scouting.html` | Opponent scouting (handoff v2) |
| `public/assets/` | Design system (`app.css`), helpers (`core.js`), shot chart module (`shotchart.js`) |
| `public/modules/` | Hand-built deep dives embedded on player pages (Wheeler-Thomas Playmaking & Defense v5) |
| `test/` | `npm test` |

## Design rules (from the handoff, keep them)

- Orange (`#e2622a` / `#d4561f`) = good / high percentile. Blue (`#4a7fe0` / `#2f63d6`) = bad / low percentile.
- Shot charts: red/orange = hot or made, blue = cold or missed. The Frequency view uses the navy → red spectrum.
- UI selection states (tabs, segmented buttons) are neutral grey/white, never blue.
- Fonts are Inter Tight (UI) and IBM Plex Mono (labels, numbers). The style is charcoal "Command" with Dunks & Threes table density.
- Every stat label gets a hover definition (`data-def` → `DEF` in `public/assets/core.js`).
- No canvas and no heavy chart libraries (D3 v7 from the CDN only). No paid APIs.
- Percentile chips need 8+ games and 8+ MPG. 3P% chips need 40+ attempts and FT% chips need 30+ attempts.

## Deploy (Cloudflare Workers Builds)

One-time setup in the Cloudflare dashboard:

1. Go to **Workers & Pages → Create → Import a repository** and pick `mteems/bsuiq`.
2. Set **Project name** to `bronco-iq` and leave **Root directory** at `/`.
3. Set **Build command** to *(leave empty)* and **Deploy command** to `npx wrangler deploy`.
4. After the first deploy, go to the Worker's **Settings → Variables and secrets** and add two **secrets**:
   - `STAFF_PASSWORD`: the shared staff password
   - `SESSION_SECRET`: any long random string

   Until both exist, the site shows a setup notice instead of content.

After that, every push to `main` redeploys. Per-user accounts replace the shared password when the database arrives.

## Local checks

```bash
npm test                      # stat math + ESPN parser
node scripts/build-data.mjs   # rebuild public/data after editing data-src
npx wrangler dev              # needs STAFF_PASSWORD and SESSION_SECRET in .dev.vars
```
