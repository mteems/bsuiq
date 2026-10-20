"""Step 1: per season, accumulate X'X and X'y for the box-score prior (SPM) learned directly from
possessions: pts/100 = mean + home + sum(offense five: wo . x) - sum(defense five: wd . x)."""
import numpy as np, sys
from common import *
B = load_box(); ZC = [f'z_{c}' for c in FEAT]
for s in SEASONS:
    O, D, y, hs, g = season_poss(s)
    b, Oi, Di = index_players(B, s, O, D)
    X = b[ZC].to_numpy()
    So = X[Oi].sum(1); Sd = X[Di].sum(1)
    A = np.hstack([So, -Sd, hs[:, None]])
    yc = y - y.mean()
    np.savez(OUT / f'spm_{FS}_{s}.npz', XtX=A.T @ A, Xty=A.T @ yc, n=len(y))
    print(s, len(y), A.shape, flush=True)
