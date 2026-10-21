"""Player roles (Bronco IQ role model v1) for every D-I player-season with 40+ minutes.
Roles: Point guard, Combo guard, Sniper, Wing, Forward, Stretch 4, Center, Stretch 5 (+ Unicorn tag).
1. Bigness = height + weight (ESPN; missing -> typical for his height) + rebounding + blocks + rim
   attempts - three-point rate - assists (each as a z-score).
2. In every lineup he played (offense and defense), the five players are ranked by bigness:
   1-2 = guard spots, 3 = wing, 4-5 = frontcourt, 5 = the biggest. His shares of each = where he plays.
3. Rules (in order):
   frontcourt spot most often and 6'6"+ -> biggest on the floor half the time? Center / Stretch 5 (30%+ of
     shots are threes and 4+ 3PA per 100) : Forward / Stretch 4 (38%+ threes and 5+ 3PA)
   Sniper: 55%+ of shots threes, 7+ 3PA per 100, under 4.5 assists; over 6'6" only if 75%+ threes
   Point guard: 6'6" or shorter; 6+ assists per 100, or 5+ at 6'4" and under with assists >= 25% of usage
   under 6'4" -> Combo guard;  6'10"+ -> Forward / Stretch 4;  everyone else -> Wing (6'4"-6'9")
4. Unicorn: skills far outside his size. Bigs (6'8"+): handling, threes and self-created shots above what his
   height and weight predict (+ half credit for big-man production); small players (6'4" and under):
   rebounding, blocks and rim finishing above his size. Score 2.4+ (about 2.5 sd) and usage 20%+.
Rates are per 100 offensive possessions, shrunk toward the D-I average (K = 300) in features.py."""
import json, re, sys, unicodedata, numpy as np, pandas as pd
S = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
nk = lambda s: re.sub(r'[^a-z]', '', re.sub(r'\b(jr|sr|ii|iii|iv)\b\.?', '', unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()))
PS = pd.read_csv('prep/player_seasons.csv', usecols=['season', 'cid', 'name', 'team', 'mins', 'ht', 'usg', 'r_pts', 'r_fga', 'r_tpa', 'r_ast', 'r_orb', 'r_drb', 'r_blk', 'r_rima', 'r_fgm', 'r_fgm_ast'])
P = PS[(PS.season == S)].sort_values('mins').drop_duplicates('cid', keep='last').copy()
E = pd.read_csv('/mnt/user-data/uploads/RECRUITING_HUB_V3/data/site_export/espn_rosters.csv'); E = E[E.season == S]
T = pd.read_csv('prep/tid_team.csv'); E['team_s'] = E.espn_team_id.map(dict(zip(T.tid, T.team)))
E['k'] = E.name.map(nk) + '|' + E.team_s.astype(str); P['k'] = P.name.map(nk) + '|' + P.team.astype(str)
P['wt'] = P.k.map(E.drop_duplicates('k').set_index('k').weight_lb); P = P.set_index('cid')
ok = P.wt.notna() & P.ht.notna(); b = np.polyfit(P.ht[ok], P.wt[ok], 1)
P['wt_f'] = P.wt.fillna(pd.Series(np.polyval(b, P.ht.fillna(77)), index=P.index)); P['ht_f'] = P.ht.fillna(77)
P['reb'] = P.r_orb + P.r_drb; P['rimr'] = (P.r_rima / P.r_fga).fillna(.39); P['tpar'] = (P.r_tpa / P.r_fga).fillna(.39)
P['selfc'] = (1 - P.r_fgm_ast / P.r_fgm).fillna(.5); P['ast'] = P.r_ast
z = lambda s: (s - s.median()) / s.std()
P['big'] = z(P.ht_f) + 0.8 * z(P.wt_f) + z(P.reb) + 0.8 * z(P.r_blk) + 0.6 * z(P.rimr) - 0.4 * z(P.tpar) - 0.3 * z(P.ast)
z2 = np.load(f'prep/poss_{S}.npz', allow_pickle=True)
L = np.concatenate([z2['O'], z2['D']]); uniq, inv = np.unique(L, return_inverse=True); inv = inv.reshape(L.shape)
bv = pd.Series(uniq).map(P.big).fillna(-9).to_numpy() + np.random.default_rng(0).normal(0, 1e-6, len(uniq))
rk = bv[inv].argsort(axis=1).argsort(axis=1) + 1
cnt = np.bincount(inv.ravel(), minlength=len(uniq)).astype(float)
sh = lambda m: pd.Series(np.bincount(inv.ravel(), weights=m.ravel().astype(float), minlength=len(uniq)) / np.maximum(cnt, 1), index=uniq)
for k, m in (('g_sh', rk <= 2), ('w_sh', rk == 3), ('f_sh', rk >= 4), ('five', rk == 5)): P[k] = P.index.map(sh(m)).fillna(0)
P['lposs'] = P.index.map(pd.Series(cnt, index=uniq)).fillna(0)
# unicorn score (size-adjusted skills), fit on rotation players
R = P[P.mins >= 300]
X = lambda D: np.c_[np.ones(len(D)), D.ht_f, D.wt_f]
def zres(c):
    be = np.linalg.lstsq(X(R), R[c].to_numpy(), rcond=None)[0]; sd = (R[c] - X(R) @ be).std()
    return (P[c] - X(P) @ be) / sd
for c in ['ast', 'tpar', 'selfc', 'reb', 'r_blk', 'rimr']: P['z_' + c] = zres(c)
P['guard_sk'] = (P.z_ast + P.z_tpar + P.z_selfc) / np.sqrt(3); P['big_sk'] = (P.z_reb + P.z_r_blk + P.z_rimr) / np.sqrt(3)
P['uni'] = np.where(P.ht_f >= 80, P.guard_sk + 0.5 * P.big_sk.clip(lower=0), np.where(P.ht_f <= 76, P.big_sk, np.nan))
def role(r):
    h = r.ht_f; usg = r.usg if pd.notna(r.usg) else 18
    slot = max([('G', r.g_sh), ('W', r.w_sh), ('F', r.f_sh)], key=lambda x: x[1])[0] if r.lposs >= 50 else ('F' if h >= 80 else 'W' if h >= 77 else 'G')
    sniper = r.tpar >= .55 and r.r_tpa >= 7 and r.ast < 4.5 and (h <= 78 or r.tpar >= .75)
    pg = h <= 78 and (r.ast >= 6 or (r.ast >= 5 and h <= 76 and r.ast / max(usg, 1) >= .25))
    if slot == 'F' and h >= 78:
        if r.five >= .5: return 'Stretch 5' if (r.tpar >= .30 and r.r_tpa >= 4) else 'Center'
        return 'Stretch 4' if (r.tpar >= .38 and r.r_tpa >= 5) else 'Forward'
    if sniper: return 'Sniper'
    if pg: return 'Point guard'
    if h <= 75: return 'Combo guard'
    if h >= 82: return 'Stretch 4' if r.tpar >= .38 else 'Forward'
    return 'Wing'
Q = P[P.mins >= 40].copy()
Q['role'] = Q.apply(role, axis=1)
Q['unicorn'] = (Q.uni >= 2.4) & (Q.usg >= 20) & (Q.mins >= 300)
Q['utype'] = np.where(Q.unicorn, np.where(Q.ht_f >= 80, 'big with guard skills', 'undersized big'), '')
print(Q[Q.mins >= 300].role.value_counts().to_dict()); print('unicorns', int(Q.unicorn.sum()), Q[Q.unicorn].name.tolist())
out = {c: [r.role, int(r.unicorn), r.utype, round(float(r.g_sh), 2), round(float(r.w_sh), 2), round(float(r.f_sh), 2), round(float(r.five), 2), int(r.mins)] for c, r in Q.iterrows()}
season = f'{S - 1}-{str(S)[2:]}'
json.dump({'season': season, 'model': 'role model v1', 'cols': ['role', 'unicorn', 'utype', 'guard', 'wing', 'front', 'five', 'min'], 'roles': out},
          open(f'/home/claude/bsuiq/data-src/roles-{season}.json', 'w'), separators=(',', ':'))
print('players', len(out))
