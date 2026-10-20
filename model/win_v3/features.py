"""Player features for predicting season s from everything known before it.
One row per (target season s, canonical id) for every player who appears in season s possessions,
plus one row per (s=2027, cid) for projecting next season.
History from season t = s-1 (box rates, stage-1 impact parts, Torvik BPM) and t-1 = s-2 (impact parts);
static / pre-season facts: height, class in s, age on Jan 1 of s, whether he changed teams."""
import numpy as np, pandas as pd, re, unicodedata
from pathlib import Path
P = Path('prep')
ps = pd.read_csv(P / 'ps.csv', dtype={'player_id': str})
s1 = pd.read_csv(P / 'stage1.csv')
tv = pd.read_csv(P / 'torvik.csv', dtype={'tpid': str})
def nk(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\b(jr|sr|ii|iii|iv)\b\.?', '', s); return re.sub(r'[^a-z]', '', s)
RATES = ['pts', 'fga', 'fta', 'tpa', 'tpm', 'ftm', 'fgm', 'ast', 'tov', 'orb', 'drb', 'stl', 'blk', 'pf', 'rima', 'rimm', 'fgm_ast']
# ---- box per (season, cid)
g = ps.groupby(['season', 'cid'])
box = g[RATES + ['o_poss', 'mins', 'tmins5', 'gp']].sum().reset_index()
meta = ps.sort_values('mins').groupby(['season', 'cid']).agg(name=('clean_name', 'last'), cls=('class', 'last'), pos=('position', 'last'), ht=('ht_inches', 'last'), team=('team', 'last')).reset_index()
box = box.merge(meta, on=['season', 'cid'])
box['share'] = box.mins / box.tmins5.replace(0, np.nan)
K = 300
for yr, grp in box.groupby('season'):
    lg = grp[RATES].sum() / grp.o_poss.sum() * 100
    for k in RATES: box.loc[grp.index, 'r_' + k] = (grp[k] * 100 + K * lg[k]) / (grp.o_poss + K)
box['r_ts'] = box.r_pts / (2 * (box.r_fga + 0.44 * box.r_fta))
box['r_3pct'] = (box.tpm + 0.34 * 60) / (box.tpa + 60)  # shrunk 3P%
box['r_ftpct'] = (box.ftm + 0.70 * 40) / (box.fta + 40)
box['lposs'] = np.log1p(box.o_poss)
# ---- Torvik join (name within season; team breaks ties)
tv['nk'] = tv.name.map(nk); box['nk'] = box.name.map(nk)
tvu = tv.drop_duplicates(['season', 'nk'], keep=False)
box = box.merge(tvu[['season', 'nk', 'tpid', 'bpm', 'obpm', 'dbpm', 'adjoe', 'adrtg', 'usg', 'minp', 'bdate']], on=['season', 'nk'], how='left')
print('torvik match', box.bpm.notna().mean().round(3), 'of player-seasons;', box[box.mins >= 200].bpm.notna().mean().round(3), 'of 200+ min')
# birthdate is static: carry it to every season of the player
bd = box.dropna(subset=['bdate']).groupby('cid').bdate.first()
box['bdate'] = box.cid.map(bd)
box = box.merge(s1, on=['season', 'cid'], how='left', suffixes=('', '_s1'))
box.to_csv(P / 'player_seasons.csv', index=False)

CLS = {'Fr.': 1, 'So.': 2, 'Jr.': 3, 'Sr.': 4, 'Gr.': 5, 'FR': 1, 'SO': 2, 'JR': 3, 'SR': 4}
HIST = ['own_o_2560', 'own_d_2560', 'own_o_10240', 'own_d_10240', 'team_o', 'team_d', 'bpm', 'obpm', 'dbpm', 'adjoe', 'adrtg', 'usg', 'share', 'lposs'] + ['r_' + k for k in RATES] + ['r_ts', 'r_3pct', 'r_ftpct']
rows = []
for s in range(2018, 2028):
    t = s - 1
    cur = box[box.season == s][['cid', 'team', 'cls', 'ht', 'bdate']] if s <= 2026 else None
    prev = box[box.season == t].set_index('cid')
    prev2 = box[box.season == t - 1].set_index('cid')
    # Career links the identity table missed (name changes like Moe -> Maurice): same Barttorvik
    # player id in consecutive seasons. Re-key those previous rows to this season's id.
    def relink(prv, cur_rows):
        if 'tpid' not in prv: return prv
        cur_t = box[box.season == s][['cid', 'tpid']].dropna() if s <= 2026 else None
        if cur_t is None: return prv
        miss = cur_t[~cur_t.cid.isin(prv.index)]
        bt = prv.reset_index().dropna(subset=['tpid']).drop_duplicates('tpid', keep=False).set_index('tpid')
        hit = miss[miss.tpid.isin(bt.index)]
        add = bt.loc[hit.tpid].reset_index(); add['cid'] = hit.cid.to_numpy()
        add = add[~add.cid.isin(prv.index)]
        relinked.append(len(add))
        return pd.concat([prv, add.set_index('cid')])
    relinked = []
    prev = relink(prev, None); prev2 = relink(prev2, None)
    if cur is None:  # projection rows for 2026-27: everyone who played in 2025-26
        cur = prev.reset_index()[['cid', 'team', 'cls', 'ht', 'bdate']].copy()
        cur['cls'] = cur.cls.map({'Fr.': 'So.', 'So.': 'Jr.', 'Jr.': 'Sr.', 'Sr.': 'Gr.'}).fillna(cur.cls)
    f = cur.copy(); f['s'] = s
    print(s, 'relinked by Torvik id:', relinked)
    f['hist'] = f.cid.isin(prev.index).astype(float)
    for c in HIST: f['h_' + c] = f.cid.map(prev[c]) if c in prev else np.nan
    f['h2'] = f.cid.isin(prev2.index).astype(float)
    for c in ['own_o_10240', 'own_d_10240', 'team_o', 'team_d', 'bpm']: f['h2_' + c] = f.cid.map(prev2[c])
    f['moved'] = ((f['hist'] == 1) & (f.cid.map(prev.team) != f.team)).astype(float)
    f['cls_n'] = f.cls.map(CLS)
    f['age'] = (pd.Timestamp(f'{s}-01-01') - pd.to_datetime(f.bdate, errors='coerce')).dt.days / 365.25
    rows.append(f)
F = pd.concat(rows, ignore_index=True)
F.to_csv(P / 'features.csv', index=False)
print(F.groupby('s').agg(n=('cid', 'size'), hist=('hist', 'mean'), moved=('moved', 'mean'), age=('age', lambda x: x.notna().mean())).round(3))
