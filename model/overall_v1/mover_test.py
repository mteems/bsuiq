"""TRANSFER TEST (mover_test.py): only players who changed teams get the candidate rating; everyone
else uses one common rating (v0.5 Impact, honest). So any difference between candidates comes from how
well each one rates players in a NEW team context: individual talent, not team carry-over.
Final comparison on target seasons 2022-2026 (tuned on 2019-2021):
next-season game margins from last season's ratings + real lineups, plus two bias checks:
  big:  extra value per big man on the floor the rating missed (+ = rating under-rates bigs)
  team: extra value per point of a mover's old-team strength (+ = rating under-credits players from
        good teams, - = it over-credits them)."""
import numpy as np, pandas as pd, os, json
from common import *
from rate import spm_weights, rate_season
B = load_box(); H = pd.read_csv('win_hist.csv'); HON = pd.read_csv('ovr/v05_honest.csv')
LAM = 10000; DEC = 0.5
def multi(t, w):
    R = []
    for k in (1, 2, 3):
        s = t - k
        if s < 2017: continue
        r = rate_season(B, s, w, (LAM,), ())
        for c in ['spm_o', 'spm_d', f'post_o_{LAM}', f'post_d_{LAM}']: r[c] -= np.average(r[c], weights=r.off_poss + r.def_poss)
        R.append(pd.DataFrame({'cid': r.cid, 'k': k, 'r': r[f'post_o_{LAM}'] + r[f'post_d_{LAM}'], 'spm': r.spm_o + r.spm_d, 'p': r.off_poss + r.def_poss}))
    R = pd.concat(R); cur = R[R.k == 1].set_index('cid')
    q = R[R.cid.isin(cur.index)].copy(); q['wt'] = q.p * DEC ** (q.k - 1)
    m = q.groupby('cid').apply(lambda x: np.average(x.r, weights=x.wt) if x.wt.sum() > 0 else x.r.iloc[0], include_groups=False)
    return m, cur.r, cur.spm
games = []
for t in range(2019, 2027):
    s = t - 1; w = spm_weights(exclude=(t,))
    m, single, spm = multi(t, w)
    b = B[B.season == s].set_index('cid'); h = H[H.season == s].set_index('cid'); ho = HON[HON.season == s].set_index('cid')
    V = {'v0.5 Ind (current Win input)': h.ind, 'NEW overall (multi-season)': m, 'NEW single-season': single, 'NEW box prior only': spm,
         'Torvik BPM': b.bpm.dropna(), 'team strength only': (b.team_o + b.team_d).dropna(),
         'v0.5 Overall (current site)': h.overall.dropna(), 'v0.5 Win (current site)': h.win_score.dropna(),
         'v0.5 Impact (honest retrain)': ho.now_honest, 'v0.5 Impact (in-sample)': h.now}
    O, D, y, hs, g = season_poss(t)
    ids, inv = np.unique(np.concatenate([O.ravel(), D.ravel()]), return_inverse=True)
    n = len(y); Oi = inv[:5 * n].reshape(n, 5); Di = inv[5 * n:].reshape(n, 5)
    bt = B[B.season == t].set_index('cid')
    big = pd.Series(ids).map(b.pg.reindex(pd.Index(ids)).fillna(bt.pg.reindex(pd.Index(ids)))).eq('C').to_numpy(float)
    moved = (bt.team.reindex(pd.Index(ids)).to_numpy() != b.team.reindex(pd.Index(ids)).to_numpy()) & b.team.reindex(pd.Index(ids)).notna().to_numpy()
    oldnet = ((b.team_o + b.team_d) * 5).reindex(pd.Index(ids)).fillna(0).to_numpy() * moved
    G = pd.DataFrame({'g': g, 'y': (y - y.mean()) * hs, 'big': (big[Oi].sum(1) - big[Di].sum(1)) * hs, 'team': (oldnet[Oi].sum(1) - oldnet[Di].sum(1)) * hs})
    agg = {'M': G.groupby('g').y.sum(), 'P': G.groupby('g').size(), 'BIG': G.groupby('g').big.sum(), 'TEAM': G.groupby('g').team.sum()}
    base = pd.Series(ids).map(V['v0.5 Impact (honest retrain)']).to_numpy(float)
    mv = moved.astype(bool)
    agg['MOVERS'] = pd.DataFrame({'g': g, 'm': (mv[Oi].sum(1) + mv[Di].sum(1))}).groupby('g').m.sum()
    for kk, v in V.items():
        a = pd.Series(ids).map(v).to_numpy(float)
        sv = np.where(mv, np.nan, base)               # stayers / freshmen: common rating
        mvv = np.where(mv, a, np.nan)                 # movers: candidate rating
        miss = np.isnan(sv) & np.isnan(mvv)
        s0 = np.nan_to_num(sv); m0 = np.nan_to_num(mvv)
        df = pd.DataFrame({'g': g, 'x1': (s0[Oi].sum(1) - s0[Di].sum(1)) * hs, 'x3': (m0[Oi].sum(1) - m0[Di].sum(1)) * hs, 'x2': (miss[Oi].sum(1) - miss[Di].sum(1)) * hs,
                           'x4': ((mv & np.isnan(mvv))[Oi].sum(1) - (mv & np.isnan(mvv))[Di].sum(1)) * hs,
                           'x5': ((mv & ~np.isnan(mvv))[Oi].sum(1) - (mv & ~np.isnan(mvv))[Di].sum(1)) * hs}).groupby('g').sum()
        for c in ('x1', 'x2', 'x3', 'x4', 'x5'): agg[f'{kk}#{c}'] = df[c]
    A = pd.DataFrame(agg); A['t'] = t; games.append(A); print(t, flush=True)
A = pd.concat(games); A.to_pickle('ovr/mover_games.pkl')
tr = A[A.t <= 2021]; te = A[A.t >= 2022]; res = {}
def ols(X, y): return np.linalg.lstsq(X, y, rcond=None)[0]
for kk in V:
    cols = [kk + '#x1', kk + '#x2', kk + '#x3', kk + '#x4', kk + '#x5', 'P']
    wv = ols(tr[cols].to_numpy(), tr.M.to_numpy()); p = te[cols].to_numpy() @ wv; e = te.M - p
    per = {int(t): round(float(np.abs((te.M - p)[te.t == t]).mean()) / 100, 2) for t in range(2022, 2027)}
    # bias checks on the test games: residual ~ big-man count and movers' old-team strength
    bb = ols(np.c_[te[['BIG', 'TEAM', 'P']].to_numpy()], e.to_numpy())
    res[kk] = {'game_error_pts': round(float(np.abs(e).mean()) / 100, 3), 'r': round(float(np.corrcoef(p, te.M)[0, 1]), 4), 'by_season': per,
               'big_bias_pts_per100': round(float(bb[0]), 2), 'team_bias_per_pt': round(float(bb[1]), 3)}
cols = ['P']; e = te.M - te[cols].to_numpy() @ ols(tr[cols].to_numpy(), tr.M.to_numpy()); res['home edge only'] = {'game_error_pts': round(float(np.abs(e).mean()) / 100, 3)}
for k, v in sorted(res.items(), key=lambda kv: kv[1]['game_error_pts']): print(f'{k:32s}', v)
json.dump(res, open('ovr/mover_test.json', 'w'), indent=1)
