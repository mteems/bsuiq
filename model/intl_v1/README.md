# International incoming-player model, v1

**Goal.** Project an international prospect's first-season impact in D-I before he plays a minute. The target is Talent / 100 at the end of his first season (Overall model v1).

**Training set.**
- 1,295 players whose hometown is outside the U.S., in their first D-I season, 2017-18 to 2025-26.
- By region: Europe 610, Africa 215, Canada 210, Oceania 136, Americas 92, Asia 32.
- Weighted by minutes played, so tiny samples count less.

## What v1 adds: FIBA youth-event production

Every men's youth event on fiba.basketball from 2010 to 2026: EuroBasket U16/U18/U20 (Divisions A, B and C, plus the 2021 Challengers), the U17 and U19 World Cups, AmeriCup, AfroBasket, Asia Cup, Oceania, Centrobasket and the South American championships. That is 254 editions and about 36,000 player lines.

- **Matching.** Each player is matched by name and date of birth (name and birth year when we only know the year). Only events before his first D-I season count. 565 of the 1,295 have at least one event: 71% of Europeans, 20 to 40% elsewhere.
- **Production.** For each event, efficiency per 40 minutes is turned into a z-score within that event's field (players with 60+ minutes). So a U16 Division C star and a U18 Division A starter are each compared with the players they actually faced.
- **Level.** A bonus by tier is added to the z-score:
  - Division A or World Cup: +1.0
  - Continental (AmeriCup, AfroBasket, Asia Cup, Oceania): +0.1
  - Division B: 0
  - Sub-regional: −0.3
  - Division C: −0.6

  There is also +0.08 per year of age group, so U20 counts more than U16.
- **Features added:**
  - Had a FIBA event (yes/no)
  - Minutes-weighted average of the adjusted z-score
  - "Playing up": years younger than the age limit
  - Minutes per game in his biggest role

## Features kept from v0.1

- Age
- Height
- Position group
- Home region
- Class at entry: freshman, or older (pro / JUCO / post-grad)
- U.S. prep path
- RSCI / 247 recruiting rank

## Validation

Leave-one-season-out: each season is predicted by a model fit on the other seasons. Results are for players with 200+ minutes.

| Measure | v0.1 | v1 |
|---|---|---|
| Correlation (r), all internationals | .335 | **.426** |
| Average error (pts / 100) | 2.59 | **2.50** |
| Average error, "assume the international average" | 2.72 | 2.72 |
| Correlation (r), players with FIBA events (n = 325) | .27 | **.45** |

- **Europe:** r went from .23 to .43.
- **Africa and Canada:** small gains.
- **Oceania:** fell from .40 to .27. This is a small sample (85 players), so watch it.
- **Tier bonuses:** these were the only tuned settings. With no tier bonus at all, r is still .406.

**Signal check.** Talent in the first D-I season, by FIBA score (players with 200+ minutes):

| FIBA score | Players | Talent / 100 |
|---|---|---|
| Under 0 | 46 | −3.4 |
| 0 to 1 | 98 | −2.1 |
| 1 to 2 | 129 | −0.9 |
| 2 to 3 | 46 | +2.2 |
| 3 or more | 6 | +3.8 |

## What DraftExpress adds (next)

DraftExpress Gold player pages have two things this model doesn't use yet:
- Club and pro league stats by season.
- A "College Level" rating.

The account has a daily page-view cap, so it can't supply a historical training set in one pass. For now it is used for current prospects only, a few pages at a time.

## Files

| File | What it does |
|---|---|
| `intl_v1.py` | Features and cross-validation |
| `finalize_v1.py` | Final fit and the board's projections |
| `intl_model_v1.json` | Weights and test results |
| `fiba_editions.json` | The FIBA editions crawled |
| `intl_model.py`, `intl_model.json` | v0.1, kept for comparison |
