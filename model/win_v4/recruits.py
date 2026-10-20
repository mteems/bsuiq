"""Link RSCI top 100 (2016-2025 classes), 247Sports Composite top 100 (2016-2026) and NBA drafts
(2017-2026) to canonical player ids. A high-school class of Y plays its freshman season in Y+1
(season end year); we look for the name in Y+1, then Y+2 (redshirts / reclassification)."""
import pandas as pd, numpy as np, re, unicodedata, glob, csv
from pathlib import Path
R = Path('../recruit'); P = Path('prep')
def nk(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    s = s.replace('"', ' ').replace('“', ' ').replace('”', ' ')
    s = re.sub(r'\b(jr|sr|ii|iii|iv)\b\.?', '', s); return re.sub(r'[^a-z]', '', s)
def sk(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    s = s.replace('university', '').replace('state', 'st').replace('saint', 'st').replace('unc', 'north carolina')
    return re.sub(r'[^a-z]', '', s)[:6]
rows = []
for f in sorted(glob.glob(str(R / 'rsci_*'))):
    y = int(re.search(r'(\d{4})', f).group(1))
    if f.endswith('.csv'):
        for r in csv.DictReader(open(f)): rows.append(dict(cls=y, name=r['Player'], rsci=int(re.sub(r'\D', '', r['RSCI'])), college=r['College'], rdraft=r['DraftYear'] or None, rpick=r['Pick'] or None))
    else:
        for line in open(f):
            p = line.rstrip('\n').split('|')
            if len(p) >= 5: rows.append(dict(cls=y, name=p[1], rsci=int(re.sub(r'\D', '', p[0])), college=p[4].strip(), rdraft=p[2] or None, rpick=p[3] or None))
rs = pd.DataFrame(rows)
c = []
for f in sorted(glob.glob(str(R / 'c247_*.psv'))):
    y = int(re.search(r'(\d{4})', f).group(1))
    for line in open(f):
        p = line.rstrip('\n').split('|')
        if y in (2016, 2017): c.append(dict(cls=y, name=p[1], r247=int(p[0]), s247=float(p[4])))
        elif y == 2026: c.append(dict(cls=y, name=p[1], r247=int(p[0]), s247=float(p[2]), college=p[3]))
        else: c.append(dict(cls=y, name=p[1], r247=int(p[0]), s247=float(p[2])))
c247 = pd.DataFrame(c)
rs['nk'] = rs.name.map(nk); c247['nk'] = c247.name.map(nk)
rec = rs.merge(c247[['cls', 'nk', 'r247', 's247', 'name']].rename(columns={'name': 'name247'}), on=['cls', 'nk'], how='outer')
rec['name'] = rec.name.fillna(rec.name247)
# a recruit missing from one list: keep him; impute 247 score from RSCI rank (fit below) later
B = pd.read_csv(P / 'player_seasons.csv', usecols=['season', 'cid', 'name', 'team', 'cls', 'mins'])
B['nk'] = B.name.map(nk)
first = B.sort_values('season').drop_duplicates('cid')  # each player's first D-I season in our data
def find(r):
    for s in (r.cls + 1, r.cls + 2):
        h = B[(B.season == s) & (B.nk == r.nk)]
        if len(h) > 1 and isinstance(r.get('college'), str) and r.college:
            h2 = h[h.team.map(sk) == sk(r.college)]
            if len(h2): h = h2
        if len(h) >= 1:
            h = h.sort_values('mins', ascending=False).iloc[0]
            # only take it if it's his first season with us (avoids matching a different, older player)
            if first.set_index('cid').season.get(h.cid) == s: return pd.Series({'cid': h.cid, 'first_season': s, 'team1': h.team})
    return pd.Series({'cid': None, 'first_season': None, 'team1': None})
m = rec.apply(find, axis=1); rec = pd.concat([rec, m], axis=1)
print('recruits', len(rec), 'linked', rec.cid.notna().sum(), rec.groupby('cls').cid.apply(lambda x: f'{x.notna().sum()}/{len(x)}').to_dict())
# NBA drafts: link to the player's last college season (draft year = season end year)
d = []
for f in sorted(glob.glob(str(R / 'draft' / 'd*.psv'))):
    y = int(re.search(r'(\d{4})', f).group(1))
    for line in open(f):
        p = line.rstrip('\n').split('|')
        if len(p) >= 3 and p[1]: d.append(dict(draft=y, pick=int(p[0]), name=p[1], college=p[2]))
D = pd.DataFrame(d); D['nk'] = D.name.map(nk)
def dfind(r):
    if not r.college: return None
    h = B[(B.season == r.draft) & (B.nk == r.nk)]
    if len(h) > 1: h = h[h.team.map(sk) == sk(r.college)]
    if len(h) == 0:  # name spelled differently: same school, same season, last name match
        last = nk(r['name'].split()[-1]) if r['name'].split() else ''
        h = B[(B.season == r.draft) & (B.team.map(sk) == sk(r.college)) & B.nk.str.endswith(last)]
    return h.sort_values('mins', ascending=False).cid.iloc[0] if len(h) == 1 else None
D['cid'] = D.apply(dfind, axis=1)
col = D[D.college != '']
print('drafted from college', len(col), 'linked', col.cid.notna().sum())
print('unlinked sample', col[col.cid.isna()][['draft', 'name', 'college']].head(15).values.tolist())
rec = rec.merge(D[['cid', 'draft', 'pick']].dropna(subset=['cid']), on='cid', how='left')
rec['draft'] = rec.draft.fillna(pd.to_numeric(rec.rdraft, errors='coerce')); rec['pick'] = rec.pick.fillna(pd.to_numeric(rec.rpick, errors='coerce'))
rec.to_csv(P / 'recruits.csv', index=False); D.to_csv(P / 'draft.csv', index=False)
