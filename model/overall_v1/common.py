"""Overall model v1: shared loading. Run from the sdv folder."""
import numpy as np, pandas as pd
from pathlib import Path
P = Path('prep'); OUT = Path('ovr')
RATES = ['pts', 'fga', 'fta', 'tpa', 'tpm', 'ftm', 'fgm', 'ast', 'tov', 'orb', 'drb', 'stl', 'blk', 'pf', 'rima', 'rimm', 'fgm_ast']
# Box-score features (same season). Rates are per 100 of his offensive possessions, shrunk toward
# the league rate for small samples; share = his share of team minutes; lposs = log possessions.
BASE = ['r_' + k for k in RATES] + ['r_ts', 'r_3pct', 'r_ftpct', 'share', 'lposs', 'ht', 'pgG', 'pgC']
SOS = ['sos_o', 'sos_d']                      # strength of the opponents he played against (from possessions)
TV = ['bpm', 'obpm', 'dbpm', 'adjoe', 'adrtg', 'usg']   # Barttorvik's same-season player ratings
TEAM = ['team_o', 'team_d']                   # his own team's level that season (team effects)
import os
FEATSETS = {'base': BASE, 'sos': BASE + SOS, 'sos_tv': BASE + SOS + TV, 'sos_tv_team': BASE + SOS + TV + TEAM, 'sos_team': BASE + SOS + TEAM}
FS = os.environ.get('FS', 'base'); FEAT = FEATSETS[FS]
ALL = sorted(set(sum(FEATSETS.values(), [])))
SEASONS = list(range(2017, 2027))
def load_box():
    B = pd.read_csv(P / 'player_seasons.csv', low_memory=False).drop_duplicates(['season', 'cid'])
    B['pgG'] = (B.pg == 'G').astype(float); B['pgC'] = (B.pg == 'C').astype(float)
    B['ht'] = B.ht.fillna(B.ht.median())
    S = pd.read_csv(OUT / 'sos.csv'); B = B.merge(S, on=['season', 'cid'], how='left')
    for c in TV: B[c + '_na'] = B[c].isna().astype(float)
    X = B[FEAT].astype(float)
    mu, sd = X.mean(), X.std().replace(0, 1)
    Z = ((X - mu) / sd).fillna(0)
    B[[f'z_{c}' for c in FEAT]] = Z.to_numpy()
    return B
def season_poss(s):
    z = np.load(P / f'poss_{s}.npz')
    return z['O'], z['D'], z['y'].astype(float) * 100, z['hs'].astype(float), z['g']
def index_players(B, s, O, D):
    b = B[B.season == s].reset_index(drop=True)
    idx = pd.Series(np.arange(len(b)), index=b.cid)
    Oi = idx.reindex(O.ravel()).to_numpy().reshape(O.shape); Di = idx.reindex(D.ravel()).to_numpy().reshape(D.shape)
    # players in the possessions but missing from the box table: add zero-feature rows
    miss = np.unique(np.concatenate([O.ravel()[np.isnan(Oi.ravel())], D.ravel()[np.isnan(Di.ravel())]]))
    if len(miss):
        add = pd.DataFrame({'cid': miss, 'season': s}); b = pd.concat([b, add], ignore_index=True)
        for c in [f'z_{c}' for c in FEAT]: b[c] = b[c].fillna(0)
        idx = pd.Series(np.arange(len(b)), index=b.cid)
        Oi = idx.reindex(O.ravel()).to_numpy().reshape(O.shape); Di = idx.reindex(D.ravel()).to_numpy().reshape(D.shape)
    return b, Oi.astype(int), Di.astype(int)
