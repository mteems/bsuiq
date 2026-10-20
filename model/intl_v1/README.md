# International incoming-player model, v0.1 (phase 1)

**Goal.** Project an international prospect's first-season impact in D-I before he plays a minute. The target is Talent / 100 at the end of his first season (Overall model v1).

**Training set.**
- 1,295 players whose hometown is outside the U.S., in their first D-I season, 2017-18 to 2025-26.
- By region: Europe 610, Africa 215, Canada 210, Oceania 136, Americas 92, Asia 32.
- Weighted by minutes played, so tiny samples count less.

**Features** (everything we can know before he arrives, from our own data):
- Age
- Height
- Position group
- Home region
- Class at entry: freshman, or older (pro / JUCO / post-grad)
- Whether he came through a U.S. prep school
- RSCI / 247 recruiting rank, if any

**Validation.** Leave-one-season-out: each season is predicted by a model fit on the other seasons.

| Measure | Result |
|---|---|
| Correlation (r) with actual first-year Talent, players with 200+ minutes | .34 |
| Average error, model | 2.59 |
| Average error, international average | 2.72 |
| Correlation (r) for the high school freshman model (ranked recruits), for comparison | .45 |

**What the weights say (per standard deviation):**
- Height: +0.77
- Being ranked: +0.90, and better rank helps more
- Age: +0.52. Older newcomers contribute more right away.
- Guard: +0.27
- U.S. prep path: −0.22
- Region effects: small

**What's missing.** This is the part EvanMiya's new model (Oct 2026) says matters most:
- **Box-score production abroad**, translated by league strength. A player logging 10 minutes in the EuroLeague is typically better than one scoring 25 a game in France's second tier.
- **Level of competition.** A global team and league strength scale (domestic league, European cups, how players' production changes when they move clubs).
- **A "prospect signal".** How young a player was when he first had success against senior or international competition.
- **FIBA youth event stats.**

**Next steps:**
1. Attach FIBA youth-event box scores to the 1,295 training players. The International-board workflow already pulls FIBA tables.
2. Add pro and club league production with a league-strength factor (RealGM / Proballers / Eurobasket).
3. Add an age-at-first-senior-minutes feature.
4. Refit and re-test with the same leave-one-season-out split.

Projections for the current board are in data-src/intl/board.json (`proj`).
