"""Stage 2: learn which player metrics predict the NEXT season's possession outcomes.
Every possession of target season s is predicted from the ten players' pre-season features
(built only from seasons before s): pts/100 = mu_s + home + sum(off five: w_o.x) - sum(def five: w_d.x).
Walk-forward: choose settings training on s=2018..2024 and validating on 2025;
then train 2018..2025 and test once on 2025-26 (s=2026). Baselines on the same games."""
import numpy as np, pandas as pd, json, sys
from pathlib import Path
P = Path('prep')
F = pd.read_csv(P / 'features.csv')
HIST_COLS = [c for c in F.columns if c.startswith('h_')]
def build(F, variant):
    X = pd.DataFrame(index=F.index)
    hist = F['hist'].to_numpy(); X['hist'] = hist; X['nohist'] = 1 - hist
    cols = list(variant['hist_cols'])
    for c in cols:
        v = F[c]; X[c] = v.fillna(0) * hist  # missing -> 0 after centering (below)
        if v.isna().any() and c in ('h_bpm', 'h_obpm', 'h_dbpm', 'h_adjoe', 'h_adrtg', 'h_usg'): X[c + '_na'] = (v.isna() & (hist == 1)).astype(float)
    if variant.get('split_team'):  # does team credit travel with a player who changes teams?
        for c in ('h_team_o', 'h_team_d'):
            if c in X: X[c + '_moved'] = X[c] * F.moved
    if variant.get('second'):
        h2 = F.h2.to_numpy()
        for c in ['h2_own_o_10240', 'h2_own_d_10240', 'h2_team_o', 'h2_team_d', 'h2_bpm']: X[c] = F[c].fillna(0) * h2 * hist
    X['moved'] = F.moved
    X['ht'] = F.ht.fillna(F.ht.median())
    age = F.age.fillna(F.age.median()); X['age'] = age; X['age2'] = (age - 21) ** 2
    for k in (1, 2, 3, 4, 5): X[f'cls{k}'] = (F.cls_n == k).astype(float)
    if variant.get('cls_hist'):
        for c in ('h_own_o_10240', 'h_own_d_10240', 'h_bpm'):
            if c in X:
                for k in (1, 2): X[f'{c}_cls{k}'] = X[c] * (F.cls_n == k)
    return X
def design_season(s, Xp, key):
    z = np.load(P / f'poss_{s}.npz')
    O, D, y, hs, g = z['O'], z['D'], z['y'].astype(float) * 100, z['hs'].astype(float), z['g']
    idx = pd.Series(np.arange(len(key)), index=key)
    Oi = idx.reindex(O.ravel()).to_numpy().reshape(O.shape); Di = idx.reindex(D.ravel()).to_numpy().reshape(D.shape)
    assert not np.isnan(Oi).any() and not np.isnan(Di).any()
    Oi = Oi.astype(int); Di = Di.astype(int)
    So = Xp[Oi].sum(axis=1); Sd = Xp[Di].sum(axis=1)
    return np.hstack([So, -Sd, hs[:, None]]), y, hs, g, Oi, Di
def fit_eval(variant, train_s, test_s, lam):
    Xall = build(F, variant)
    cols = list(Xall.columns)
    mu, sd = Xall[F.s.isin(train_s)].mean(), Xall[F.s.isin(train_s)].std().replace(0, 1)
    # standardize everything except the indicator-style intercepts
    keep_raw = ['hist', 'nohist']
    Z = (Xall - mu) / sd; Z[keep_raw] = Xall[keep_raw]
    k = Z.shape[1]; XtX = np.zeros((2 * k + 1, 2 * k + 1)); Xty = np.zeros(2 * k + 1)
    for s in train_s:
        m = F.s == s
        Xs, y, *_ = design_season(s, Z[m].to_numpy(), F.cid[m].to_numpy())
        y = y - y.mean()
        XtX += Xs.T @ Xs; Xty += Xs.T @ y
    pen = np.full(2 * k + 1, lam); pen[-1] = 0
    w = np.linalg.solve(XtX + np.diag(pen), Xty)
    out = {}
    for s in test_s:
        m = F.s == s
        Xs, y, hs, g, Oi, Di = design_season(s, Z[m].to_numpy(), F.cid[m].to_numpy())
        pred = Xs @ w; yc = y - y.mean()
        out[s] = metrics(pred, yc, hs, g)
    return w, cols, out, (mu, sd)
def metrics(pred, yc, hs, g):
    err = (pred - yc) / 100
    gm = pd.DataFrame({'g': g, 'e': err * hs, 'p': pred / 100 * hs, 'a': yc / 100 * hs}).groupby('g').agg(e=('e', 'sum'), p=('p', 'sum'), a=('a', 'sum'))
    return {'poss_rmse': float(np.sqrt(np.mean(err ** 2))), 'game_mae': float(gm.e.abs().mean()), 'margin_r': float(np.corrcoef(gm.p, gm.a)[0, 1]), 'games': len(gm)}
def baselines(s):
    """Team continuity: last season's team adjusted margin applied to this season's games (same team name)."""
    s1 = pd.read_csv(P / 'stage1.csv'); prev = s1[s1.season == s - 1]
    tnet = prev.groupby('team').apply(lambda d: (d.team_o.iloc[0] + d.team_d.iloc[0]) * 5, include_groups=False)
    z = np.load(P / f'poss_{s}.npz'); y = z['y'].astype(float) * 100; hs = z['hs'].astype(float); g = z['g']
    o = pd.Series(z['ot']).map(tnet).fillna(tnet.min()).to_numpy(); d = pd.Series(z['dt']).map(tnet).fillna(tnet.min()).to_numpy()
    # net per 100 each side: offense team's net/2 + defense team's -net/2 (split evenly)
    pred = (o - d) / 2
    yc = y - y.mean()
    out = {'team_continuity': metrics(pred, yc, hs, g), 'constant': metrics(np.zeros_like(yc), yc, hs, g)}
    return out
if __name__ == '__main__':
    base_hist = ['h_own_o_10240', 'h_own_d_10240', 'h_team_o', 'h_team_d']
    box_hist = ['h_share', 'h_lposs'] + [c for c in HIST_COLS if c.startswith('h_r_')]
    tv_hist = ['h_bpm', 'h_obpm', 'h_dbpm', 'h_adjoe', 'h_adrtg', 'h_usg']
    VARIANTS = {
        'impact_only': {'hist_cols': base_hist},
        'impact+box': {'hist_cols': base_hist + box_hist},
        'impact+box+torvik': {'hist_cols': base_hist + box_hist + tv_hist},
        'all+split_team': {'hist_cols': base_hist + box_hist + tv_hist, 'split_team': True},
        'all+split+2yr': {'hist_cols': base_hist + box_hist + tv_hist, 'split_team': True, 'second': True},
        'all+split+2yr+lowlam_own': {'hist_cols': base_hist + ['h_own_o_2560', 'h_own_d_2560'] + box_hist + tv_hist, 'split_team': True, 'second': True},
        'all+split+2yr+clsdev': {'hist_cols': base_hist + box_hist + tv_hist, 'split_team': True, 'second': True, 'cls_hist': True},
    }
    mode = sys.argv[1] if len(sys.argv) > 1 else 'val'
    res = {}
    if mode == 'val':
        res['baselines_2025'] = baselines(2025)
        for name, v in VARIANTS.items():
            for lam in [1e4, 1e5, 1e6]:
                w, cols, out, _ = fit_eval(v, list(range(2018, 2025)), [2025], lam)
                res[f'{name}|{lam:g}'] = out[2025]; print(name, lam, out[2025], flush=True)
        print(json.dumps(res['baselines_2025']))
        Path('stage2_val.json').write_text(json.dumps(res, indent=1))
    if mode == 'final':
        v = VARIANTS['all+split+2yr+clsdev']; lam = float(sys.argv[2]) if len(sys.argv) > 2 else 1e4
        # 1) honest test: train through 2024-25, predict 2025-26 from pre-season information only
        w, cols, out, _ = fit_eval(v, list(range(2018, 2026)), [2026], lam)
        res['test_2026'] = out[2026]; res['baselines_2026'] = baselines(2026)
        print('TEST 2026', out[2026], res['baselines_2026'], flush=True)
        # 2) final weights: same model trained on every season pair (2018..2026)
        w, cols, _, (mu, sd) = fit_eval(v, list(range(2018, 2027)), [], lam)
        k = len(cols); wo, wd = w[:k], w[k:2 * k]
        res['lambda'] = lam; res['home'] = float(w[-1])
        res['weights'] = {c: {'off': round(float(a), 3), 'def': round(float(b), 3)} for c, a, b in zip(cols, wo, wd)}
        Path('stage2_final.json').write_text(json.dumps(res, indent=1))
        # 3) per-player projections: off / def pts per 100 vs an average player (centered on 2025-26 minutes)
        Xall = build(F, v); Z = (Xall - mu) / sd; Z[['hist', 'nohist']] = Xall[['hist', 'nohist']]
        F['proj_o'] = Z.to_numpy() @ wo; F['proj_d'] = Z.to_numpy() @ wd
        # "talent now": the projection without the development terms (class, age and the class
        # interactions) -- what he is, not what a year of growth should add.
        dev = [i for i, c in enumerate(cols) if c in ('age', 'age2') or c.startswith('cls') or '_cls' in c]
        Zd = Z.to_numpy().copy(); Zd[:, dev] = 0
        F['now_o'] = Zd @ wo; F['now_d'] = Zd @ wd
        F['dev'] = (F.proj_o + F.proj_d) - (F.now_o + F.now_d)
        # where "now" comes from: team context, his own on-court plus-minus, box profile, Torvik BPM-type ratings
        groups = {'g_team': lambda c: 'team' in c or c.startswith('h_adrtg') or c.startswith('h_adjoe'),
                  'g_own': lambda c: '_own_' in c,
                  'g_bpm': lambda c: 'bpm' in c,
                  'g_box': lambda c: c.startswith('h_r_') or c in ('h_share', 'h_lposs', 'h_usg', 'h_usg_na'),
                  'g_static': lambda c: c in ('ht', 'hist', 'nohist', 'moved')}
        for gname, fn in groups.items():
            ix = [i for i, c in enumerate(cols) if fn(c) and i not in dev]
            F[gname] = Zd[:, ix] @ (wo[ix] + wd[ix])
        F.to_csv(P / 'projections.csv', index=False)
        print(json.dumps({c: res['weights'][c] for c in cols}, indent=0)[:4000])
    if mode == 'walk':
        v = VARIANTS['all+split+2yr+clsdev']; out = {}
        for s in range(2021, 2027):
            _, _, o, _ = fit_eval(v, list(range(2018, s)), [s], 1e4)
            out[s] = {'model': o[s], **baselines(s)}; print(s, json.dumps(out[s]), flush=True)
        Path('stage2_walk.json').write_text(json.dumps(out, indent=1))
