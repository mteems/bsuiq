"""Strength of schedule per player-season: the average level of the opposing team on the possessions
he played (stage-1 team effects, points per 100). sos_o = opposing defense he scored against,
sos_d = opposing offense he defended."""
import numpy as np, pandas as pd
from pathlib import Path
P = Path('prep'); out = []
s1 = pd.read_csv(P / 'stage1.csv')
T = s1.groupby(['season', 'team'])[['team_o', 'team_d']].first() * 5
for s in range(2017, 2027):
    z = np.load(P / f'poss_{s}.npz'); O, D, ot, dt = z['O'], z['D'], z['ot'], z['dt']
    t = T.loc[s]
    opp_d = pd.Series(dt).map(t.team_d).fillna(t.team_d.min()).to_numpy()   # defense he faced on offense
    opp_o = pd.Series(ot).map(t.team_o).fillna(t.team_o.min()).to_numpy()   # offense he faced on defense
    a = pd.DataFrame({'cid': O.ravel(), 'v': np.repeat(opp_d, 5)}).groupby('cid').v.mean()
    b = pd.DataFrame({'cid': D.ravel(), 'v': np.repeat(opp_o, 5)}).groupby('cid').v.mean()
    out.append(pd.DataFrame({'season': s, 'sos_o': a, 'sos_d': b}).rename_axis('cid').reset_index())
pd.concat(out).to_csv('ovr/sos.csv', index=False); print('ok')
