import json, numpy as np, pandas as pd, importlib.util
spec = importlib.util.spec_from_file_location('m', 'intl/intl_v1.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
TB = {'A': 1.0, 'R': 0.1, 'B': 0.0, 'S': -0.3, 'C': -0.6}
Fx = m.feats(m.M, TB); D = m.I.join(Fx.loc[m.I.index]); F = m.BASE + m.NEW
r0, p0 = m.cv(D, m.BASE); r1, p1 = m.cv(D, F)
q = (D.mins >= 200) & (D.fiba == 1)
fib = {'r_v01': round(float(np.corrcoef(p0[q], D.tal[q])[0, 1]), 3), 'r_v1': round(float(np.corrcoef(p1[q], D.tal[q])[0, 1]), 3), 'n': int(q.sum())}
# by region (200+ min)
reg = {}
for r, g in D[D.mins >= 200].groupby('region'):
    reg[r] = {'n': len(g), 'fiba_share': round(float(g.fiba.mean()), 2), 'r_v01': round(float(np.corrcoef(p0[g.index], g.tal)[0, 1]), 2), 'r_v1': round(float(np.corrcoef(p1[g.index], g.tal)[0, 1]), 2)}
mod = m.fit(D, F)
print('v0.1', r0); print('v1', r1); print('FIBA players', fib); print(reg)
# prospects (entering 2027-28)
B = json.load(open('/home/claude/bsuiq/data-src/intl/board.json'))['players']
REG = {'Spain': 'Europe', 'Germany': 'Europe', 'New Zealand': 'Oceania', 'DR Congo': 'Africa'}
P = []
for k, p in enumerate(B):
    i = 1295 + k; ft, inch = p['ht'].split('-'); ht = int(ft) * 12 + int(inch)
    age = (pd.Timestamp('2028-01-01') - pd.Timestamp(p['born'])).days / 365.25
    pos = p['pos'].upper(); pg = 'C' if pos.startswith('C') or (pos.startswith('F') and ht >= 82) else 'G' if pos.startswith('G') or pos == 'PG' else 'F'
    region = REG.get(p['nat'], 'Europe'); row = {'age_f': age, 'age_na': 0, 'ht_f': ht, 'pgG': float(pg == 'G'), 'pgC': float(pg == 'C'), 'older': 0, 'older_x_age': 0,
          'via_us': 1 if 'Utah' in (p.get('city') or '') else 0, 'ranked': 0, 'lrk': 0}
    for r in ['Africa', 'Oceania', 'Canada', 'Americas', 'Asia']: row['r_' + r] = float(region == r)
    for c in m.NEW: row[c] = float(Fx.loc[i, c]) if i in Fx.index else 0.0
    pr = float(m.pred(mod, pd.DataFrame([row]), F)[0]); P.append({'name': p['name'], 'proj': round(pr, 2), 'fiba': row['fiba'], 'f_avg': round(row['f_avg'], 2)})
print(P)
json.dump({'feat': F, 'beta': mod[0].tolist(), 'mu': mod[1].tolist(), 'sd': mod[2].tolist(), 'tier_bonus': TB, 'cv_v01': r0, 'cv_v1': r1, 'fiba_players': fib, 'by_region': reg,
           'n': int(len(D)), 'n_fiba': int(D.fiba.sum()), 'prospects': P}, open('intl/intl_model_v1.json', 'w'), indent=1)
