"""Test: do season t-1 ratings predict season t game margins, using the real season-t lineups?
For each rating, every possession gets x1 = sum(offense five) - sum(defense five) of the players'
t-1 ratings, x2 = (offense players with no rating) - (defense players with no rating). Summed to
games (home minus away). Three coefficients per rating (scale, no-rating value, home edge) are fit
on target seasons 2018-2021; scores are on 2022-2026 games, which nothing was tuned on."""
import numpy as np, pandas as pd, json, sys
from common import *
from rate import spm_weights, rate_season
B = load_box()
H = pd.read_csv('win_hist.csv')  # current (v0.5) Win / Overall / impact by season
import os
BASEFS = os.environ.get('FS', 'base') == 'base'
POST = (300, 1000, 3000); RAPM = (1000, 3000) if BASEFS else ()
rows = []; games = []
for t in range(2018, 2027):
    s = t - 1
    R = rate_season(B, s, spm_weights(exclude=(t,)), POST, RAPM)
    # center on the possession-weighted average player (sign conventions: d positive = good defense)
    for c in [c for c in R.columns if c.endswith(('_o', '_d')) or '_o_' in c or '_d_' in c]:
        R[c] -= np.average(R[c], weights=R.off_poss + R.def_poss)
    b = B[B.season == s].set_index('cid'); h = H[H.season == s].set_index('cid')
    V = {}
    V['spm'] = R.set_index('cid').eval('spm_o + spm_d')
    for l in POST: V[f'post_{l}'] = R.set_index('cid').eval(f'post_o_{l} + post_d_{l}')
    for l in RAPM: V[f'rapm_{l}'] = R.set_index('cid').eval(f'rapm_o_{l} + rapm_d_{l}')
    R.to_csv(OUT / f'rate_{FS}_{s}.csv', index=False)
    if BASEFS:
     V['torvik_bpm'] = b.bpm.dropna()
     V['team_only'] = (b.team_o + b.team_d).dropna()
     V['pts_per100'] = b.r_pts
     V['v05_overall'] = h.overall.dropna(); V['v05_win'] = h.win_score.dropna(); V['v05_ind'] = h.ind; V['v05_impact'] = h.now
    # same 200+ minute coverage for everyone (fair comparison of the numbers themselves)
    big = set(b.index[b.mins >= 200])
    for k in list(V):
        V[k + '|200'] = V[k][V[k].index.isin(big)]
    V = {f'{FS}:{k}' if (k.startswith('post') or k.startswith('spm')) else k: v for k, v in V.items()}
    O, D, y, hs, g = season_poss(t)
    ids, inv = np.unique(np.concatenate([O.ravel(), D.ravel()]), return_inverse=True)
    n = len(y); Oi = inv[:5 * n].reshape(n, 5); Di = inv[5 * n:].reshape(n, 5)
    G = pd.DataFrame({'g': g, 'hs': hs, 'y': (y - y.mean()) * hs})
    agg = {'M': G.groupby('g').y.sum(), 'P': G.groupby('g').size(), 'S': G.groupby('g').hs.sum()}
    for k, v in V.items():
        a = pd.Series(ids).map(v).to_numpy(float); miss = np.isnan(a); a = np.nan_to_num(a)
        x1 = (a[Oi].sum(1) - a[Di].sum(1)) * hs; x2 = (miss[Oi].sum(1) - miss[Di].sum(1)) * hs
        df = pd.DataFrame({'g': g, 'x1': x1, 'x2': x2}).groupby('g').sum()
        agg[k + '#x1'] = df.x1; agg[k + '#x2'] = df.x2
    A = pd.DataFrame(agg); A['t'] = t; games.append(A)
    print(t, 'games', len(A), flush=True)
A = pd.concat(games); A.to_pickle(OUT / f'test_games_{FS}.pkl')
