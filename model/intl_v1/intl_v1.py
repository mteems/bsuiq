"""International incoming-player model v1: v0.1 features + FIBA youth-event production.
FIBA data: every men's youth event 2010-25 on fiba.basketball (EuroBasket A/B/C, Challengers,
World Cups, AmeriCup, AfroBasket, Asia Cup, Oceania, Centrobasket, South American), matched to our
first-year internationals by name + date of birth. Only events before the player's first D-I season.
Each event row: efficiency per 40 minutes as a z-score within that event (players with 60+ minutes),
so a U16 Division C star and a U18 Division A starter are each compared with their own field.
Validation: leave-one-season-out, same as v0.1."""
import json, re, sys, numpy as np, pandas as pd
I = pd.read_csv('intl/intl_training.csv').reset_index(drop=True)
M = pd.DataFrame(json.load(open('intl/fiba_match.json')), columns=['i', 'yr', 'fam', 'gp', 'min', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'fga', 'fgm', 'tpa', 'tpm', 'fta', 'ftm', 'eff', 'ze', 'zp', 'dob'])
FAM = {int(k): v for k, v in json.load(open('intl/fiba_fams.json')).items()}
def tier(f):
    n = FAM.get(f, '')
    if 'World Cup' in n: return 'A'
    if re.search(r'EuroBasket$', n): return 'A'
    if re.search(r'Division B|Challengers', n): return 'B'
    if re.search(r'Division C', n): return 'C'
    if re.search(r'AmeriCup|AfroBasket|Asia Cup|Oceania|Asian U20', n): return 'R'
    return 'S'  # sub-regional (Centrobasket, South American)
def agecap(f):
    m = re.search(r'U(\d\d)', FAM.get(f, '')); return int(m.group(1)) if m else 20
M['tier'] = M.fam.map(tier); M['cap'] = M.fam.map(agecap)
M['by'] = pd.to_numeric(M.dob.str[:4], errors='coerce')
M['up'] = M.cap - (M.yr - M.by)          # years younger than the age limit ("playing up")
M['mpg'] = M['min'] / M.gp.clip(lower=1)
TB = {'A': 1.0, 'R': 0.4, 'B': 0.3, 'S': 0.0, 'C': -0.3}   # starting guesses; refit below
def feats(Mx, tb):
    g = Mx[Mx['min'] >= 40].copy()
    g['adj'] = g.ze.fillna(0) + g.tier.map(tb) + 0.08 * (g.cap - 18)
    out = pd.DataFrame(index=I.index.union(pd.Index(sorted(Mx.i.unique()))))
    w = g['min']
    agg = g.assign(wa=g.adj * w).groupby('i').agg(wa=('wa', 'sum'), w=('min', 'sum'), best=('adj', 'max'), up=('up', 'max'),
                                                  ev=('yr', 'size'), topA=('tier', lambda t: float((t == 'A').any())), mpgA=('mpg', 'max'))
    out['fiba'] = 0.0; out.loc[agg.index, 'fiba'] = 1.0
    out['f_avg'] = 0.0; out.loc[agg.index, 'f_avg'] = (agg.wa / agg.w).values
    out['f_best'] = 0.0; out.loc[agg.index, 'f_best'] = agg.best.values
    out['f_up'] = 0.0; out.loc[agg.index, 'f_up'] = agg.up.clip(-2, 3).fillna(0).values
    out['f_ev'] = 0.0; out.loc[agg.index, 'f_ev'] = np.log1p(agg.ev).values
    out['f_A'] = 0.0; out.loc[agg.index, 'f_A'] = agg.topA.values
    out['f_mpg'] = 0.0; out.loc[agg.index, 'f_mpg'] = (agg.mpgA / 40).values
    return out
BASE = ['age_f', 'age_na', 'ht_f', 'pgG', 'pgC', 'older', 'older_x_age', 'via_us', 'ranked', 'lrk', 'r_Africa', 'r_Oceania', 'r_Canada', 'r_Americas', 'r_Asia']
NEW = ['fiba', 'f_avg', 'f_up', 'f_mpg']
def fit(df, F, lam=5.0):
    X = df[F].to_numpy(float); mu, sd = X.mean(0), X.std(0) + 1e-9; Z = (X - mu) / sd
    W = df.w.to_numpy(); y = df.tal.to_numpy(); A = np.c_[np.ones(len(Z)), Z]; Wm = A.T * W
    return np.linalg.solve(Wm @ A + np.diag([0] + [lam] * len(F)), Wm @ y), mu, sd
def pred(m, df, F): b, mu, sd = m; return np.c_[np.ones(len(df)), (df[F].to_numpy(float) - mu) / sd] @ b
def cv(df, F):
    p = pd.Series(np.nan, index=df.index)
    for s in sorted(df.season.unique()):
        tr = df.season != s; p[~tr] = pred(fit(df[tr], F), df[~tr], F)
    q = df.mins >= 200; base = np.average(df.tal, weights=df.w)
    return {'r_200': round(float(np.corrcoef(p[q], df.tal[q])[0, 1]), 3), 'mae_200': round(float((p[q] - df.tal[q]).abs().mean()), 3),
            'mae_base': round(float((base - df.tal[q]).abs().mean()), 3)}, p
if __name__ == '__main__':
    best = None
    for a in (1.0, 1.4, 1.8, 2.2):
        for b in (0.0, 0.3):
            tb = {'A': a, 'R': b + 0.1, 'B': b, 'S': b - 0.3, 'C': b - 0.6}
            Fx = feats(M, tb); D = I.join(Fx.loc[I.index])
            res, _ = cv(D, BASE + NEW)
            if best is None or res['mae_200'] < best[0]['mae_200']: best = (res, tb)
    res, tb = best
    Fx = feats(M, tb); D = I.join(Fx.loc[I.index])
    r0, p0 = cv(D, BASE); r1, p1 = cv(D, BASE + NEW)
    print('coverage: FIBA rows for', int(D.fiba.sum()), 'of', len(D), '; 200+ min', int(D[D.mins >= 200].fiba.sum()), 'of', int((D.mins >= 200).sum()))
    print('v0.1 features:', r0); print('v1 (+FIBA):  ', r1, 'tier bonus', tb)
    q = (D.mins >= 200) & (D.fiba == 1)
    print('FIBA players only: r v0.1', round(np.corrcoef(p0[q], D.tal[q])[0, 1], 3), ' v1', round(np.corrcoef(p1[q], D.tal[q])[0, 1], 3), ' n', int(q.sum()))
    m = fit(D, BASE + NEW); F = BASE + NEW
    print('weights per sd:', dict(zip(['int'] + F, np.round(m[0], 3))))
    json.dump({'feat': F, 'beta': m[0].tolist(), 'mu': m[1].tolist(), 'sd': m[2].tolist(), 'tier_bonus': tb, 'cv_v01': r0, 'cv_v1': r1,
               'n': int(len(D)), 'n_fiba': int(D.fiba.sum())}, open('intl/intl_model_v1.json', 'w'), indent=1)
    D['cv_v1'] = p1; D['cv_v01'] = p0; D.to_csv('intl/intl_training_v1.csv', index=False)
    Fx.loc[Fx.index >= len(I)].to_csv('intl/prospect_fiba_feats.csv')
