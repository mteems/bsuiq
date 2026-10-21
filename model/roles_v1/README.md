# Role model v1: one position system for the whole site

## Roles

There are eight roles, plus a **Unicorn** tag. They roll up into two groupings:

| Role | Transfer Board lane | Group (Prep List, Targets, Recruit Map) | Depth-chart spot |
|---|---|---|---|
| Point guard | Point Guards | Guards | PG |
| Combo guard | Combo Guards | Guards | SG |
| Sniper | Combo Guards | Guards | SG |
| Wing | Wings | Wings | SF |
| Forward | Forwards | Forwards | PF |
| Stretch 4 | Forwards | Forwards | PF |
| Center | Bigs | Bigs | C |
| Stretch 5 | Bigs | Bigs | C |

## How roles are assigned

**D-I players** come from `roles_export.py`, which writes `data-src/roles-<season>.json`. It covers every player with 40+ minutes.

1. **Bigness score.** Each player gets a score built from:
   - height
   - weight (from ESPN; when missing, the typical weight for his height)
   - rebounding
   - blocks
   - rim attempts
   - minus three-point rate
   - minus assists
2. **Lineup spots.** In every lineup he played, on offense and defense, the five players are ranked from smallest to biggest by this score:
   - 1–2 are the guard spots
   - 3 is the wing
   - 4–5 are the frontcourt
   - 5 is the biggest player on the floor

   His role starts from the spot he played most.
3. **Frontcourt players (6'6"+).**
   - Biggest on the floor at least half the time:
     - **Center**
     - **Stretch 5** if 30%+ of his shots are threes (4+ 3PA per 100 possessions)
   - Otherwise:
     - **Forward**
     - **Stretch 4** if 38%+ of his shots are threes (5+ 3PA per 100)
4. **Everyone else, checked in this order:**
   1. **Sniper:** 55%+ of shots are threes, 7+ 3PA per 100, under 4.5 assists. Over 6'6" only if 75%+ of his shots are threes.
   2. **Point guard:** 6'6" or shorter. 6+ assists per 100, or 5+ at 6'4" and under when assists are 25%+ of his usage.
   3. **Combo guard:** under 6'4".
   4. **Forward or Stretch 4:** 6'10" and up (never a wing).
   5. **Wing:** everyone left. In practice that's 6'4"–6'9".
5. **Unicorn tag.** Given to a player whose skills are far outside his size, measured against what his height and weight predict:
   - **Bigs (6'8"+):** handling, threes and self-created shots, plus half credit for big-man production.
   - **Players 6'4" and under:** rebounding, blocks and rim finishing.

   He needs a score of 2.4+ (about 2.5 sd), 20%+ usage and 300+ minutes. In 2025-26 that's 16 players.

**No D-I minutes** (high school, international, new arrivals): the role comes from listed position and height. For internationals, the FIBA youth-event share of shots that are threes refines the call (Stretch 4, Stretch 5, Sniper). This is handled in `public/assets/roles.js`.

**Staff overrides** are stored in KV under `/api/roles`. An override beats the model. Unicorn can also be set or removed by hand.

## 2025-26 results (players with 300+ minutes)

| Role | Players |
|---|---|
| Wing | 685 |
| Center | 512 |
| Point guard | 467 |
| Combo guard | 365 |
| Sniper | 342 |
| Forward | 313 |
| Stretch 4 | 241 |
| Stretch 5 | 91 |

**Unicorns:**
- Boozer
- Dybantsa
- Jefferson
- Swain
- Avdalas
- Avila
- Mara
- Baba Miller
- Osei-Bonsu
- Stinson
- Bryce Harris
- Boone
- Myers
- Natt
- Bell
- Sabino

## Updating each season

Run from the session scratchpad's `sdv` folder:

    python3 roles_export.py <season end year>

Then rebuild the site data with `scripts/build-data.mjs`.
