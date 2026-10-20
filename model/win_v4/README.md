# Win model v0.4: balanced positions, team-quality moves, recruits

Builds on v0.3 (see ../win_v3). Same pipeline (`prep.py` → `stage1.py` → `features.py` → `stage2.py` → `export.py`),
plus `recruits.py` (RSCI / 247Sports Composite / NBA draft links) and `freshmen.py` (2026-27 freshman projections).

What changed from v0.3
- **Position-relative box profile.** Box rates are also expressed relative to the player's position group
  (guards / forwards / bigs), and the box and BPM blocks get position-specific weights. A big's rebounds and
  blocks are compared to other bigs instead of to everyone.
- **Replacement level by position** (15th percentile of talent within the group: C −3.51, F −4.23, G −4.52 per 100).
  Wins added and the Win score measure value over a replacement player *at the same position*.
- **No senior decline.** Development is centered so Sr./Gr. sit at zero and clipped at zero: experience is never a penalty.
- **Bad-team context, not fatal.** `move_up` = moved × (destination team net − origin team net) and destination net
  for movers. Learned weights: offense +0.158, defense +0.063 per point of team-quality change. Players on bad
  teams keep most of their rating, and a move up is credited as a modest boost.
- **Recruit features.** 247 Composite score (z), log rank, ranked flag, with freshman / sophomore interactions.
  The rest of a player's career is driven by what he does in college.

Validation (2024-25 game-margin error, pts/game): v0.3 9.860 · +recruits 9.747 · +moves 9.747 · +position-relative 9.738 ·
**+position weights 9.726 (chosen)**. Test 2025-26: **10.11** (r .541) vs v0.3 10.21, last season's team 11.20, constant 12.64.

Recruits (`recruits.py`): 1,248 recruit rows (RSCI top 100 2016-25, 247 Composite top 100 2016-26), 1,029 linked to canonical ids;
476 of 486 college NBA draftees 2017-26 linked. Basketball-reference's 247 column is misaligned from 2020 on, so 247 values
come from 247sports.com composite pages.

Freshmen (`freshmen.py`): projected impact = −2.585 − 1.67·ln(rank) + 0.133·height (in); r = .45 against end-of-season talent
for ranked recruits. Output: data-src/rankings/freshmen-2026-27.json.

Files: `stage2_val4.json` (variant comparison), `stage2_final.json` (weights + test), `stage2_walk.json`, `win_v3_meta.json`
(export meta; name kept for import-win.mjs).
