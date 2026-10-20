"""Multi-season Overall: blend this season's rating with earlier seasons, weighted by possessions
and a decay d per year back: r = sum(d^k * poss_k * r_k) / sum(d^k * poss_k). Same game test."""
import numpy as np, pandas as pd, os
from common import *
from rate import spm_weights, rate_season
B = load_box(); LAM = int(os.environ.get('LAM', 3000))
DEC = [0, 0.25, 0.5, 0.75, 1.0]; games = []
for t in range(2019, 2027):
    w = spm_weights(exclude=(t,))
    R = []
    for k in (1, 2, 3):
        s = t - k
        if s < 2017: continue
        r = rate_season(B, s, w, (LAM,), ())
        for c in ['spm_o', 'spm_d', f'post_o_{LAM}', f'post_d_{LAM}']: r[c] -= np.average(r[c], weights=r.off_poss + r.def_poss)
        R.append(pd.DataFrame({'cid': r.cid, 'k': k, 'r': r[f'post_o_{LAM}'] + r[f'post_d_{LAM}'], 'p': r.off_poss + r.def_poss}))
    R = pd.concat(R); cur = set(R[R.k == 1].cid)
    V = {}
    for d in DEC:
        q = R[R.cid.isin(cur)].copy(); q['wt'] = q.p * d ** (q.k - 1)
        V[f'multi_d{d}'] = q.groupby('cid').apply(lambda x: np.average(x.r, weights=x.wt) if x.wt.sum() > 0 else np.nan, include_groups=False)
    O, D, y, hs, g = season_poss(t)
    ids, inv = np.unique(np.concatenate([O.ravel(), D.ravel()]), return_inverse=True)
    n = len(y); Oi = inv[:5 * n].reshape(n, 5); Di = inv[5 * n:].reshape(n, 5)
    G = pd.DataFrame({'g': g, 'hs': hs, 'y': (y - y.mean()) * hs})
    agg = {'M': G.groupby('g').y.sum(), 'P': G.groupby('g').size()}
    for kk, v in V.items():
        a = pd.Series(ids).map(v).to_numpy(float); miss = np.isnan(a); a = np.nan_to_num(a)
        df = pd.DataFrame({'g': g, 'x1': (a[Oi].sum(1) - a[Di].sum(1)) * hs, 'x2': (miss[Oi].sum(1) - miss[Di].sum(1)) * hs}).groupby('g').sum()
        agg[kk + '#x1'] = df.x1; agg[kk + '#x2'] = df.x2
    A = pd.DataFrame(agg); A['t'] = t; games.append(A); print(t, flush=True)
A = pd.concat(games)
tr = A[A.t <= 2021]; te = A[A.t >= 2022]
for kk in V:
    cols = [kk + '#x1', kk + '#x2', 'P']; wv = np.linalg.lstsq(tr[cols], tr.M, rcond=None)[0]; p = te[cols] @ wv; e = te.M - p
    print(LAM, kk, round(float(np.abs(e).mean()), 2), round(float(np.corrcoef(p, te.M)[0, 1]), 4))
