# Team model v2: 2026-27 team projections

**What it predicts:** each team's scoring margin per game against an average D-I team.

## The method

1. **Player impact.** Each player's projected impact per 100 possessions comes from the Win model, unchanged.
2. **Rotation order.** A minutes model, learned from 2018-26 rosters, predicts each player's share of the minutes. It uses:
   - projected impact compared with the team's top 8
   - rotation rank
   - last season's minutes, as a returner or a transfer
   - whether he's a freshman or has no D-I history

   Players are put in order by that prediction. Each spot then gets the average D-I minutes for it (32.6, 30.1, 27.5, ...).
3. **Team rating:**

       margin = −5.48 + 2.66 × (average impact by minutes) + 0.354 × (program margin, last 3 seasons) + 0.64 × (share of last season's minutes that return)

   It is centered so the average D-I team is 0.

## Backtest (`team_backtest.py`)

- **Rosters:** the players who actually played for each team.
- **Actual strength:** opponent-adjusted margin per game, fit on every D-I vs D-I game.
- **Walk-forward:** each season is predicted from coefficients fit only on earlier seasons.

**2020-21 to 2025-26:**

| Method | r with actual strength | Team miss (pts/game) | Game margin miss | Winner picked |
|---|---|---|---|---|
| v1: impact × minutes curve by impact | .857 | 3.87 | 9.88 | 68.3% |
| Last season's margin only | .796 | 4.54 | 10.24 | 66.8% |
| v1 + last season | .870 | 3.71 | 9.80 | 68.4% |
| Learned minutes only | .870 | 3.73 | 9.81 | 68.6% |
| **v2: model order + 3-yr program + returning (site)** | **.880** | **3.57** | **9.73** | 68.4% |
| v2 with learned minutes used directly | .882 | 3.56 | 9.72 | 68.6% |
| + star power, depth, experience, newcomer share | .884 | 3.55 | 9.71 | 68.7% |

**Minutes model accuracy** (2025-26, out of sample): r = .56 with each player's actual share of minutes. Ranking by impact alone gets r = .36.

**Season simulation** (Roster Builder outlook):
- A team's true level varies around its projection by sd 4.4 points per game. This is the model's miss.
- Game sd is 10.4 and home edge is 2.2, both fit on 2018-26 games.

**Caveats:**
- The Win model's player projections use weights fit on every season. The comparison between team methods is fair, but the absolute numbers are slightly optimistic.
- The backtest knows who actually played each year. A preseason roster includes players who end up redshirting or injured.

`export27.py` writes `data-src/team-model-2027.json` (coefficients, minutes model, each program's history). `scripts/build-proj27.mjs` applies it to every 2026-27 roster.
