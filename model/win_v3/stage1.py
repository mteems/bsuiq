"""Stage 1: in-season impact per season (Win model v0.2 form): team effects + player deviations.
team_part = team effect / 5 (each of the five on the floor), own = player's deviation (his own
on-court evidence beyond his team). Two shrink levels so stage 2 can learn which predicts better.
Writes prep/stage1.csv: season, cid, team, off/def poss, team_o, team_d, own_o, own_d (per lambda)."""
import numpy as np, pandas as pd, os
from scipy import sparse
from scipy.sparse.linalg import lsqr
from pathlib import Path
P = Path('prep'); out = []
LAMS = [2560, 10240]
def solve(X, y, pen):
    mu = y.mean(); sq = np.sqrt(pen)
    A = sparse.vstack([X, sparse.diags(sq).tocsr()], format='csr')
    sol = lsqr(A, np.concatenate([y - mu, np.zeros(len(pen))]), atol=1e-7, btol=1e-7, iter_lim=3000)[0]
    return sol, mu
for yr in range(2017, 2027):
    z = np.load(P / f'poss_{yr}.npz')
    O, D, y, hs, ot, dt = z['O'], z['D'], z['y'].astype(float) * 100, z['hs'].astype(float), z['ot'], z['dt']
    ids, inv = np.unique(np.concatenate([O.ravel(), D.ravel()]), return_inverse=True)
    n = len(y); N = len(ids); Oi = inv[:5 * n].reshape(n, 5); Di = inv[5 * n:].reshape(n, 5)
    teams, tinv = np.unique(np.concatenate([ot, dt]), return_inverse=True); nt = len(teams)
    ti_o, ti_d = tinv[:n], tinv[n:]
    rr = np.repeat(np.arange(n), 5)
    XO = sparse.csr_matrix((np.ones(5 * n), (rr, Oi.ravel())), shape=(n, N)); XD = sparse.csr_matrix((np.ones(5 * n), (rr, Di.ravel())), shape=(n, N))
    TO = sparse.csr_matrix((np.ones(n), (np.arange(n), ti_o)), shape=(n, nt)); TD = sparse.csr_matrix((np.ones(n), (np.arange(n), ti_d)), shape=(n, nt))
    X = sparse.hstack([XO, -XD, TO, -TD, sparse.csr_matrix(hs[:, None])], format='csr')
    # each player's team in this season: the team he played the most offensive possessions for
    pt = pd.DataFrame({'p': Oi.ravel(), 't': np.repeat(ti_o, 5)}).value_counts().reset_index().drop_duplicates('p')
    team_of = np.full(N, -1); team_of[pt.p.to_numpy()] = pt.t.to_numpy()
    df = pd.DataFrame({'season': yr, 'cid': ids, 'team': teams[team_of], 'off_poss': np.bincount(Oi.ravel(), minlength=N), 'def_poss': np.bincount(Di.ravel(), minlength=N)})
    for lam in LAMS:
        pen = np.concatenate([np.full(2 * N, lam), np.full(2 * nt, 160.), [1e-6]])
        sol, mu = solve(X, y, pen)
        uo, ud, to_, td_ = sol[:N], sol[N:2 * N], sol[2 * N:2 * N + nt], sol[2 * N + nt:2 * N + 2 * nt]
        # center team effects on the possession-weighted average team
        w = np.bincount(ti_o, minlength=nt) + np.bincount(ti_d, minlength=nt)
        to_ = to_ - np.average(to_, weights=w); td_ = td_ - np.average(td_, weights=w)
        df[f'own_o_{lam}'] = uo; df[f'own_d_{lam}'] = ud
        if lam == LAMS[-1]: df['team_o'] = to_[team_of] / 5; df['team_d'] = td_[team_of] / 5; df['home'] = sol[-1]; df['mu'] = mu
    out.append(df); print(yr, N, nt, flush=True)
pd.concat(out).to_csv(P / 'stage1.csv', index=False)
