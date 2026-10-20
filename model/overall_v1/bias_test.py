"""Does the talent rating over-rate (a) bigs or (b) low-minute reserves? Same next-season game test
(fit 2019-2021, check 2022-2026), with two extra terms per rating:
  BIG  = rated bigs on the floor (offense minus defense)      -> + means bigs are under-rated
  RES  = sum of the ratings of players who were reserves (under 50% of team minutes) last season
         -> negative means reserves' ratings should be scaled down by that fraction."""
import numpy as np, pandas as pd, json
from common import *
from rate import spm_weights, rate_season
exec(open('ovr/final_test.py').read().split('games = []')[0].split('B = load_box()')[1].replace("H = pd.read_csv('win_hist.csv'); HON", "B = load_box(); H = pd.read_csv('win_hist.csv'); HON"), globals()) if False else None
B = load_box(); H = pd.read_csv('win_hist.csv'); HON = pd.read_csv('ovr/v05_honest.csv')
LAM = 10000; DEC = 0.5
src = open('ovr/final_test.py').read(); i = src.index('def multi'); j = src.index('games = []'); exec(src[i:j])
rows = []
for t in range(2019, 2027):
    s = t - 1; m, single, spm = multi(t, spm_weights(exclude=(t,)))
    b = B[B.season == s].set_index('cid'); ho = HON[HON.season == s].set_index('cid')
    imp = ho.now_honest; new = m
    blend = (imp + 0.044 / 0.471 * new.reindex(imp.index).fillna(new.min()))
    V = {'impact': imp, 'new': new, 'blend': blend}
    O, D, y, hs, g = season_poss(t)
    ids, inv = np.unique(np.concatenate([O.ravel(), D.ravel()]), return_inverse=True)
    n = len(y); Oi = inv[:5 * n].reshape(n, 5); Di = inv[5 * n:].reshape(n, 5)
    I = pd.Index(ids)
    big = b.pg.reindex(I).eq('C').to_numpy(float); res = (b.share.reindex(I) < 0.5).to_numpy(float)
    agg = {'M': pd.Series((y - y.mean()) * hs).groupby(g).sum(), 'P': pd.Series(np.ones(n)).groupby(g).sum()}
    for k, v in V.items():
        a = pd.Series(ids).map(v).to_numpy(float); rated = ~np.isnan(a); a0 = np.nan_to_num(a)
        f = lambda arr: pd.Series((arr[Oi].sum(1) - arr[Di].sum(1)) * hs).groupby(g).sum()
        agg[k + '#x1'] = f(a0); agg[k + '#x2'] = f((~rated).astype(float)); agg[k + '#big'] = f(big * rated); agg[k + '#res'] = f(a0 * res); agg[k + '#nres'] = f(res * rated)
    A = pd.DataFrame(agg); A['t'] = t; rows.append(A); print(t, flush=True)
A = pd.concat(rows); tr = A[A.t <= 2021]; te = A[A.t >= 2022]; out = {}
for k in V:
    for name, cols in [('plain', ['x1', 'x2']), ('+bias terms', ['x1', 'x2', 'big', 'res', 'nres'])]:
        c = [f'{k}#{x}' for x in cols] + ['P']
        w = np.linalg.lstsq(tr[c], tr.M, rcond=None)[0]; e = te.M - te[c] @ w
        wa = np.linalg.lstsq(A[c], A.M, rcond=None)[0]
        out[f'{k} {name}'] = {'game_error_pts': round(float(np.abs(e).mean()) / 100, 3), 'coef': dict(zip(cols, np.round(wa[:len(cols)], 3).tolist()))}
for k, v in out.items(): print(f'{k:24s}', v)
json.dump(out, open('ovr/bias_test.json', 'w'), indent=1)
