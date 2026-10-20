"""Bronco IQ Win model v0.2 (2025-26).
Builds on Possession Impact v0.1 (same inputs, same audit and retained possessions, same
chronological train / validation / test split) and adds what v0.1's validation said it lacked:
  1. a box-score prior learned inside the same regression: each player's rating =
     (his per-100 box profile x learned weights) + a heavily shrunk player-specific residual
  2. minutes share as a prior feature (coaches' trust is information)
Then turns ratings into wins: points added over replacement level, divided by points per win
measured from this season's D-I schedule.
"""
import os, json, time, sys
for x in ['OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS']: os.environ[x] = '2'
import numpy as np, pandas as pd
from scipy import sparse
from scipy.sparse.linalg import lsqr
from pathlib import Path

C = Path('csv'); OUT = Path('win_v2'); OUT.mkdir(exist_ok=True)
r = pd.read_csv(C / 'rosters.csv', dtype={'player_id': str}).sort_values('player_id').reset_index(drop=True)
p = pd.read_csv(C / 'poss.csv', dtype={f'{s}_{i}_player_id': str for s in ['home', 'away'] for i in range(1, 6)})
s = pd.read_csv(C / 'schedule.csv')
b = pd.read_csv(C / 'box.csv', dtype={'player_id': str})

# ------------------------------------------------------------------ v0.1 audit, unchanged
CACHE = OUT / 'retained.pkl'
if CACHE.exists():
    d = pd.read_pickle(CACHE)
else:
    slots = [f'{side}_{i}_player_id' for side in ['home', 'away'] for i in range(1, 6)]
    reg = set(zip(r.team.astype(str), r.player_id.astype(str)))
    boxreg = set(zip(b.contest_id.astype(str), b.team.astype(str), b.player_id.astype(str)))
    di = p.home.isin(r.team) & p.away.isin(r.team)
    legal = p.poss_team.eq(p.home) | p.poss_team.eq(p.away)
    for side in ['home', 'away']:
        for i in range(1, 6):
            c = f'{side}_{i}_player_id'
            legal &= np.array([(str(t), str(v)) in reg and (str(g), str(t), str(v)) in boxreg for g, t, v in zip(p.contest_id, p[side], p[c])])
    legal &= p[slots].nunique(axis=1).eq(10)
    legal &= p.pts.between(0, 7)
    sc = p.groupby(['contest_id', 'poss_team']).pts.sum().to_dict()
    exact = {x.contest_id: sc.get((x.contest_id, x.home), -1) == x.home_score and sc.get((x.contest_id, x.away), -1) == x.away_score for x in s.itertuples()}
    gcov = legal.groupby(p.contest_id).mean()
    good = set(gcov.index[(gcov >= .98) & gcov.index.map(exact).fillna(False)])
    d = p.loc[di & legal & p.contest_id.isin(good)].copy().reset_index(drop=True)
    d.to_pickle(CACHE)
d['date'] = pd.to_datetime(d.game_date)
print('retained', len(d), d.contest_id.nunique(), flush=True)

idmap = {v: i for i, v in enumerate(r.player_id.astype(str))}; N = len(r)
H = np.column_stack([d[f'home_{i}_player_id'].map(idmap).to_numpy() for i in range(1, 6)])
A = np.column_stack([d[f'away_{i}_player_id'].map(idmap).to_numpy() for i in range(1, 6)])
homeoff = d.poss_team.eq(d.home).to_numpy(); O = np.where(homeoff[:, None], H, A); D = np.where(homeoff[:, None], A, H)
n = len(d); y = d.pts.to_numpy(float) * 100
hsign = np.where(homeoff, 1., -1.)
dates = np.sort(d.date.unique()); c1 = dates[int(len(dates) * .70)]; c2 = dates[int(len(dates) * .85)]
tr = (d.date < c1).to_numpy(); va = ((d.date >= c1) & (d.date < c2)).to_numpy(); te = (d.date >= c2).to_numpy()
print('split', str(c1)[:10], str(c2)[:10], tr.sum(), va.sum(), te.sum(), flush=True)

# player indicator design (offense +1 for the 5 on offense, defense -1 for the 5 on defense)
row = np.repeat(np.arange(n), 5)
XO = sparse.csr_matrix((np.ones(5 * n), (row, O.ravel())), shape=(n, N))
XD = sparse.csr_matrix((np.ones(5 * n), (row, D.ravel())), shape=(n, N))

# ------------------------------------------------------------------ box-score profile per player
teams = sorted(r.team.unique())
b['date'] = pd.to_datetime(b.game_date)
bdi = b[b.home.isin(teams) & b.away.isin(teams)].copy()
ht = r.set_index('player_id').ht_inches
FEATS = ['pts', 'fga', 'fta', 'tpa', 'ast', 'tov', 'orb', 'drb', 'stl', 'blk', 'pf', 'rima']
def profile(cut=None):
    x = bdi if cut is None else bdi[bdi.date < cut]
    g = x.groupby('player_id')
    tot = g[FEATS + ['o_poss', 'mins']].sum()
    # team minutes in the same games -> minutes share
    tm = x.groupby(['contest_id', 'team']).mins.sum().rename('tmins')
    x2 = x.join(tm, on=['contest_id', 'team'])
    share = x2.groupby('player_id').apply(lambda z: z.mins.sum() / max(1e-9, z.tmins.sum() / 5), include_groups=False)
    lg = tot[FEATS].sum() / tot.o_poss.sum() * 100
    K = 300  # pseudo-possessions of league-average production (empirical-Bayes shrink of noisy rates)
    rate = (tot[FEATS].div(1, axis=0) * 100 + K * lg) .div(tot.o_poss + K, axis=0)
    rate['share'] = share.reindex(rate.index).fillna(0)
    rate['ht'] = ht.reindex(rate.index).astype(float)
    rate['ht'] = rate['ht'].fillna(rate['ht'].median())
    F = rate.reindex(r.player_id.astype(str))
    # players with no box rows: league average, zero share
    for k in FEATS: F[k] = F[k].fillna(lg[k])
    F['share'] = F['share'].fillna(0); F['ht'] = F['ht'].fillna(rate['ht'].median())
    F['share2'] = F['share'] ** 2
    Z = (F - F.mean()) / F.std(ddof=0)
    return Z.to_numpy(), list(Z.columns)

tmap = {t: i for i, t in enumerate(teams)}; nt = len(teams)
ot = d.poss_team.map(tmap).to_numpy(); dt = pd.Series(np.where(homeoff, d.away, d.home)).map(tmap).to_numpy()
TO = sparse.csr_matrix((np.ones(n), (np.arange(n), ot)), shape=(n, nt)); TD = sparse.csr_matrix((np.ones(n), (np.arange(n), dt)), shape=(n, nt))
def design(Z):
    # columns: player off (N), player def (N), box off (k), box def (k), team off (nt), team def (nt), home (1)
    k = Z.shape[1]
    BO = XO @ Z  # summed offensive box profile of the five on offense
    BD = XD @ Z
    X = sparse.hstack([XO, -XD, sparse.csr_matrix(BO), sparse.csr_matrix(-BD), TO, -TD, sparse.csr_matrix(hsign[:, None])], format='csr')
    return X, k
def pens(k, lam_p, lam_b, lam_t):
    return np.concatenate([np.full(2 * N, lam_p), np.full(2 * k, lam_b), np.full(2 * nt, lam_t), [1e-6]])

def solve(X, yy, w_pen, mask=None):
    """Ridge with a separate penalty per column (w_pen), via lsqr on the augmented system."""
    Xm = X[mask] if mask is not None else X; ym = yy[mask] if mask is not None else yy
    mu = ym.mean()
    sq = np.sqrt(w_pen)
    keep = sq > 0
    Aug = sparse.vstack([Xm, sparse.diags(sq).tocsr()[keep]], format='csr')
    rhs = np.concatenate([ym - mu, np.zeros(keep.sum())])
    sol = lsqr(Aug, rhs, atol=1e-7, btol=1e-7, iter_lim=3000)[0]
    return sol, mu

def metrics(pred, mask):
    yy = y[mask] / 100; pp = pred / 100; err = pp - yy
    dd = pd.DataFrame({'g': d.contest_id[mask].to_numpy(), 'e': err * hsign[mask]})
    gm = dd.groupby('g').e.sum()
    return {'possession_rmse': float(np.sqrt(np.mean(err ** 2))), 'game_margin_mae': float(gm.abs().mean()), 'games': int(len(gm))}

res = {}
# ---- validation: prior from games before the validation window only
Ztr, cols = profile(c1)
X, k = design(Ztr)
grid = []
OFF = 1e9  # effectively removes a block
for lam_t in [160, OFF]:
    for lam_b in [50, OFF]:
        for lam_p in [640, 2560, 10240]:
            pen = pens(k, lam_p, lam_b, lam_t)
            t = time.time(); sol, mu = solve(X, y, pen, tr)
            m = metrics(mu + X[va] @ sol, va); grid.append({'lam_player': lam_p, 'lam_box': lam_b, 'lam_team': lam_t, **m})
            print('VAL', grid[-1], round(time.time() - t), 's', flush=True)
# Select on validation game-margin error: the Win score is about game outcomes.
best = min(grid, key=lambda g: g['game_margin_mae'])
res['grid'] = grid; res['selected'] = best
# ---- test: refit on train+validation with the prior from games before the test window
Zte, _ = profile(c2)
X2, _ = design(Zte)
pen = pens(k, best['lam_player'], best['lam_box'], best['lam_team'])
sol, mu = solve(X2, y, pen, tr | va)
res['test_box_prior'] = metrics(mu + X2[te] @ sol, te)
# box-prior-only (no player residuals): how much is the box profile alone worth
sol0, mu0 = solve(X2, y, pens(k, OFF, 50, OFF), tr | va)
res['test_box_only'] = metrics(mu0 + X2[te] @ sol0, te)
sol0, mu0 = solve(X2, y, pens(k, best['lam_player'], 50, best['lam_team']), tr | va)
res['test_same_with_box'] = metrics(mu0 + X2[te] @ sol0, te)
# v0.1 replica (pure RAPM, alpha 2560) and team-only (alpha 160) on the same split
XR = sparse.hstack([XO, -XD, sparse.csr_matrix(hsign[:, None])], format='csr')
solr, mur = solve(XR, y, np.concatenate([np.full(2 * N, 2560), [1e-6]]), tr | va)
res['test_rapm_v01'] = metrics(mur + XR[te] @ solr, te)
XT = sparse.csr_matrix((np.tile([1., -1.], n), (np.repeat(np.arange(n), 2), np.column_stack([ot, dt + nt]).ravel())), shape=(n, 2 * nt))
XT = sparse.hstack([XT, sparse.csr_matrix(hsign[:, None])], format='csr')
solt, mut = solve(XT, y, np.concatenate([np.full(2 * nt, 160), [1e-6]]), tr | va)
res['test_team_only'] = metrics(mut + XT[te] @ solt, te)
res['test_constant'] = metrics(np.full(te.sum(), y[tr | va].mean()), te)
print(json.dumps({k: v for k, v in res.items() if k != 'grid'}, indent=1), flush=True)

# ------------------------------------------------------------------ final fit on the whole season
Zall, cols = profile(None)
Xf, k = design(Zall)
sol, mu = solve(Xf, y, pens(k, best['lam_player'], best['lam_box'], best['lam_team']))
uo, ud, wo, wd = sol[:N], sol[N:2 * N], sol[2 * N:2 * N + k], sol[2 * N + k:2 * N + 2 * k]
to_, td_ = sol[2 * N + 2 * k:2 * N + 2 * k + nt], sol[2 * N + 2 * k + nt:2 * N + 2 * k + 2 * nt]
tix = r.team.map(tmap).to_numpy()
# A team's effect is shared by the five on the floor, so each player carries a fifth of it.
r['team_off'] = to_[tix] / 5; r['team_def'] = td_[tix] / 5
r['prior_off'] = Zall @ wo + r.team_off; r['prior_def'] = Zall @ wd + r.team_def
r['off'] = r.prior_off + uo; r['def'] = r.prior_def + ud
# center on the possession-weighted average player (so 0 = average D-I player on the floor)
r['off_poss'] = np.bincount(O.ravel(), minlength=N); r['def_poss'] = np.bincount(D.ravel(), minlength=N)
w = r.off_poss + r.def_poss
for c in ['off', 'def']:
    r[c] -= np.average(r[c], weights=np.maximum(w, 1e-9))
r['impact'] = r['off'] + r['def']
res['team_weight_note'] = 'team effect split evenly across the five on the floor'
res['box_weights'] = {'offense': dict(zip(cols, np.round(wo, 3))), 'defense': dict(zip(cols, np.round(wd, 3)))}
res['intercept'] = mu; res['home'] = float(sol[-1])

# source exposure (coverage) as in v0.1
bsrc = bdi.groupby('player_id').agg(src_poss=('o_poss', 'sum'), mins=('mins', 'sum'), gp_di=('contest_id', 'nunique'))
r = r.join(bsrc, on='player_id')
r['coverage'] = r.off_poss / r.src_poss.replace(0, np.nan)
# Ratings were fit on retained possessions; credit playing time from ALL D-I possessions he played
# (box o_poss), so a player isn't punished for games the audit had to drop.
r['poss_played'] = r.src_poss.fillna(0) * 2  # offensive + defensive possessions

# ------------------------------------------------------------------ points per win from this season
g = s[s.home.isin(teams) & s.away.isin(teams)]
tg = pd.concat([pd.DataFrame({'t': g.home, 'm': g.home_score - g.away_score}), pd.DataFrame({'t': g.away, 'm': g.away_score - g.home_score})])
tg['w'] = (tg.m > 0).astype(float)
agg = tg.groupby('t').agg(m=('m', 'mean'), w=('w', 'mean'), gms=('w', 'size'))
slope = np.polyfit(agg.m, agg.w, 1)[0]  # win% per point of average margin
pts_per_win = 1 / slope  # season points of margin per extra win
res['points_per_win'] = float(pts_per_win)

share = bdi.groupby('player_id').apply(lambda z: z.mins.sum() / (40 * z.contest_id.nunique()), include_groups=False)
r['min_share'] = r.player_id.map(share).fillna(0)
# Replacement level: a fringe D-I rotation player, the 15th percentile of impact among players with 200+ minutes.
# (End-of-bench players can't set it here: with so few possessions their ratings are mostly their team's.)
repl = float(np.percentile(r.loc[r.mins >= 200, 'impact'], 15))
res['replacement_impact'] = repl
# what the impact is made of: his team's level (split five ways) and his own on-court evidence beyond it
r['team_part'] = r.team_off + r.team_def
r['indiv'] = uo + ud
# per-100 is per 100 team possessions while on the floor; each side counted separately
r['pts_over_repl'] = (r['off'] - repl / 2) * r.src_poss.fillna(0) / 100 + (r['def'] - repl / 2) * r.src_poss.fillna(0) / 100
r['wins_added'] = r.pts_over_repl / pts_per_win
# Win score: same scale as the skill scores (50 = D-I average among 200+ minute players)
# Win score: the skill-score scale (bell curve, 50 = D-I average among 200+ minute players,
# 70 = top ~7%, 80+ = top ~1%), from his rank in wins added.
from scipy.stats import norm as _norm
pool = r[r.mins >= 200]
def bell(col):
    pct = (r[col].where(r.mins >= 200).rank(method='average') - .5) / len(pool)
    return np.where(r.mins >= 200, np.clip(50 + 13.5 * _norm.ppf(pct.fillna(.5)), 1, 99), np.nan)
r['win_score'] = bell('wins_added'); r['impact_score'] = bell('impact')
r['rank_wins'] = r.wins_added.where(r.mins >= 200).rank(ascending=False, method='min')
res['pool'] = int(len(pool))
r.sort_values('wins_added', ascending=False).to_csv(OUT / 'players.csv', index=False)
(OUT / 'validation.json').write_text(json.dumps(res, indent=1, default=float))
print('POINTS/WIN', pts_per_win, 'REPL', repl, flush=True)
print(r.sort_values('wins_added', ascending=False)[['clean_name', 'team', 'off', 'def', 'impact', 'mins', 'wins_added', 'win_score']].head(25).to_string(index=False))
print(r[r.team.eq('Boise St.')].sort_values('wins_added', ascending=False)[['clean_name', 'off', 'def', 'impact', 'mins', 'coverage', 'wins_added', 'win_score']].to_string(index=False))
