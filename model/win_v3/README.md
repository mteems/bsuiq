# Win model v0.3: predictive player impact (10 seasons, 2016-17 to 2025-26)

Goal: rate players by what predicts winning next season, so the score finds difference makers
rather than just the best players on the best teams.

Pipeline (Python 3 + numpy/pandas/scipy; parquet inputs converted with ../win_v2/parquet-to-csv.mjs):
1. `prep.py` – SportsDataverse possessions for 10 seasons, the v0.1 audit per season (4.7M possessions
   kept), players keyed by the RStudio canonical id; player-season box totals.
2. `stage1.py` – per season, team effects + player deviations (Win v0.2 form): team level and each
   player's own on-court evidence.
3. `features.py` – for every player in season s, what was known before s: last season's box
   profile (per 100, shrunk), Barttorvik BPM / OBPM / DBPM / adjusted ratings / usage, stage-1 team and
   on-court parts (last two seasons), height, class, age. Career links the identity table missed are
   repaired with Barttorvik's player id.
4. `stage2.py` – learns the weights by predicting every possession of season s from the ten players'
   pre-season features (offense and defense separately). Variants chosen on 2024-25, then tested once on
   2025-26; `walk` repeats it season by season.
5. `export.py` – 2025-26 "Impact" (talent now: the model without its development terms), projected
   2026-27 impact (with development), wins added and the Win score.

Pre-season game-margin error (points per game), predicting each season from earlier seasons only:

| season | model | last season's team | constant |
|---|---|---|---|
| 2020-21 | 10.00 | 11.05 | 11.99 |
| 2021-22 | 9.33 | 11.19 | 11.54 |
| 2022-23 | 9.72 | 10.59 | 11.62 |
| 2023-24 | 9.73 | 11.18 | 12.14 |
| 2024-25 | 9.86 | 11.60 | 12.17 |
| 2025-26 (test) | 10.21 | 11.20 | 12.64 |

What predicts (validation on 2024-25): on-court plus-minus alone 10.20; + box profile 9.97;
+ Barttorvik ratings 9.88; + two-year history and class development 9.86.
