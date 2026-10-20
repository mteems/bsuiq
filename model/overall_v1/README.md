# Overall model v1

The Overall score answers one question: how much does this player help his team win per game? Two parts:

1. **Talent / 100.** Points per 100 possessions he adds compared with an average D-I rotation player. It blends two ratings, in the proportions that best predicted the next season's games:
   - **Win model Impact** (../win_v5). Box profile, BPM-type ratings, on-court results, recruiting, team context, last two seasons. About 91% of the blend.
   - **On-court model (this folder).** About 9% of the blend, built in three steps:
     - A box-score prior whose weights are learned directly from 4.7M D-I possessions (2016-17 to 2025-26). It includes the strength of the opponents he played and Barttorvik's ratings.
     - Ridge plus-minus centered on that prior, so his own lineup results move him off it.
     - His last three seasons blended, weighted by possessions with a decay of 0.5 per year.
2. **Value.** (Talent − replacement level at his position) × his share of team minutes. The Overall score is this value on the skill-score bell scale (50 = average, 80+ = top 1%), among 200+ minute players.

## Tests

All tests are out of sample. Last season's ratings and this season's real lineups predict this season's games. Three coefficients per rating are fit on 2019-21; the error is measured on 2022-26 (about 20,000 games).

| Rating | Game error (pts) | r |
|---|---|---|
| **Talent / 100 (blend)** | **9.895** | **.495** |
| Win model Impact (retrained on 2018-21 only, honest) | 9.915 | .492 |
| On-court model (multi-season) | 9.946 | .484 |
| On-court model (one season) | 10.018 | .474 |
| Barttorvik BPM | 10.057 | .468 |
| Team strength only | 10.347 | .424 |
| Old Overall (v0.5) | 10.363 | .410 |
| Old Win (v0.5) | 10.437 | .395 |
| Home edge only | 11.267 | — |

The blend's improvement over Impact alone is small but real: −0.020 pts, bootstrap 95% interval −0.024 to −0.016.

**Transfer test (`mover_test.py`).** Only players who changed teams get the candidate rating; everyone else gets one common rating. So the differences come from rating players in a new team context.
- Impact: 9.93
- On-court model: 9.96
- Old Overall: 10.00
- BPM: 10.04
- Team strength: 10.16

**Team credit.** Ratings that strip out team context (the old Overall and Win, and individual impact) under-credit transfers from good teams by about 0.07–0.08 per point of old-team net rating. Impact is calibrated: about 0.

**Bigs and reserves (`bias_test.py`).**
- **Bigs:** no rating here over-rates bigs. If anything they are slightly under-rated next season, by about +0.5 per big on the floor.
- **Reserves:** reserves' per-possession ratings are not inflated either.
- **Why bigs still don't dominate:** a per-possession list still leans big because bigs play fewer minutes. Value uses his actual share of minutes plus positional replacement, so the 2025-26 Overall top 100 is 49 guards, 34 forwards and 17 bigs (pool: 57/30/13).

**Draft check.** How well each rating separates players drafted that June (200+ minutes, 2017-2025, 417 draftees), as area under the curve:

| Rating | AUC |
|---|---|
| Overall v1 | **0.935** |
| Talent / 100 alone | 0.928 |
| Barttorvik BPM | 0.915 |
| On-court model alone | 0.905 |
| Old Overall | 0.890 |
| Old Win | 0.886 |

## Files

| File | What it does |
|---|---|
| `common.py` | Data loading |
| `sos.py` | Strength of schedule |
| `spm_accum.py` | Box prior normal equations |
| `rate.py` | Prior + lineup ridge per season |
| `test.py`, `score.py` | Feature-set search |
| `test2.py` | Multi-season decay |
| `honest_v05.py` | Retrains the Win model on 2018-21 for a fair comparison |
| `final_test.py` | Main comparison |
| `mover_test.py` | Transfer test |
| `bias_test.py` | Bigs and reserves bias checks |
| `publish.py` | Ratings for every season |

The final columns (value and score) were made in the session scratchpad and are imported with `scripts/import-overall.mjs`.
