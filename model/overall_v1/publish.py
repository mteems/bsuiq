"""Overall v1 for every season 2016-17..2025-26.
  new  = on-court model: box prior (weights learned from possessions, with schedule strength and
         Barttorvik ratings) + his own lineup results, blended over his last 3 seasons (decay 0.5)
  imp  = Win model Impact / 100 (predictive talent rating; win_hist.csv 'now')
  rating = imp + (W_NEW / W_IMP) * new   (weights from the 2019-2021 fit of the game test)
  Overall score = bell scale of rating among that season's 200+ minute players."""
import numpy as np, pandas as pd, json
from scipy.stats import norm
from common import *
from rate import spm_weights, rate_season
W_IMP, W_NEW = 0.471, 0.044; LAM = 10000; DEC = 0.5
B = load_box(); w = spm_weights(exclude=()); R = []
for s in SEASONS:
    r = rate_season(B, s, w, (LAM,), ())
    for c in ['spm_o', 'spm_d', f'post_o_{LAM}', f'post_d_{LAM}']: r[c] -= np.average(r[c], weights=r.off_poss + r.def_poss)
    R.append(pd.DataFrame({'season': s, 'cid': r.cid, 'new_o': r[f'post_o_{LAM}'], 'new_d': r[f'post_d_{LAM}'], 'p': r.off_poss + r.def_poss}))
R = pd.concat(R); R['new1'] = R.new_o + R.new_d
out = []
for s in SEASONS:
    cur = R[R.season == s][['cid']]
    q = R[(R.season <= s) & (R.season >= s - 2) & R.cid.isin(cur.cid)].copy(); q['wt'] = q.p * DEC ** (s - q.season)
    for c in ('new_o', 'new_d'): q[c + 'w'] = q[c] * q.wt
    g = q.groupby('cid')[['new_ow', 'new_dw', 'wt']].sum()
    m = pd.DataFrame({'season': s, 'cid': g.index, 'new_o': (g.new_ow / g.wt.replace(0, np.nan)).to_numpy(), 'new_d': (g.new_dw / g.wt.replace(0, np.nan)).to_numpy()})
    out.append(m)
N = pd.concat(out); N['new'] = N.new_o + N.new_d
H = pd.read_csv('win_hist.csv').merge(N, on=['season', 'cid'], how='left')
H['new'] = H.new.fillna(H.groupby('season').new.transform('min'))
H['rating'] = H.now + W_NEW / W_IMP * H.new
H['rating_o'] = H.now_o + W_NEW / W_IMP * H.new_o.fillna(0); H['rating_d'] = H.rating - H.rating_o
def bell(x):
    ok = x.mins >= 200; pct = (x.rating.where(ok).rank() - .5) / ok.sum()
    return pd.Series(np.where(ok, np.clip(50 + 13.5 * norm.ppf(pct.fillna(.5)), 1, 99), np.nan), index=x.index)
H['overall1'] = H.groupby('season', group_keys=False).apply(bell, include_groups=False)
H.to_csv('ovr/overall_v1.csv', index=False)
# ---- checks
D = pd.read_csv('prep/draft.csv').dropna(subset=['cid'])
B2 = pd.read_csv('prep/player_seasons.csv', usecols=['season', 'cid', 'bpm'], low_memory=False).drop_duplicates(['season', 'cid'])
X = H.merge(B2, on=['season', 'cid'], how='left'); X = X[X.mins >= 200]
X['drafted'] = [ (c, s) in set(zip(D.cid, D.draft)) for c, s in zip(X.cid, X.season)]
from itertools import combinations
def auc(score, lab):
    s = pd.Series(score).rank(); n1 = lab.sum(); n0 = len(lab) - n1
    return (s[lab.to_numpy()].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)
X = X[X.season <= 2025]
print('draft AUC (drafted that June, among 200+ min players, 2017-2025):', {k: round(auc(X[k].fillna(X[k].min()).to_numpy(), X.drafted.reset_index(drop=True)), 4) for k in ['overall1', 'now', 'new', 'overall', 'win_score', 'bpm']}, 'drafted n', int(X.drafted.sum()))
c = H[(H.season == 2026) & (H.mins >= 200)].sort_values('overall1', ascending=False)
print('2025-26 top 25:', ', '.join(f'{a} ({b}) {o:.1f}' for a, b, o in c[['name', 'team', 'overall1']].head(25).values))
print('top 100 by position', c.head(100).pg.value_counts().to_dict(), 'pool', c.pg.value_counts(normalize=True).round(2).to_dict())
print('BSU 2025-26', c[c.team == 'Boise St.'][['name', 'overall1', 'overall', 'rating']].round(1).values.tolist())
for s in SEASONS:
    t = H[(H.season == s) & (H.mins >= 200)].sort_values('overall1', ascending=False)
    print(s, ', '.join(t.name.head(5)))
