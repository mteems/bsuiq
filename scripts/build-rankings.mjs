// Builds the Rankings tables from the RStudio exports (data/site_export/).
//   node scripts/build-rankings.mjs <site_export folder>
// Reads:  player_team_seasons_all.csv (or player_team_seasons_2026.csv)
//         team_season_totals.csv        (optional: REB%, AST%, USG%, STL%, BLK%)
//         team_strength_adjusted.csv    (team adjusted defensive ratings, for the DEF score)
//         torvik/players_<year>.csv     (Barttorvik: DBPM, Adj DRtg, STL%, BLK%, DRB%, role)
//         player_skill_components_2026_v1_1.csv
// Writes: data-src/rankings/national-<season>.json every D-I player with 50+ min, each season
//         data-src/rankings/bsu-last10.json         every Boise St. player-season, last 10 seasons
//         data-src/rankings/index.json              seasons + backtest numbers
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseCSV } from "./lib-csv.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/build-rankings.mjs <site_export folder>"); process.exit(1); }
const read = (f) => (existsSync(join(dir, f)) ? parseCSV(readFileSync(join(dir, f), "utf8")) : null);
const n = (v) => (v === "" || v === "NA" || v == null || isNaN(+v) ? null : +v);
const rd = (v, d = 1) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const per = (a, b) => (a == null || !b ? null : a / b);
const seasonLabel = (y) => `${y - 1}-${String(y).slice(2)}`;

const players = read("player_team_seasons_all.csv") || read("player_team_seasons_2026.csv");
const teams = read("team_season_totals.csv");
const skills = read("player_skill_components_2026_v1_1.csv") || [];

// Team totals keyed by season|team id. "mins" in the team-game table is game
// minutes (40 + OT); team player-minutes = 5x that.
const T = new Map();
for (const t of teams || []) {
  const g = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, n(v) ?? v]));
  T.set(`${t.season}|${t.team_ncaa_team_id}`, g);
}
const S = new Map();
for (const s of skills) S.set(`${s.season}|${s.canonical_player_id}|${s.team_ncaa_team_id}`, s);

// Column order for every rankings file.
const COLS = [
  "name", "id", "season", "team", "conf", "cls", "pos", "ht", "gp", "min", "mpg",
  // scoring
  "ppg", "pts40", "ts", "efg", "usg", "fga40", "p3", "tpa40", "tpar", "ftr", "ft", "rim", "rimr", "mid", "unast",
  // playmaking
  "apg", "ast40", "astp", "tov40", "tovp", "ato", "orapm",
  // rebounding
  "rpg", "reb40", "oreb40", "dreb40", "orbp", "drbp", "trbp", "pb40",
  // defense
  "spg", "bpg", "stl40", "blk40", "stlp", "blkp", "pf40", "drapm", "rapm", "dbpm", "adrtg", "role",
  // skill scores and their D-I rank within the season's 200+ minute pool
  "sc", "pl", "rb", "df", "rk_sc", "rk_pl", "rk_rb", "rk_df",
];

function row(p) {
  const v = Object.fromEntries(Object.entries(p).map(([k, x]) => [k, n(x)]));
  const mp = v.minutes, f40 = (x) => (mp > 0 && x != null ? (x * 40) / mp : null);
  const t = T.get(`${p.season}|${p.team_ncaa_team_id}`);
  const tm = t ? t.mins * 5 : null; // team player-minutes
  const share = tm && mp ? (tm / 5) / mp : null; // (TmMP/5)/MP
  const tsa = (v.fga ?? 0) + 0.44 * (v.fta ?? 0);
  const sk = S.get(`${p.season}|${p.canonical_player_id}|${p.team_ncaa_team_id}`);
  const skv = (k) => (sk && sk.skill_score_eligible !== "FALSE" ? rd(n(sk[k])) : null);
  const reb = v.rebounds ?? ((v.oreb ?? 0) + (v.dreb ?? 0));
  return {
    name: p.player_name, id: p.canonical_player_id, season: seasonLabel(+p.season), team: p.team, conf: p.conference || t?.team_conference || "",
    cls: p.class || "", pos: p.position || "", ht: p.height || "", gp: v.games_played, min: rd(mp, 0), mpg: rd(v.mpg),
    ppg: rd(v.ppg), pts40: rd(f40(v.points)), ts: rd(v.ts_pct * 100), efg: rd(v.efg_pct * 100),
    usg: share && t ? rd((100 * (tsa + (v.turnovers ?? 0)) * share) / (t.fga + 0.44 * t.fta + t.to)) : null,
    fga40: rd(f40(v.fga)), p3: v.tpa ? rd(v.three_pct * 100) : null, tpa40: rd(f40(v.tpa)), tpar: rd(v.three_rate * 100),
    ftr: v.fga ? rd((100 * v.fta) / v.fga) : null, ft: v.fta ? rd(v.ft_pct * 100) : null,
    rim: v.rim_att ? rd(v.rim_pct * 100) : null, rimr: rd(v.rim_rate * 100), mid: v.mid_att ? rd(v.mid_pct * 100) : null,
    unast: v.fgm ? rd((100 * (v.unassisted_fgm ?? 0)) / v.fgm) : null,
    apg: rd(v.apg), ast40: rd(f40(v.assists)),
    astp: share && t ? rd((100 * v.assists) / ((t.fgm / share) - v.fgm)) : null,
    tov40: rd(f40(v.turnovers)), tovp: tsa + (v.turnovers ?? 0) ? rd((100 * v.turnovers) / (tsa + v.turnovers)) : null,
    ato: v.turnovers ? rd(v.assists / v.turnovers, 2) : null, orapm: rd(v.national_orapm, 2),
    rpg: rd(v.rpg), reb40: rd(f40(reb)), oreb40: rd(f40(v.oreb)), dreb40: rd(f40(v.dreb)),
    orbp: share && t ? rd((100 * v.oreb * share) / (t.orb + t.d_drb)) : null,
    drbp: share && t ? rd((100 * v.dreb * share) / (t.drb + t.d_orb)) : null,
    trbp: share && t ? rd((100 * reb * share) / (t.orb + t.drb + t.d_orb + t.d_drb)) : null,
    pb40: rd(f40(v.putback_made)),
    spg: rd(v.spg), bpg: rd(v.bpg), stl40: rd(f40(v.steals)), blk40: rd(f40(v.blocks)),
    stlp: share && t ? rd((100 * v.steals * share) / t.d_poss) : null,
    blkp: share && t ? rd((100 * v.blocks * share) / (t.d_fga - t.d_tpa)) : null,
    pf40: rd(f40(v.fouls)), drapm: rd(v.national_drapm, 2), rapm: rd(v.national_rapm_net, 2),
    sc: skv("scoring_score"), pl: skv("creation_score"), rb: skv("rebounding_score"), df: null,
    _lat: sk && sk.skill_reference_group === "TRUE" ? { sc: n(sk.scoring_latent), pl: n(sk.creation_latent), rb: n(sk.rebounding_latent) } : null,
    _y: +p.season, _team: p.team_ncaa_team_id, _tor: null,
  };
}
const pack = (rows) => rows.map((r) => COLS.map((c) => r[c] ?? null));

// ---------------------------------------------------------------------------
// Past-season skill scores. The RStudio skill model (v1.1) only scored
// 2025-26. Its latent scores turn out to be almost exactly a straight-line
// mix of the box/rate stats (R² 0.98-0.99), so we fit that line on 2025-26
// and apply it to every earlier season. Each season is then turned into a
// 1-100 score the same way v1.1 does it: percentile within that season's
// 200+ minute D-I players. 2025-26 keeps the official v1.1 numbers.
const FEATS = {
  sc: ["pts40", "usg", "ts", "fga40", "tpa40", "ftr", "ppg", "efg", "unast", "rimr"],
  pl: ["ast40", "astp", "tov40", "tovp", "ato", "usg", "unast", "apg"],
  rb: ["reb40", "oreb40", "dreb40", "orbp", "drbp", "trbp", "pb40"],
};
function solve(A, b) { // Gaussian elimination with partial pivoting
  const m = A.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < m; c++) {
    let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < m; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[m] / r[i]);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function features(rows, fs) { // fill gaps with the season's pool mean
  const mu = fs.map((f) => mean(rows.map((r) => r[f]).filter((v) => v != null)));
  return rows.map((r) => [1, ...fs.map((f, j) => r[f] ?? mu[j])]);
}
function fit(rows, k) {
  const X = features(rows, FEATS[k]), y = rows.map((r) => r._lat[k]);
  const p = X[0].length, A = Array.from({ length: p }, () => Array(p).fill(0)), b = Array(p).fill(0);
  X.forEach((x, i) => { for (let a = 0; a < p; a++) { b[a] += x[a] * y[i]; for (let c = 0; c < p; c++) A[a][c] += x[a] * x[c]; } });
  const beta = solve(A, b), pred = X.map((x) => x.reduce((s, v, j) => s + v * beta[j], 0));
  const my = mean(y), r2 = 1 - y.reduce((s, v, i) => s + (v - pred[i]) ** 2, 0) / y.reduce((s, v) => s + (v - my) ** 2, 0);
  return { beta, r2 };
}
function pctScores(rows, vals) { // v1.1-style: percentile within the pool, 0-100
  const sorted = [...vals].sort((a, b) => a - b), N = sorted.length;
  return vals.map((v) => { let lo = 0, hi = N; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; } let up = lo; while (up < N && sorted[up] === v) up++; return (100 * (lo + up) / 2) / N; });
}
const spearman = (a, b) => { const rk = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = Array(v.length); o.forEach(([, i], j) => (r[i] = j)); return r; };
  const ra = rk(a), rb = rk(b), ma = mean(ra), mb = mean(rb); let sab = 0, sa = 0, sb = 0; ra.forEach((x, i) => { sab += (x - ma) * (rb[i] - mb); sa += (x - ma) ** 2; sb += (rb[i] - mb) ** 2; }); return sab / Math.sqrt(sa * sb); };

const all = players.filter((p) => n(p.minutes) > 0);
const latest = Math.max(...all.map((p) => +p.season));
const bySeason = new Map();
for (const p of all) { if (n(p.minutes) < 50) continue; const y = +p.season; if (!bySeason.has(y)) bySeason.set(y, []); bySeason.get(y).push(row(p)); }

const test = {};
const train = bySeason.get(latest).filter((r) => r._lat && r.min >= 200);
for (const k of Object.keys(FEATS)) {
  const { beta, r2 } = fit(train, k);
  // Backtest on 2025-26: rebuilt score vs the official v1.1 score.
  const X = features(train, FEATS[k]), pred = X.map((x) => x.reduce((s, v, j) => s + v * beta[j], 0));
  const sc = pctScores(train, pred), off = train.map((r) => r[k]);
  test[k] = { r2: rd(r2, 3), spearman: rd(spearman(sc, off), 3), meanAbsDiff: rd(mean(sc.map((v, i) => Math.abs(v - off[i]))), 1), n: train.length };
  for (const [y, rows] of bySeason) {
    if (y === latest) continue;
    const pool = rows.filter((r) => r.min >= 200), Xp = features(pool, FEATS[k]);
    const s = pctScores(pool, Xp.map((x) => x.reduce((a, v, j) => a + v * beta[j], 0)));
    pool.forEach((r, i) => (r[k] = rd(s[i])));
  }
}

// ---------------------------------------------------------------------------
// DEF score v2 (rebuilt for every season). Recipe from the boisestate.ai DEF
// v2 build: pool = Torvik Min% >= 40 ("rotation players"); DBPM 25%, DRAPM
// 20%, Adj DRtg 15% (lower is better), STL% 13%, BLK% 10%, DRB% 10%, fouls/40
// -7%. Team halo damped 50%: half the team-defense credit is taken back out
// of DBPM and Adj DRtg. Each stat is a z-score within Torvik role, clipped at
// +-3; the weighted sum is shrunk by Min%/(Min%+15); score = 1 + 99 x
// percentile in the pool. Matches the published 2025-26 v2 scores with
// r = 0.997 (average gap 1.0 point).
const normName = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const TEAMD = new Map();
for (const t of read("team_strength_adjusted.csv") || []) TEAMD.set(`${t.season}|${t.team}`, n(t.adjusted_def_rating));
const DEFW = { dbpm: 0.25, drapm: 0.20, adjd: -0.15, stl: 0.13, blk: 0.10, drb: 0.10, pf: -0.07 };
const defTest = {}, unmatched = [];
for (const [y, rows] of bySeason) {
  const f = join(dir, "torvik", `players_${y}.csv`);
  if (!existsSync(f)) continue;
  const tv = parseCSV("h\n".replace("h", Array.from({ length: 70 }, (_, i) => "c" + i).join(",")) + readFileSync(f, "utf8"));
  const teamD = [...TEAMD].filter(([k]) => k.startsWith(y + "|")).map(([, v]) => v).filter((v) => v != null);
  const lg = mean(teamD);
  const local = new Map(rows.map((r) => [normName(r.name) + "|" + r.team, r]));
  const byNm = new Map(); rows.forEach((r) => { const k = normName(r.name); byNm.set(k, byNm.has(k) ? null : r); }); // null = name not unique
  const used = new Set();
  const pool = [];
  for (const t of tv) {
    const minp = n(t.c4); if (minp == null || minp < 40) continue;
    const ad = TEAMD.get(`${y}|${t.c1}`) ?? lg;
    let me = local.get(normName(t.c0) + "|" + t.c1) || byNm.get(normName(t.c0)) || null;
    if (me && used.has(me)) me = null; if (me) used.add(me);
    if (!me) unmatched.push(`${y} ${t.c0} (${t.c1})`);
    const d = { me, role: t.c64 || "?", minp, dbpm: n(t.c52) == null ? null : n(t.c52) - (0.5 * (lg - ad)) / 5, adjd: n(t.c47) == null ? null : n(t.c47) + 0.5 * (lg - ad),
      stl: n(t.c23), blk: n(t.c22), drb: n(t.c10), pf: n(t.c30), drapm: me?.drapm ?? null };
    pool.push(d);
    if (me) { me.dbpm = rd(n(t.c52)); me.adrtg = rd(n(t.c47)); me.role = d.role; }
  }
  const byRole = new Map(); pool.forEach((d) => { if (!byRole.has(d.role)) byRole.set(d.role, []); byRole.get(d.role).push(d); });
  for (const g of byRole.values()) for (const k of Object.keys(DEFW)) {
    const v = g.map((d) => d[k]).filter((x) => x != null), mu = mean(v), sd = Math.sqrt(mean(v.map((x) => (x - mu) ** 2))) || 1;
    g.forEach((d) => (d["z_" + k] = d[k] == null ? 0 : Math.max(-3, Math.min(3, (d[k] - mu) / sd))));
  }
  pool.forEach((d) => (d.raw = Object.entries(DEFW).reduce((s, [k, w]) => s + w * d["z_" + k], 0) * (d.minp / (d.minp + 15))));
  const order = [...pool].sort((a, b) => a.raw - b.raw);
  order.forEach((d, i) => { d.score = 1 + (99 * i) / (order.length - 1); if (d.me) d.me.df = rd(d.score); });
  defTest[seasonLabel(y)] = { pool: pool.length, matched: pool.filter((d) => d.me).length };
}

// D-I ranks per season (200+ minute pool).
for (const rows of bySeason.values()) for (const k of ["sc", "pl", "rb", "df"]) {
  rows.filter((r) => r.min >= 200 && r[k] != null).sort((a, b) => b[k] - a[k]).forEach((r, i) => (r["rk_" + k] = i + 1));
}

const out = new URL("../data-src/rankings/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const meta = { cols: COLS, rates: !!teams, built: new Date().toISOString(), test, defTest };
const seasons = [...bySeason.keys()].sort();
for (const y of seasons) writeFileSync(join(out, `national-${seasonLabel(y)}.json`), JSON.stringify({ ...meta, season: seasonLabel(y), official: y === latest, rows: pack(bySeason.get(y)) }));
const bsu = seasons.filter((y) => y > latest - 10).flatMap((y) => bySeason.get(y).filter((r) => r.team === "Boise St."));
const bsuLow = all.filter((p) => p.team === "Boise St." && +p.season > latest - 10 && n(p.minutes) < 50).map(row);
writeFileSync(join(out, "bsu-last10.json"), JSON.stringify({ ...meta, seasons: seasons.filter((y) => y > latest - 10).map(seasonLabel), rows: pack([...bsu, ...bsuLow]) }));
writeFileSync(join(out, "index.json"), JSON.stringify({ seasons: seasons.map(seasonLabel), latest: seasonLabel(latest), test, defTest }));
console.log(`rankings: ${seasons.length} seasons, ${bySeason.get(latest).length} players in ${seasonLabel(latest)}, ${bsu.length + bsuLow.length} Boise St. player-seasons`);
console.log("backtest on", seasonLabel(latest), JSON.stringify(test));
console.log("DEF v2 pools", JSON.stringify(defTest));
if (process.env.SHOW_UNMATCHED) console.log(unmatched.slice(0, 40).join("\n"));
