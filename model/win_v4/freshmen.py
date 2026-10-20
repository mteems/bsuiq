"""Freshman projections for the 2026 class (2026-27 freshmen) and a 10-year calibration by recruit rank."""
import pandas as pd, numpy as np, json, re
F = pd.read_csv('prep/projections.csv', low_memory=False); X = pd.read_csv('win_v3_players.csv', low_memory=False)
B = pd.read_csv('prep/player_seasons.csv', low_memory=False)
# centering constant used for the site (minutes-weighted 2025-26 average player = 0)
r27 = F[F.s == 2027].join(B.query('season==2026').set_index('cid')[['mins']], on='cid'); p = r27[r27.mins >= 200]
c = np.average(p.now_o + p.now_d, weights=p.mins)
# model's pre-season projection for ranked freshmen, all target seasons; learn a compact map rank/height -> projection
fr = F[(F['hist'] == 0) & (F.ranked == 1) & (F.rec_yrs == 0) & (F.s <= 2026)].copy()
fr['pred'] = fr.proj_o + fr.proj_d - c; fr['lr'] = np.log(fr.rec_rank)
A = np.column_stack([np.ones(len(fr)), fr.lr, fr.ht.fillna(fr.ht.median())])
coef, *_ = np.linalg.lstsq(A, fr.pred, rcond=None)
fr_o = np.linalg.lstsq(A, fr.proj_o - np.average(p.now_o, weights=p.mins), rcond=None)[0]
# 2026 class (247 Composite)
rows = []
for line in open('../recruit/c247_2026.psv'):
    q = line.rstrip('\n').split('|'); ft, inch = q[5].split('-'); ht = int(ft) * 12 + float(inch); rk = int(q[0])
    v = float(coef @ [1, np.log(rk), ht]); vo = float(fr_o @ [1, np.log(rk), ht])
    rows.append(dict(rank=rk, name=q[1], score=float(q[2]), school=q[3], pos=q[4], ht=q[5], proj=round(v, 1), proj_o=round(vo, 1), proj_d=round(v - vo, 1)))
# calibration: what each rank band became (classes 2016-2022 for draft, 2016-2025 for freshman impact)
R = pd.read_csv('prep/recruits.csv'); R['rank'] = R[['rsci', 'r247']].min(axis=1)
nowmap = {}
for s in range(2018, 2028):  # talent at the end of each season = rows of the next target season
    q = F[F.s == s].set_index('cid'); nowmap[s - 1] = (q.now_o + q.now_d) - c
fy = R.dropna(subset=['cid']).copy()
fy['fr_impact'] = [nowmap.get(int(s), pd.Series(dtype=float)).get(cid, np.nan) if pd.notna(s) else np.nan for cid, s in zip(fy.cid, fy.first_season)]
mins = B.set_index(['cid', 'season']).mins
fy['fr_mpg'] = [B[(B.cid == cid) & (B.season == s)].eval('mins/gp').max() if pd.notna(s) else np.nan for cid, s in zip(fy.cid, fy.first_season)]
bands = [(1, 5), (6, 10), (11, 25), (26, 50), (51, 75), (76, 130)]
cal = []
for lo, hi in bands:
    g = R[(R['rank'] >= lo) & (R['rank'] <= hi)]; g7 = g[g.cls <= 2022]; f = fy[(fy['rank'] >= lo) & (fy['rank'] <= hi)]
    cal.append(dict(band=f'{lo}-{hi}' if hi < 130 else f'{lo}+', n=int(len(g)), drafted=round(float(g7.draft.notna().mean()) * 100), first_round=round(float((g7.pick <= 30).mean()) * 100), one_and_done=round(float((g7.draft == g7.cls + 1).mean()) * 100),
                    fr_mpg=round(float(f.fr_mpg.median()), 1), fr_impact=round(float(f.fr_impact.median()), 1), fr_impact_p75=round(float(f.fr_impact.quantile(.75)), 1)))
out = {'season': '2026-27', 'source': '247Sports Composite (class of 2026); calibration: RSCI + 247 top 100, classes 2016-2025; NBA drafts 2017-2026',
       'map': {'intercept': coef[0], 'log_rank': coef[1], 'height_in': coef[2]}, 'rows': rows, 'calibration': cal}
json.dump(out, open('freshmen-2026-27.json', 'w'), indent=1, default=float)
print(pd.DataFrame(cal).to_string()); print(pd.DataFrame(rows).head(12).to_string()); print('map', coef.round(3))
