"""Win model v0.5 export for the site: one row per 2025-26 player (canonical id)."""
import pandas as pd, numpy as np, json
from scipy.stats import norm
F = pd.read_csv('prep/projections.csv'); B = pd.read_csv('prep/player_seasons.csv')
b = B[B.season == 2026].set_index('cid')
x = F[F.s == 2027].copy().join(b[['name', 'mins', 'o_poss', 'team_o', 'team_d']], on='cid', rsuffix='_b')
x['now'] = x.now_o + x.now_d
# Growth: what a year should add for his class and age. Seniors / grads are the zero point and
# nobody is projected to decline (experience doesn't hurt); development is credited to offense
# and defense in proportion to how the model's class terms split.
zero = x.loc[x.cls_n >= 4, 'growth_raw'].median()
x['dev'] = (x.growth_raw - zero).clip(lower=0)
x['proj'] = x.now + x.dev + x.move_adj
x['proj_o'] = x.now_o + x.dev * 0.6 + x.move_adj / 2; x['proj_d'] = x.proj - x.proj_o
pool = x[x.mins >= 200]
c = np.average(pool.now, weights=pool.mins); co = np.average(pool.now_o, weights=pool.mins); cd = c - co
x['now'] -= c; x['now_o'] -= co; x['now_d'] -= cd; x['proj'] -= c; x['proj_o'] -= co; x['proj_d'] -= cd
for g in ['g_team', 'g_own', 'g_bpm', 'g_box', 'g_rec', 'g_static']: x[g] -= np.average(pool[g], weights=pool.mins)
pool = x[x.mins >= 200]
# Replacement level by position group (the WAR idea): a fringe rotation guard, forward or big,
# the 15th percentile of impact among 200+ minute players at that position. A replacement big
# rates higher than a replacement guard, so bigs are measured against bigs.
PG = pd.read_csv('prep/player_seasons.csv', usecols=['season', 'cid', 'pg']).query('season==2026').set_index('cid').pg
x['pg'] = x.cid.map(PG).fillna('F'); pool = x[x.mins >= 200]
REPL = pool.groupby('pg').now.quantile(.15).to_dict()
repl = float(np.percentile(pool.now, 15))
print('replacement by position', {k: round(v, 2) for k, v in REPL.items()})
s = pd.read_csv('csv/schedule_2026.csv'); r = pd.read_csv('csv/rosters_2026.csv'); T = set(r.team)
g = s[s.home.isin(T) & s.away.isin(T)]
tg = pd.concat([pd.DataFrame({'t': g.home, 'm': g.home_score - g.away_score}), pd.DataFrame({'t': g.away, 'm': g.away_score - g.home_score})])
agg = tg.groupby('t').agg(m=('m', 'mean'), w=('m', lambda v: (v > 0).mean()))
ppw = 1 / np.polyfit(agg.m, agg.w, 1)[0]
# v0.5: Win is an individual skill. Two team-success leans are removed:
#  1. team context. The model's team term (last season's team effect) and the team-wide part of the
#     BPM block are things a player inherits from his team. Win uses "individual impact": impact
#     without the team term and with half of his team's average BPM part taken out (half, so being
#     on a good team still counts a little and a star on a bad team is not treated as a star on a
#     good one).
#  2. games played. Deep tournament runs add 6-9 games of volume; possessions are scaled to a
#     standard 31-game D-I schedule.
x['team_bpm'] = x.groupby('team').g_bpm.transform(lambda v: v.mean())
x['ind'] = x.now - x.g_team - 0.5 * x.team_bpm
pool = x[x.mins >= 200]; ci = np.average(pool.ind, weights=pool.mins); x['ind'] -= ci; pool = x[x.mins >= 200]
REPL = pool.groupby('pg').ind.quantile(.15).to_dict()
repl = float(np.percentile(pool.ind, 15))
print('individual replacement by position', {k: round(v, 2) for k, v in REPL.items()})
tgames = pd.concat([g.home, g.away]).value_counts(); G = float(tgames.median())
x['repl'] = x.pg.map(REPL)
x['poss_std'] = x.o_poss * G / x.team.map(tgames).fillna(G)
x['pts_over_repl'] = (x.ind - x.repl) * x.poss_std / 100
x['wins_added'] = x.pts_over_repl / ppw
ok = x.mins >= 200
def bell(v):
    pct = (v.where(ok).rank() - .5) / ok.sum()
    return np.where(ok, np.clip(50 + 13.5 * norm.ppf(pct.fillna(.5)), 1, 99), np.nan)
x['win_score'] = bell(x.wins_added)
# Overall: half how good he is per possession compared with players at his position (shrunk toward
# average when minutes are few), half how much winning he created (Win).
pm = x[ok].groupby('pg').ind.mean(); psd = x[ok].groupby('pg').ind.std()
x['rate_pos'] = (x.ind - x.pg.map(pm)) / x.pg.map(psd) * x.mins / (x.mins + 400)
zs = lambda v: (v - v[ok].mean()) / v[ok].std()
x['overall'] = bell(0.5 * zs(x.rate_pos) + 0.5 * zs(x.wins_added))
x['team_net'] = (x.team_o + x.team_d) * 5
x.to_csv('win_v3_players.csv', index=False)
meta = {'version': 'v0.5', 'games_standard': G, 'replacement': repl, 'replacement_by_position': REPL, 'points_per_win': ppw, 'pool': int(ok.sum()),
        'val_2025': json.load(open('stage2_val.json')), 'final': {k: v for k, v in json.load(open('stage2_final.json')).items() if k != 'weights'}}
json.dump(meta, open('win_v3_meta.json', 'w'), indent=1, default=float)
print('repl', round(repl, 2), 'ppw', round(ppw, 1))
p = x[ok]
tv = p.groupby('team').now.transform('mean'); print('between-team share', round(tv.var() / p.now.var(), 2))
print(p.sort_values('win_score', ascending=False)[['name', 'team', 'now', 'g_team', 'g_own', 'g_bpm', 'g_box', 'g_rec', 'wins_added', 'win_score', 'proj']].head(15).round(2).to_string())
print('top 50 WIN by position', p.sort_values('win_score', ascending=False).head(50).pg.value_counts().to_dict(), 'top 100', p.sort_values('win_score', ascending=False).head(100).pg.value_counts().to_dict())
print('top 50 impact by position', p.sort_values('now', ascending=False).head(50).pg.value_counts().to_dict(), '| top 100', p.sort_values('now', ascending=False).head(100).pg.value_counts().to_dict(), '| pool', p.pg.value_counts(normalize=True).round(2).to_dict())
print(p.sort_values('now', ascending=False)[['name', 'team', 'pg', 'now', 'proj']].head(25).round(1).to_string())
print('growth by class', x.groupby('cls').dev.mean().round(2).to_dict(), 'move_adj range', x.move_adj.describe()[['min', 'max']].round(2).to_dict())
print(p[p.team == 'Boise St.'].sort_values('win_score', ascending=False)[['name', 'now', 'g_team', 'g_own', 'g_bpm', 'g_box', 'mins', 'wins_added', 'win_score', 'proj']].round(2).to_string())
