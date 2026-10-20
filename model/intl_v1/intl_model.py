"""International incoming-player model, phase 1.
Who: D-I players 2017-18..2025-26 whose hometown is outside the U.S. (Barttorvik / roster hometown),
in their first D-I season. Outcome: Talent / 100 at the end of that first season (Overall model v1),
weighted by minutes (more minutes = more reliable). Features known before they arrive: age, height,
position group, home region, class at entry (freshman vs. older: pro / JUCO / post-grad), whether he
came through a U.S. prep school, and recruiting rank (RSCI / 247 top 100) if any.
Validation: leave-one-season-out (each season predicted by a model fit on the other seasons)."""
import pandas as pd, numpy as np, re, json
S = pd.read_csv('/mnt/user-data/uploads/RECRUITING_HUB_V3/data/site_export/player_team_seasons_all.csv', usecols=['season', 'canonical_player_id', 'player_name', 'team', 'hometown', 'high_school', 'class', 'minutes'], low_memory=False)
S = S.rename(columns={'canonical_player_id': 'cid'})
B = pd.read_csv('prep/player_seasons.csv', usecols=['season', 'cid', 'ht', 'bdate', 'pg', 'mins'], low_memory=False).drop_duplicates(['season', 'cid'])
O = pd.read_csv('ovr/overall_final.csv')
REC = pd.read_csv('prep/recruits.csv').dropna(subset=['cid']).drop_duplicates('cid').set_index('cid'); REC['rank'] = REC[['rsci', 'r247']].min(axis=1)
US = set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split())
CAN = {'ON', 'PQ', 'QC', 'BC', 'AB', 'MB', 'NS', 'SK', 'NB', 'NL', 'PE', 'Canada', 'Ontario', 'Quebec'}
AFR = {'Nigeria', 'Senegal', 'Mali', 'South Sudan', 'Cameroon', 'Congo', 'Guinea', 'Ghana', 'Egypt', 'Angola', 'the Democratic Republic of the', 'Ivory Coast', "Cote d'Ivoire", 'Kenya', 'Sudan', 'Uganda', 'Gabon', 'Chad', 'Burkina Faso', 'Benin', 'Togo', 'Rwanda', 'Tanzania', 'Morocco', 'Tunisia', 'Ethiopia', 'Central African Republic', 'Cape Verde', 'Liberia', 'Sierra Leone', 'Gambia', 'Zimbabwe', 'South Africa', 'Mozambique', 'Niger', 'Eritrea', 'Somalia'}
OCE = {'Australia', 'New Zealand', 'Fiji', 'Samoa', 'Tonga', 'Guam'}
AME = {'Puerto Rico', 'Dominican Republic', 'Bahamas', 'Brazil', 'Jamaica', 'U.S. Virgin Islands', 'Argentina', 'Mexico', 'Venezuela', 'Colombia', 'Haiti', 'Trinidad and Tobago', 'Panama', 'Uruguay', 'Chile', 'Cuba', 'Virgin Islands', 'Barbados', 'Bermuda', 'Costa Rica', 'Honduras', 'Ecuador', 'Peru'}
ASI = {'China', 'Japan', 'Philippines', 'South Korea', 'Korea', 'Taiwan', 'India', 'Iran', 'Lebanon', 'Jordan', 'Qatar', 'Kazakhstan', 'Indonesia', 'Thailand'}
EUR = {'Serbia', 'France', 'England', 'Netherlands', 'Germany', 'Lithuania', 'Spain', 'Italy', 'Sweden', 'Finland', 'Turkey', 'Croatia', 'Greece', 'United Kingdom', 'Latvia', 'Belgium', 'Slovenia', 'Ireland', 'Switzerland', 'Russia', 'Yugoslavia', 'Montenegro', 'Estonia', 'Israel', 'Ukraine', 'Czech Republic', 'Poland', 'Denmark', 'Iceland', 'Slovakia', 'Bosnia-Herzegovina', 'Bosnia and Herzegovina', 'Austria', 'Norway', 'Portugal', 'Hungary', 'Scotland', 'Wales', 'Bulgaria', 'Romania', 'North Macedonia', 'Macedonia', 'Belarus', 'Georgia (country)', 'Albania', 'Kosovo', 'Luxembourg', 'Cyprus', 'Czechia', 'Moldova', 'Armenia', 'Azerbaijan', 'Malta', 'Northern Ireland', 'Holland'}
def region(h):
    h = str(h or '').strip(); tail = h.split(',')[-1].strip() if ',' in h else h
    if not tail or tail in US: return None
    if tail in CAN: return 'Canada'
    if tail in AFR: return 'Africa'
    if tail in OCE: return 'Oceania'
    if tail in AME: return 'Americas'
    if tail in ASI: return 'Asia'
    if tail in EUR: return 'Europe'
    return None
STATE_PAREN = re.compile(r'\((Ind|Calif|Tenn|Fla|Ga|Texas|Tex|N\.?C|Va|Md|Pa|Ariz|AZ|Utah|Kan|Mo|Ohio|Mich|Ill|N\.?Y|N\.?J|Conn|Mass|Maine|N\.?H|Wis|Minn|Ore|Wash|Nev|Colo|Okla|La|Ala|Miss|Ky|S\.?C|Del|R\.?I|Vt|W\.?Va|Iowa|Neb|Fl|CA|TX|FL|NC|VA|MD|PA)\.?\)')
USPREP = re.compile(r'(Montverde|IMG|La Lumiere|Prolific|Oak Hill|Sunrise Christian|Brewster|Putnam|Wasatch|Bella Vista|Link Academy|Hillcrest|Huntington Prep|Findlay|Greenforest|Mater Dei|Compass Prep|Combine Academy|Victory Rock|Dream City|SPIRE|Woodstock|Hargrave|Fork Union|Blair Academy|Brewster|Kimball Union|Phelps|Notre Dame Prep|Wilbraham|Tilton|Bridgton|Vermont Academy|Northfield|Lutheran|Christian|Prep\b|High School\b)', re.I)
def via_us(hs):
    hs = str(hs or '')
    if not hs or hs == 'nan': return 0
    if STATE_PAREN.search(hs): return 1
    if re.search(r'(College|Centre|Gymnas|Lyc|Instituto|Liceo|Akadem|Academy of Excellence|Grammar|Secondary)', hs, re.I): return 0
    return int(bool(USPREP.search(hs)))
S['region'] = S.hometown.map(region)
first = S.sort_values('season').drop_duplicates('cid')            # first season with us
I = first[first.region.notna() & (first.season >= 2018)].copy()
I['via_us'] = I.high_school.map(via_us)
I['older'] = (~I['class'].fillna('').str.startswith('Fr')).astype(int)
I = I.merge(B, on=['season', 'cid'], how='left').merge(O[['season', 'cid', 'tal', 'mins']].rename(columns={'mins': 'm2'}), on=['season', 'cid'], how='left')
I['age'] = (pd.to_datetime(I.season.astype(str) + '-01-01') - pd.to_datetime(I.bdate, errors='coerce')).dt.days / 365.25
I['rk'] = I.cid.map(REC['rank']); I['ranked'] = I.rk.notna().astype(int); I['lrk'] = np.where(I.ranked == 1, np.log(I.rk.fillna(150)) - np.log(150), 0)
I = I.dropna(subset=['tal'])
I['w'] = np.clip(I.mins.fillna(0) / 600, 0.05, 1)
for r in ['Europe', 'Africa', 'Oceania', 'Canada', 'Americas', 'Asia']: I['r_' + r] = (I.region == r).astype(float)
I['age_f'] = I.age.fillna(I.age.median()); I['age_na'] = I.age.isna().astype(float)
I['ht_f'] = I.ht.fillna(I.ht.median()); I['pgG'] = (I.pg == 'G').astype(float); I['pgC'] = (I.pg == 'C').astype(float)
I['older_x_age'] = I.older * (I.age_f - 20)
FEAT = ['age_f', 'age_na', 'ht_f', 'pgG', 'pgC', 'older', 'older_x_age', 'via_us', 'ranked', 'lrk', 'r_Africa', 'r_Oceania', 'r_Canada', 'r_Americas', 'r_Asia']
def fit(df, lam=5.0):
    X = df[FEAT].to_numpy(float); mu, sd = X.mean(0), X.std(0) + 1e-9; Z = (X - mu) / sd
    W = df.w.to_numpy(); y = df.tal.to_numpy()
    A = np.c_[np.ones(len(Z)), Z]; Wm = A.T * W
    beta = np.linalg.solve(Wm @ A + np.diag([0] + [lam] * len(FEAT)), Wm @ y)
    return beta, mu, sd
def pred(m, df): beta, mu, sd = m; return np.c_[np.ones(len(df)), (df[FEAT].to_numpy(float) - mu) / sd] @ beta
I['cv'] = np.nan
for s in sorted(I.season.unique()):
    tr, te = I[I.season != s], I.season == s
    I.loc[te, 'cv'] = pred(fit(tr), I[te])
q = I[I.mins >= 200]
base = np.average(I.tal, weights=I.w)
wr = lambda a, b, w: np.cov(a, b, aweights=w)[0, 1] / np.sqrt(np.cov(a, a, aweights=w)[0, 1] * np.cov(b, b, aweights=w)[0, 1])
res = {'n_players': int(len(I)), 'n_200min': int(len(q)), 'by_region': I.region.value_counts().to_dict(),
       'cv_r_200min': round(float(np.corrcoef(q.cv, q.tal)[0, 1]), 3), 'cv_r_weighted_all': round(float(wr(I.cv, I.tal, I.w)), 3),
       'mae_model_200': round(float(np.abs(q.cv - q.tal).mean()), 2), 'mae_baseline_200': round(float(np.abs(base - q.tal).mean()), 2)}
M = fit(I); beta = dict(zip(['intercept'] + FEAT, np.round(M[0], 3).tolist()))
res['weights_per_sd'] = beta
# What each feature means in plain units (refit on raw scale for a readable table)
print(json.dumps(res, indent=1))
print(I.groupby('region').agg(n=('tal', 'size'), tal=('tal', 'mean'), mins=('mins', 'mean'), via_us=('via_us', 'mean')).round(2))
print(I.groupby('older').agg(n=('tal', 'size'), tal=('tal', 'mean'), mins=('mins', 'mean')).round(2))
top = I.sort_values('cv', ascending=False)[['season', 'player_name', 'team', 'region', 'age', 'ht', 'older', 'via_us', 'rk', 'cv', 'tal', 'mins']].head(15)
print(top.round(1).to_string())
I.to_csv('intl/intl_training.csv', index=False)
json.dump({'feat': FEAT, 'beta': M[0].tolist(), 'mu': M[1].tolist(), 'sd': M[2].tolist(), 'cv': res}, open('intl/intl_model.json', 'w'), indent=1)
