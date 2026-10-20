"""Apply the final Win model (same variant and training as stage2.py 'final') to the rating rows
(prep/features_rate.csv): talent-now components for every player-season 2016-17..2025-26."""
import numpy as np, pandas as pd, json
from pathlib import Path
import stage2 as S
P = Path('prep')
v = {'hist_cols': ['h_own_o_10240', 'h_own_d_10240', 'h_team_o', 'h_team_d'] + ['h_pgG', 'h_pgC'] + [c for c in S.HIST_COLS if c.startswith('h_rel_')] + ['h_lposs'] + ['h_bpm', 'h_obpm', 'h_dbpm', 'h_adjoe', 'h_adrtg', 'h_usg'],
     'split_team': True, 'second': True, 'cls_hist': True, 'rec': True, 'move': True, 'posw': True}
w, cols, _, (mu, sd) = S.fit_eval(v, list(range(2018, 2027)), [], 1e4)
k = len(cols); wo, wd = w[:k], w[k:2 * k]
R = pd.read_csv(P / 'features_rate.csv', low_memory=False)
box = pd.read_csv(P / 'player_seasons.csv', usecols=['season', 'cid'])
R['season'] = R.s - 1
R = R.merge(box.drop_duplicates(), left_on=['season', 'cid'], right_on=['season', 'cid'])  # drop relink duplicates
R = R.drop_duplicates(['season', 'cid']).reset_index(drop=True)
X = S.build(R, v)[cols]; Z = (X - mu) / sd; Z[['hist', 'nohist']] = X[['hist', 'nohist']]
Zn = Z.to_numpy(); ww = wo + wd
dev = [i for i, c in enumerate(cols) if c in ('age', 'age2') or c.startswith('cls') or '_cls' in c]
mov = [i for i, c in enumerate(cols) if c in ('move_up', 'dest_net_moved', 'moved') or c.endswith('_moved')]
Zd = Zn.copy(); Zd[:, dev] = 0; Zd[:, mov] = 0
R['now_o'] = Zd @ wo; R['now_d'] = Zd @ wd
groups = {'g_team': lambda c: 'team' in c or c.startswith('h_adrtg') or c.startswith('h_adjoe'), 'g_own': lambda c: '_own_' in c, 'g_bpm': lambda c: 'bpm' in c,
          'g_box': lambda c: c.startswith('h_r_') or c.startswith('h_rel_') or c.startswith('h_pg') or c in ('h_share', 'h_lposs', 'h_usg', 'h_usg_na') or c.startswith('h_share_') or c.startswith('h_lposs_') or c.startswith('h_usg_'),
          'g_rec': lambda c: c.startswith('rec') or c.startswith('ranked'), 'g_static': lambda c: c in ('ht', 'hist', 'nohist')}
for g, fn in groups.items():
    ix = [i for i, c in enumerate(cols) if fn(c) and i not in dev and i not in mov]; R[g] = Zd[:, ix] @ ww[ix]
R[['season', 'cid', 'team', 'now_o', 'now_d'] + list(groups)].to_csv(P / 'rate_rows.csv', index=False)
print(R.groupby('season').size().to_dict())
