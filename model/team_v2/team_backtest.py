"""Team projection backtest: which preseason team rating best predicts the season's games?
For every D-I team-season 2018-19 .. 2025-26:
  actual   = opponent-adjusted scoring margin per game (least squares on every D-I vs D-I game, home edge fit)
  roster   = the players who played for that team that season (same for every method)
  player   = Win-model projected impact per 100 (proj_o + proj_d, known before the season)
Methods (each a preseason number per team; the scale is fit on earlier seasons only, walk-forward):
  A  curve       sorted impact x average D-I minutes curve (the current site method)
  B  last year   last season's adjusted margin
  C  minutes     impact x minutes from a learned minutes model (role, returner, last-year share, class)
  D  C + prior   C blended with last season and the program's 3-year level, + returning-minutes share
Scored on team ratings (r, MAE vs actual) and on every game of the held-out season (margin MAE, winner %)."""
import json, warnings, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
CURVE = np.array([32.6, 30.1, 27.5, 24.8, 21.8, 18.2, 14.8, 11.4, 8.2, 5.3, 3.0, 1.5, 0.6, 0.2, 0.1])
P = pd.read_csv('prep/projections.csv', usecols=['cid', 'team', 's', 'hist', 'moved', 'cls_n', 'ranked', 'rec_rank', 'proj_o', 'proj_d', 'h_share', 'h_lposs'])
P = P[P.s <= 2026].copy(); P['imp'] = P.proj_o + P.proj_d
PS = pd.read_csv('prep/player_seasons.csv', usecols=['season', 'cid', 'team', 'mins', 'tmins5'])
PS = PS.groupby(['season', 'cid', 'team'], as_index=False)[['mins', 'tmins5']].sum()
tm = PS.groupby(['season', 'team']).mins.transform('sum'); PS['mshare'] = PS.mins / tm * 5   # fraction of team minutes x5 = share of a full game
P = P.merge(PS.rename(columns={'season': 's'})[['s', 'cid', 'team', 'mshare', 'mins']], on=['s', 'cid', 'team'], how='left')
P['mshare'] = P.mshare.fillna(0)
# ---- actual adjusted margins per team-season
GAMES, RAT = {}, {}
for s in range(2017, 2027):
    g = pd.read_csv(f'csv/schedule_{s}.csv').dropna(subset=['home_score', 'away_score'])
    teams = sorted(set(PS[PS.season == s].team)); ix = {t: i for i, t in enumerate(teams)}
    g = g[g.home.isin(ix) & g.away.isin(ix)].copy(); g['m'] = g.home_score - g.away_score
    n = len(teams); X = np.zeros((len(g), n + 1)); X[np.arange(len(g)), g.home.map(ix)] = 1; X[np.arange(len(g)), g.away.map(ix)] = -1; X[:, n] = 1
    A = X.T @ X + np.diag([1e-3] * n + [0]); b = np.linalg.solve(A, X.T @ g.m.to_numpy(float)); r = b[:n] - b[:n].mean()
    RAT[s] = dict(zip(teams, r)); GAMES[s] = g[['home', 'away', 'm']]
print('home edge (last season fit):', round(b[n], 2))
# ---- team features
rows = []
for (s, t), R in P.groupby(['s', 'team']):
    if t not in RAT.get(s, {}): continue
    R = R.sort_values('imp', ascending=False); imp = R.imp.to_numpy()
    k = min(len(imp), len(CURVE)); netA = float((imp[:k] * CURVE[:k]).sum() / 40)
    prev = PS[(PS.season == s - 1) & (PS.team == t)]; back = prev.cid.isin(R.cid).sum()
    ret = float(prev[prev.cid.isin(R.cid)].mins.sum() / prev.mins.sum()) if len(prev) else np.nan
    hist3 = np.nanmean([RAT.get(y, {}).get(t, np.nan) for y in (s - 3, s - 2, s - 1)])
    rows.append({'s': s, 'team': t, 'netA': netA, 'last': RAT.get(s - 1, {}).get(t, np.nan), 'hist3': hist3, 'ret': ret, 'n': len(R), 'actual': RAT[s][t]})
T = pd.DataFrame(rows)
# ---- learned minutes model (walk-forward): share of a full game for each player
def mfeat(R):
    R = R.copy(); R['rk'] = R.groupby(['s', 'team']).imp.rank(ascending=False, method='first')
    R['rel'] = R.imp - R.groupby(['s', 'team']).imp.transform(lambda x: x.nlargest(8).mean())
    R['ret'] = ((R['hist'] == 1) & (R.moved == 0)).astype(float); R['hsh'] = R.h_share.fillna(0) * R.ret
    R['hshm'] = R.h_share.fillna(0) * R.moved
    for k in range(1, 12): R[f'r{k}'] = (R.rk == k).astype(float)
    R['r12'] = (R.rk >= 12).astype(float); R['fr'] = (R.cls_n == 1).astype(float); R['nohist'] = (R['hist'] == 0).astype(float)
    return R
MF = ['rel', 'ret', 'hsh', 'hshm', 'fr', 'nohist'] + [f'r{k}' for k in range(1, 13)]
PM = mfeat(P)
def fitmin(D):
    X = D[MF].to_numpy(float); y = D.mshare.to_numpy(); return np.linalg.lstsq(np.c_[X], y, rcond=None)[0]
def predmin(D, b):
    m = np.clip(D[MF].to_numpy(float) @ b, 0, 0.95); D = D.assign(mp=m)
    return D.assign(mp=D.mp / D.groupby(['s', 'team']).mp.transform('sum') * 5)   # every team plays 5 at a time
out = []
for s in range(2020, 2027):
    b = fitmin(PM[PM.s < s]); D = predmin(PM[PM.s == s], b)
    D = D.assign(crk=D.groupby('team').mp.rank(ascending=False, method='first').astype(int)); D['cm'] = [CURVE[k - 1] / 40 if k <= 15 else 0 for k in D.crk]
    agg = D.groupby('team').apply(lambda g: pd.Series({'netC': float((g.imp * g.mp).sum() / 5), 'netC2': float((g.imp * g.cm).sum() / 5), 'top2': float(g.imp.nlargest(2).mean()),
        'depth': float(g.imp.nlargest(9).iloc[5:].mean()) if len(g) >= 7 else float(g.imp.min()), 'exp': float((g.cls_n.fillna(2) * g.mp).sum() / 5),
        'newshare': float((g.mp * (g['hist'] == 0)).sum() / 5), 'tshare': float((g.mp * g.moved).sum() / 5)}), include_groups=False).reset_index()
    agg['s'] = s; out.append(agg)
T = T.merge(pd.concat(out), on=['s', 'team'], how='left')
# minutes-model accuracy (how well we predict who plays): r of predicted vs actual share
b = fitmin(PM[PM.s < 2026]); D = predmin(PM[PM.s == 2026], b)
curve_share = PM[PM.s == 2026].assign(cs=lambda d: [CURVE[int(k) - 1] / 40 if k <= 15 else 0 for k in d.groupby(['s', 'team']).imp.rank(ascending=False, method='first')]).cs
mins_eval = {'r_minutes_model': round(float(np.corrcoef(D.mp, D.mshare)[0, 1]), 3), 'r_curve': round(float(np.corrcoef(curve_share, PM[PM.s == 2026].mshare)[0, 1]), 3)}
print('minutes 2025-26:', mins_eval)
# ---- walk-forward scoring
METHODS = {'A curve (site now)': ['netA'], 'B last season only': ['last'], 'A + last season': ['netA', 'last'], 'C learned minutes': ['netC'],
           'D C + last + 3yr + returning': ['netC', 'last', 'hist3', 'ret'], 'E A + last + 3yr + returning': ['netA', 'last', 'hist3', 'ret'],
           'C2 curve by model order': ['netC2'], 'D2 C2 + last + 3yr + returning': ['netC2', 'last', 'hist3', 'ret'],
           'F D + stars, depth, experience, newcomers': ['netC', 'last', 'hist3', 'ret', 'top2', 'depth', 'exp', 'newshare', 'tshare']}
def fitlin(D, F):
    X = np.c_[np.ones(len(D)), D[F].to_numpy(float)]; return np.linalg.lstsq(X, D.actual.to_numpy(), rcond=None)[0]
res = {}; preds = {}
T2 = T.copy(); T2['last'] = T2['last'].fillna(T2.groupby('s')['last'].transform('min')); T2['hist3'] = T2.hist3.fillna(T2['last']); T2['ret'] = T2.ret.fillna(0)
for name, F in METHODS.items():
    allp = []; games = []
    for s in range(2021, 2027):
        tr = T2[(T2.s < s) & (T2.s >= 2020)].dropna(subset=F); te = T2[T2.s == s].dropna(subset=F)
        if len(tr) < 50: continue
        bb = fitlin(tr, F); p = np.c_[np.ones(len(te)), te[F].to_numpy(float)] @ bb; te = te.assign(pred=p); allp.append(te)
        g = GAMES[s]; pr = dict(zip(te.team, te.pred)); g = g[g.home.isin(pr) & g.away.isin(pr)]
        hm = np.mean([GAMES[y].m.mean() for y in range(2018, s)])
        gp = g.home.map(pr) - g.away.map(pr) + hm; games.append(pd.DataFrame({'s': s, 'err': (gp - g.m).abs(), 'win': (np.sign(gp) == np.sign(g.m)).astype(float)}))
    A_ = pd.concat(allp); G_ = pd.concat(games)
    res[name] = {'team_r': round(float(np.corrcoef(A_.pred, A_.actual)[0, 1]), 3), 'team_mae': round(float((A_.pred - A_.actual).abs().mean()), 2),
                 'game_mae': round(float(G_.err.mean()), 2), 'winner_pct': round(float(G_.win.mean() * 100), 1), 'n_games': int(len(G_)),
                 'by_season_r': {int(s): round(float(np.corrcoef(g.pred, g.actual)[0, 1]), 3) for s, g in A_.groupby('s')}}
    preds[name] = A_
for k, v in res.items(): print(f'{k:32s}', {x: v[x] for x in ['team_r', 'team_mae', 'game_mae', 'winner_pct']}, v['by_season_r'])
best = min(res, key=lambda k: res[k]['game_mae']); print('best:', best)
bF = METHODS[best]; bb = fitlin(T2[T2.s >= 2020].dropna(subset=bF), bF)
json.dump({'results': res, 'minutes': mins_eval, 'best': best, 'best_features': bF, 'best_coef': [round(x, 4) for x in bb]}, open('team/team_backtest.json', 'w'), indent=1)
T2.to_csv('team/team_features.csv', index=False)
json.dump({'b_minutes': fitmin(PM).tolist(), 'MF': MF}, open('team/minutes_model.json', 'w'))
