"""Overall model v1 ratings for one season.
  spm  = box-score prior: possession-learned weights on his same-season box profile
  post = spm + his own on-court evidence (ridge plus-minus centered on the prior)
  rapm = plain ridge plus-minus (no prior), for comparison
All in points per 100 possessions vs. an average player; o = offense, d = defense (positive = good)."""
import numpy as np, pandas as pd, time
from scipy import sparse
from scipy.sparse.linalg import lsqr
from common import *
ZC = [f'z_{c}' for c in FEAT]; K = len(FEAT)
def spm_weights(exclude=(), lam=1000.0):
    XtX = 0; Xty = 0
    for s in SEASONS:
        if s in exclude: continue
        z = np.load(OUT / f'spm_{FS}_{s}.npz'); XtX = XtX + z['XtX']; Xty = Xty + z['Xty']
    pen = np.full(XtX.shape[0], lam); pen[-1] = 0
    w = np.linalg.solve(XtX + np.diag(pen), Xty)
    return w[:K], w[K:2 * K], w[-1]
def ridge(XO, XD, hs, r, lam):
    n, N = XO.shape
    X = sparse.hstack([XO, -XD, sparse.csr_matrix(hs[:, None])], format='csr')
    pen = np.concatenate([np.full(2 * N, np.sqrt(lam)), [1e-3]])
    A = sparse.vstack([X, sparse.diags(pen).tocsr()], format='csr')
    sol = lsqr(A, np.concatenate([r, np.zeros(2 * N + 1)]), atol=1e-6, btol=1e-6, iter_lim=2000)[0]
    return sol[:N], sol[N:2 * N]
def rate_season(B, s, w, post_lams=(3000,), rapm_lams=()):
    wo, wd, h = w
    O, D, y, hs, g = season_poss(s)
    b, Oi, Di = index_players(B, s, O, D)
    X = b[ZC].to_numpy(); N = len(b); n = len(y)
    out = pd.DataFrame({'season': s, 'cid': b.cid, 'spm_o': X @ wo, 'spm_d': X @ wd,
                        'off_poss': np.bincount(Oi.ravel(), minlength=N), 'def_poss': np.bincount(Di.ravel(), minlength=N)})
    rr = np.repeat(np.arange(n), 5)
    XO = sparse.csr_matrix((np.ones(5 * n), (rr, Oi.ravel())), shape=(n, N)); XD = sparse.csr_matrix((np.ones(5 * n), (rr, Di.ravel())), shape=(n, N))
    yc = y - y.mean()
    prior = out.spm_o.to_numpy()[Oi].sum(1) - out.spm_d.to_numpy()[Di].sum(1) + h * hs
    for lam in post_lams:
        uo, ud = ridge(XO, XD, hs, yc - prior, lam)
        out[f'post_o_{lam}'] = out.spm_o + uo; out[f'post_d_{lam}'] = out.spm_d + ud
    for lam in rapm_lams:
        uo, ud = ridge(XO, XD, hs, yc, lam)
        out[f'rapm_o_{lam}'] = uo; out[f'rapm_d_{lam}'] = ud
    return out
if __name__ == '__main__':
    B = load_box(); w = spm_weights(exclude=(2026,))
    t = time.time(); r = rate_season(B, 2025, w, post_lams=(3000,), rapm_lams=(3000,)); print('secs', round(time.time() - t))
    r = r.merge(B[B.season == 2025][['cid', 'name', 'team', 'mins']], on='cid')
    r['post'] = r.post_o_3000 + r.post_d_3000; r['spm'] = r.spm_o + r.spm_d; r['rapm'] = r.rapm_o_3000 + r.rapm_d_3000
    print(r[r.mins >= 200].sort_values('post', ascending=False)[['name', 'team', 'mins', 'spm', 'rapm', 'post']].head(20).round(2).to_string())
    print(dict(zip(FEAT, np.round(w[0], 2))), '\nDEF', dict(zip(FEAT, np.round(w[1], 2))))
