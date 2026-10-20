"""Honest check of the v0.5 Impact rating: retrain the Win model on target seasons 2018-2021 only,
then rate players for seasons 2021-2025 (so 2022-2026 games were never seen in training)."""
import numpy as np, pandas as pd, sys
sys.path.insert(0, '.')
import stage2 as S
from pathlib import Path
P = Path('prep')
v = {'hist_cols': ['h_own_o_10240', 'h_own_d_10240', 'h_team_o', 'h_team_d'] + ['h_pgG', 'h_pgC'] + [c for c in S.HIST_COLS if c.startswith('h_rel_')] + ['h_lposs'] + ['h_bpm', 'h_obpm', 'h_dbpm', 'h_adjoe', 'h_adrtg', 'h_usg'],
     'split_team': True, 'second': True, 'cls_hist': True, 'rec': True, 'move': True, 'posw': True}
w, cols, _, (mu, sd) = S.fit_eval(v, list(range(2018, 2022)), [], 1e4)
k = len(cols); wo, wd = w[:k], w[k:2 * k]
R = pd.read_csv(P / 'features_rate.csv', low_memory=False); R['season'] = R.s - 1
box = pd.read_csv(P / 'player_seasons.csv', usecols=['season', 'cid']).drop_duplicates()
R = R.merge(box, on=['season', 'cid']).drop_duplicates(['season', 'cid']).reset_index(drop=True)
X = S.build(R, v)[cols]; Z = (X - mu) / sd; Z[['hist', 'nohist']] = X[['hist', 'nohist']]
dev = [i for i, c in enumerate(cols) if c in ('age', 'age2') or c.startswith('cls') or '_cls' in c]
mov = [i for i, c in enumerate(cols) if c in ('move_up', 'dest_net_moved', 'moved') or c.endswith('_moved')]
Zd = Z.to_numpy().copy(); Zd[:, dev] = 0; Zd[:, mov] = 0
R['now_honest'] = Zd @ wo + Zd @ wd
R[['season', 'cid', 'now_honest']].to_csv('ovr/v05_honest.csv', index=False); print('done')
