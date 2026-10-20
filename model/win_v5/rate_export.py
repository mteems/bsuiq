"""Win v0.5 Win + Overall scores for every season 2016-17..2025-26 (same rules as export.py),
from the rating rows (rate_apply.py). Writes win_hist.csv."""
import pandas as pd, numpy as np
from scipy.stats import norm
R = pd.read_csv('prep/rate_rows.csv')
B = pd.read_csv('prep/player_seasons.csv', usecols=['season', 'cid', 'name', 'team', 'mins', 'o_poss', 'pg'], low_memory=False)
out = []
for Y, x in R.groupby('season'):
    b = B[B.season == Y].drop_duplicates('cid').set_index('cid')
    x = x.join(b[['name', 'mins', 'o_poss', 'pg']], on='cid').copy()
    x['pg'] = x.pg.fillna('F'); x['now'] = x.now_o + x.now_d
    ok = x.mins >= 200; pool = x[ok]
    c = np.average(pool.now, weights=pool.mins); co = np.average(pool.now_o, weights=pool.mins)
    x['now'] -= c; x['now_o'] -= co; x['now_d'] -= c - co
    for g in ['g_team', 'g_own', 'g_bpm', 'g_box', 'g_rec', 'g_static']: x[g] -= np.average(pool[g], weights=pool.mins)
    x['team_bpm'] = x.groupby('team').g_bpm.transform('mean')
    x['ind'] = x.now - x.g_team - 0.5 * x.team_bpm
    pool = x[ok]; x['ind'] -= np.average(pool.ind, weights=pool.mins); pool = x[ok]
    REPL = pool.groupby('pg').ind.quantile(.15).to_dict()
    s = pd.read_csv(f'csv/schedule_{Y}.csv'); r = pd.read_csv(f'csv/rosters_{Y}.csv'); T = set(r.team)
    g = s[s.home.isin(T) & s.away.isin(T)]
    tg = pd.concat([pd.DataFrame({'t': g.home, 'm': g.home_score - g.away_score}), pd.DataFrame({'t': g.away, 'm': g.away_score - g.home_score})])
    agg = tg.groupby('t').agg(m=('m', 'mean'), w=('m', lambda v: (v > 0).mean())); ppw = 1 / np.polyfit(agg.m, agg.w, 1)[0]
    tgames = pd.concat([g.home, g.away]).value_counts(); G = float(tgames.median())
    x['poss_std'] = x.o_poss * G / x.team.map(tgames).fillna(G)
    x['pts_over_repl'] = (x.ind - x.pg.map(REPL)) * x.poss_std / 100; x['wins_added'] = x.pts_over_repl / ppw
    def bell(v):
        pct = (v.where(ok).rank() - .5) / ok.sum()
        return np.where(ok, np.clip(50 + 13.5 * norm.ppf(pct.fillna(.5)), 1, 99), np.nan)
    x['win_score'] = bell(x.wins_added)
    pm = x[ok].groupby('pg').ind.mean(); psd = x[ok].groupby('pg').ind.std()
    x['rate_pos'] = (x.ind - x.pg.map(pm)) / x.pg.map(psd) * x.mins / (x.mins + 400)
    zs = lambda v: (v - v[ok].mean()) / v[ok].std()
    x['overall'] = bell(0.5 * zs(x.rate_pos) + 0.5 * zs(x.wins_added))
    out.append(x[['season', 'cid', 'name', 'team', 'mins', 'pg', 'now', 'now_o', 'now_d', 'ind', 'wins_added', 'pts_over_repl', 'win_score', 'overall', 'g_team', 'g_own', 'g_bpm', 'g_box', 'g_rec']])
    t = x[ok].sort_values('overall', ascending=False)
    print(Y, 'pool', int(ok.sum()), 'ppw', round(ppw, 1), 'G', G, '| top:', ', '.join(f'{a} ({b})' for a, b in t[['name', 'team']].head(5).values))
H = pd.concat(out); H.to_csv('win_hist.csv', index=False)
cur = pd.read_csv('win_v3_players.csv')
m = H[H.season == 2026].merge(cur[['cid', 'overall', 'win_score']], on='cid', suffixes=('', '_cur'))
print('2025-26 check vs current export: r overall', round(np.corrcoef(m.overall.fillna(0), m.overall_cur.fillna(0))[0, 1], 4), 'max abs diff', round((m.overall - m.overall_cur).abs().max(), 2))
print(H[H.team == 'Boise St.'].sort_values(['season', 'overall'], ascending=[True, False]).groupby('season').head(2)[['season', 'name', 'overall', 'win_score']].round(1).to_string())
