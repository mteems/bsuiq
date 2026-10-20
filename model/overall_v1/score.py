import numpy as np, pandas as pd, json
import glob
A = None
for f in sorted(glob.glob('ovr/test_games_*.pkl')):
    x = pd.read_pickle(f); A = x if A is None else A.join(x[[c for c in x.columns if c not in A.columns]])
meths = sorted({c.split('#')[0] for c in A.columns if '#' in c})
tr = A[A.t <= 2021]; te = A[A.t >= 2022]
def fit(k, cols):
    X = tr[cols].to_numpy(); w = np.linalg.lstsq(X, tr.M.to_numpy(), rcond=None)[0]
    p = te[cols].to_numpy() @ w; e = te.M - p
    return {'MAE': round(float(np.abs(e).mean()), 3), 'RMSE': round(float(np.sqrt((e ** 2).mean())), 3), 'r': round(float(np.corrcoef(p, te.M)[0, 1]), 4)}
res = {'constant (home edge only)': fit(None, ['P'])}
for m in meths: res[m] = fit(m, [f'{m}#x1', f'{m}#x2', 'P'])
for k, v in sorted(res.items(), key=lambda kv: kv[1]['MAE']): print(f'{k:28s}', v)
# per season, for the best
json.dump(res, open('ovr/test_results.json', 'w'), indent=1)
