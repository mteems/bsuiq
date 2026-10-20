"""Overall score from Talent / 100: value = (talent - replacement at his position) x share of team
minutes; Overall = bell scale of value among 200+ minute players each season. Writes overall_final.csv
(import with scripts/import-overall.mjs). Run after publish.py, from the pipeline folder."""
import pandas as pd, numpy as np
from scipy.stats import norm
H = pd.read_csv('ovr/overall_v1.csv')
B = pd.read_csv('prep/player_seasons.csv', usecols=['season', 'cid', 'share'], low_memory=False).drop_duplicates(['season', 'cid'])
H = H.merge(B, on=['season', 'cid'], how='left'); out = []
for s, x in H.groupby('season'):
    x = x.copy(); ok = x.mins >= 200
    x['value'] = (x.rating - x.pg.map(x[ok].groupby('pg').rating.quantile(.15))) * x.share.clip(0, 1)
    pct = (x.value.where(ok).rank() - .5) / ok.sum(); x['ovr'] = np.where(ok, np.clip(50 + 13.5 * norm.ppf(pct.fillna(.5)), 1, 99), np.nan)
    c = np.average(x.rating[ok], weights=x.mins[ok]); co = np.average(x.rating_o[ok], weights=x.mins[ok])
    x['tal'] = x.rating - c; x['talo'] = x.rating_o - co; x['tald'] = x.tal - x.talo; out.append(x)
X = pd.concat(out).rename(columns={'value': 'oval'})
X[['season', 'cid', 'ovr', 'tal', 'talo', 'tald', 'oval', 'pg', 'mins']].to_csv('ovr/overall_final.csv', index=False)
