"""Prep 10 seasons (2016-17 .. 2025-26) of SportsDataverse possessions for the Win model.
Same audit as Possession Impact v0.1, per season. Players are keyed by the R canonical id
(identity table: season + NCAA player id -> canonical_player_id) so careers link across seasons.
Writes prep/poss_<yr>.npz and prep/ps.csv (player-season features)."""
import numpy as np, pandas as pd, sys
from pathlib import Path
C = Path('csv'); OUT = Path('prep'); OUT.mkdir(exist_ok=True)
ident = pd.read_csv(C / 'identity.csv', dtype=str)
IDN = dict(zip(ident.season + '|' + ident.player_id, ident.canonical_player_id))
FEATS = ['pts', 'fga', 'fta', 'tpa', 'tpm', 'ftm', 'fgm', 'ast', 'tov', 'orb', 'drb', 'stl', 'blk', 'pf', 'rima', 'rimm', 'fgm_ast']
slots = [f'{s}_{i}_player_id' for s in ['home', 'away'] for i in range(1, 6)]
allps = []
years = [int(a) for a in sys.argv[1:]] or list(range(2017, 2027))
for yr in years:
    r = pd.read_csv(C / f'rosters_{yr}.csv', dtype={'player_id': str})
    p = pd.read_csv(C / f'poss_{yr}.csv', dtype={c: str for c in slots})
    s = pd.read_csv(C / f'schedule_{yr}.csv')
    b = pd.read_csv(C / f'box_{yr}.csv', dtype={'player_id': str})
    teams = set(r.team)
    reg = set(r.team.astype(str) + '|' + r.player_id)
    boxreg = set(b.contest_id.astype(str) + '|' + b.team.astype(str) + '|' + b.player_id)
    di = p.home.isin(teams) & p.away.isin(teams)
    legal = (p.poss_team.eq(p.home) | p.poss_team.eq(p.away)).to_numpy().copy()
    cid = p.contest_id.astype(str)
    for side in ['home', 'away']:
        for i in range(1, 6):
            v = p[f'{side}_{i}_player_id'].fillna('')
            legal &= (p[side].astype(str) + '|' + v).isin(reg).to_numpy()
            legal &= (cid + '|' + p[side].astype(str) + '|' + v).isin(boxreg).to_numpy()
    legal &= p[slots].nunique(axis=1).eq(10).to_numpy() & p.pts.between(0, 7).to_numpy()
    legal = pd.Series(legal, index=p.index)
    sc = p.groupby(['contest_id', 'poss_team']).pts.sum().to_dict()
    exact = {x.contest_id: sc.get((x.contest_id, x.home), -1) == x.home_score and sc.get((x.contest_id, x.away), -1) == x.away_score for x in s.itertuples()}
    gcov = legal.groupby(p.contest_id).mean()
    good = set(gcov.index[(gcov >= .98) & gcov.index.map(exact).fillna(False)])
    d = p.loc[di & legal & p.contest_id.isin(good)].reset_index(drop=True)
    canon = lambda pid: IDN.get(f'{yr}|{pid}', f'u{yr}_{pid}')
    H = np.column_stack([d[f'home_{i}_player_id'].map(canon).to_numpy() for i in range(1, 6)])
    A = np.column_stack([d[f'away_{i}_player_id'].map(canon).to_numpy() for i in range(1, 6)])
    homeoff = d.poss_team.eq(d.home).to_numpy()
    O = np.where(homeoff[:, None], H, A); D = np.where(homeoff[:, None], A, H)
    defteam = np.where(homeoff, d.away, d.home)
    np.savez_compressed(OUT / f'poss_{yr}.npz', O=O.astype('U40'), D=D.astype('U40'), y=d.pts.to_numpy(np.int8), hs=np.where(homeoff, 1, -1).astype(np.int8),
                        g=d.contest_id.to_numpy(np.int64), date=pd.to_datetime(d.game_date).values.astype('datetime64[D]').astype(np.int32),
                        ot=d.poss_team.to_numpy().astype('U40'), dt=defteam.astype('U40'))
    # player-season box features, D-I vs D-I games only
    bd = b[b.home.isin(teams) & b.away.isin(teams)].copy()
    tm = bd.groupby(['contest_id', 'team']).mins.transform('sum')
    bd['tmins5'] = tm / 5
    agg = bd.groupby(['player_id', 'team']).agg(**{k: (k, 'sum') for k in FEATS + ['o_poss', 'mins', 'tmins5']}, gp=('contest_id', 'nunique')).reset_index()
    agg['share'] = agg.mins / agg.tmins5.replace(0, np.nan)
    ro = r[['player_id', 'team', 'class', 'position', 'ht_inches', 'clean_name']].drop_duplicates(['player_id', 'team'])
    agg = agg.merge(ro, on=['player_id', 'team'], how='left')
    agg['cid'] = agg.player_id.map(canon); agg['season'] = yr
    allps.append(agg)
    # possessions played in the retained sample (for coverage)
    print(yr, 'raw', len(p), 'retained', len(d), 'games', d.contest_id.nunique(), 'identity', f"{np.mean([not x.startswith('u') for x in O.ravel()]):.3f}", flush=True)
pd.concat(allps).to_csv(OUT / ('ps.csv' if len(years) == 10 else f'ps_{years[0]}.csv'), index=False)
