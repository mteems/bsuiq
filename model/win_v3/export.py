"""Win model v0.3 export for the site: one row per 2025-26 player (canonical id)."""
import pandas as pd, numpy as np, json
from scipy.stats import norm
F = pd.read_csv('prep/projections.csv'); B = pd.read_csv('prep/player_seasons.csv')
b = B[B.season == 2026].set_index('cid')
x = F[F.s == 2027].copy().join(b[['name', 'mins', 'o_poss', 'team_o', 'team_d']], on='cid', rsuffix='_b')
x['now'] = x.now_o + x.now_d; x['proj'] = x.proj_o + x.proj_d
pool = x[x.mins >= 200]
c = np.average(pool.now, weights=pool.mins); co = np.average(pool.now_o, weights=pool.mins); cd = c - co
x['now'] -= c; x['now_o'] -= co; x['now_d'] -= cd; x['proj'] -= c; x['proj_o'] -= co; x['proj_d'] -= cd
for g in ['g_team', 'g_own', 'g_bpm', 'g_box', 'g_static']: x[g] -= np.average(pool[g], weights=pool.mins)
pool = x[x.mins >= 200]
repl = float(np.percentile(pool.now, 15))
s = pd.read_csv('csv/schedule_2026.csv'); r = pd.read_csv('csv/rosters_2026.csv'); T = set(r.team)
g = s[s.home.isin(T) & s.away.isin(T)]
tg = pd.concat([pd.DataFrame({'t': g.home, 'm': g.home_score - g.away_score}), pd.DataFrame({'t': g.away, 'm': g.away_score - g.home_score})])
agg = tg.groupby('t').agg(m=('m', 'mean'), w=('m', lambda v: (v > 0).mean()))
ppw = 1 / np.polyfit(agg.m, agg.w, 1)[0]
x['pts_over_repl'] = (x.now - repl) * x.o_poss / 100
x['wins_added'] = x.pts_over_repl / ppw
ok = x.mins >= 200
pct = (x.wins_added.where(ok).rank() - .5) / ok.sum()
x['win_score'] = np.where(ok, np.clip(50 + 13.5 * norm.ppf(pct.fillna(.5)), 1, 99), np.nan)
x['team_net'] = (x.team_o + x.team_d) * 5
x.to_csv('win_v3_players.csv', index=False)
meta = {'version': 'v0.3', 'replacement': repl, 'points_per_win': ppw, 'pool': int(ok.sum()),
        'val_2025': json.load(open('stage2_val.json')), 'final': {k: v for k, v in json.load(open('stage2_final.json')).items() if k != 'weights'}}
json.dump(meta, open('win_v3_meta.json', 'w'), indent=1, default=float)
print('repl', round(repl, 2), 'ppw', round(ppw, 1))
p = x[ok]
tv = p.groupby('team').now.transform('mean'); print('between-team share', round(tv.var() / p.now.var(), 2))
print(p.sort_values('win_score', ascending=False)[['name', 'team', 'now', 'g_team', 'g_own', 'g_bpm', 'g_box', 'wins_added', 'win_score', 'proj']].head(15).round(2).to_string())
print(p[p.team == 'Boise St.'].sort_values('win_score', ascending=False)[['name', 'now', 'g_team', 'g_own', 'g_bpm', 'g_box', 'mins', 'wins_added', 'win_score', 'proj']].round(2).to_string())
