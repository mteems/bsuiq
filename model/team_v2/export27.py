import warnings; warnings.filterwarnings('ignore')
import numpy as np, pandas as pd, json
src=open('team/team_backtest.py').read(); src=src[:src.index('out = []')]
exec(src)
# game residual sd + home edge for model D (walk-forward predictions)
F=['netC','hist3','ret']
out=[]
for s in range(2020,2027):
    b=fitmin(PM[PM.s<s]) if s>2020 else fitmin(PM[PM.s<=2019]); D_=predmin(PM[PM.s==s],b)
    D_=D_.assign(crk=D_.groupby('team').mp.rank(ascending=False,method='first').astype(int)); D_['cm']=[CURVE[k-1]/40 if k<=15 else 0 for k in D_.crk]
    out.append(D_.groupby('team').apply(lambda g: float((g.imp*g.cm).sum()/5),include_groups=False).rename('netC').reset_index().assign(s=s))
T2=T.merge(pd.concat(out),on=['s','team']); T2['hist3']=T2.hist3.fillna(T2['last']).fillna(T2.groupby('s')['last'].transform('min')); T2['ret']=T2.ret.fillna(0)
errs=[]
for s in range(2021,2027):
    tr=T2[(T2.s<s)]; te=T2[T2.s==s]
    X=np.c_[np.ones(len(tr)),tr[F]]; b=np.linalg.lstsq(X,tr.actual,rcond=None)[0]; pr=dict(zip(te.team,np.c_[np.ones(len(te)),te[F]]@b))
    g=GAMES[s]; g=g[g.home.isin(pr)&g.away.isin(pr)]; d=g.home.map(pr)-g.away.map(pr)
    h=(g.m-d).mean(); errs.append(g.m-d-h)
e=pd.concat(errs); print('game sd',e.std().round(2),'mae',e.abs().mean().round(2))
X=np.c_[np.ones(len(T2)),T2[F]]; b=np.linalg.lstsq(X,T2.actual,rcond=None)[0]; print('coef',dict(zip(['int']+F,b.round(4))))
home=np.mean([ (GAMES[s].m).mean() for s in range(2022,2027)]); print('raw home margin',round(home,2))
# history for 2026-27
tid=pd.read_csv('prep/tid_team.csv'); m26=PS[PS.season==2026]
H={}
for r in tid.itertuples():
    t=r.team; last=RAT[2026].get(t); h3=np.nanmean([RAT[y].get(t,np.nan) for y in (2024,2025,2026)])
    if last is None: continue
    mm=m26[m26.team==t]; H[str(r.tid)]={'team':t,'last':round(float(last),2),'hist3':round(float(h3),2),'m26':{c:round(float(v),1) for c,v in zip(mm.cid,mm.mins)}}
json.dump({'coef':dict(zip(['int']+F,[round(float(x),4) for x in b])),'minutes':{'MF':MF,'b':[round(float(x),5) for x in fitmin(PM)]},'game_sd':round(float(e.std()),2),'home':2.2,'teams':H},open('/home/claude/bsuiq/data-src/team-model-2027.json','w'))
print(len(H))
