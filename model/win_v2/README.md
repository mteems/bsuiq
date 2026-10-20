# Win model v0.2 (2025-26)

Builds on Possession Impact v0.1 (same SportsDataverse inputs, same possession audit: 655,330
possessions in 4,752 D-I games; same chronological train / validation / test split).

What changed from v0.1:
- Team effects (lightly shrunk) plus player deviations (heavily shrunk). A player's rating is his
  team's adjusted level split across the five on the floor, plus his own on-court evidence.
- Shrinkage chosen on validation game-margin error (the score is about game outcomes).
- A per-100 box-score prior was tested and left out: it made validation worse in a single season.

Held-out test (211 games from March 11, 2026; never used to choose anything):
| model | game-margin MAE |
|---|---|
| constant | 11.07 |
| v0.1 RAPM | 9.26 |
| team only | 8.76 |
| **v0.2** | **8.78** |

v0.2 ties team strength overall and beats it on possessions with unusual lineups
(2 or fewer of a team's 5 most-used players on the floor; see eval_unusual.txt), which is where
player-level information should matter.

Wins: points over replacement (15th-percentile impact among 200+ minute players) / points per win
(40.3, from the 2025-26 D-I schedule). Win score: rank in wins added mapped to the skill-score bell
scale (50 = average, 70 = top ~7%, 80+ = top ~1%), 200+ minutes.

Run: convert the parquet inputs to CSV with `node parquet-to-csv.mjs` (needs the `hyparquet`
package; Node 22.15+ for zstd), then `python3 win_v2.py` from a folder with `csv/`.
Load into the site: `node scripts/import-win.mjs <folder with win_v2/players.csv>`, then
`node scripts/build-search.mjs <site_export>` and `node scripts/build-data.mjs`.
