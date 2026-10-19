// Builds the static JSON the pages read (public/data/) from data-src/.
//   node scripts/build-data.mjs
// During the formatting phase data-src/ holds a sample export. When the data
// moves into Bronco IQ's own database, this script (or the Worker API that
// replaces it) produces the same file shapes, so the pages don't change.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, cpSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { derive, seasonPercentiles } from "../src/stats.js";

const root = new URL("..", import.meta.url).pathname;
const src = (p) => join(root, "data-src", p);
const out = join(root, "public", "data");
const pool = JSON.parse(readFileSync(src("pool.json"), "utf8"));
delete pool._about;
const roster = JSON.parse(readFileSync(src("roster.json"), "utf8"));

// Per-shot profiles: data-src/shots/<playerId>-<season>.json
const shots = {};
if (existsSync(src("shots"))) for (const f of readdirSync(src("shots"))) {
  if (!f.endsWith(".json")) continue;
  const s = JSON.parse(readFileSync(src(join("shots", f)), "utf8"));
  (shots[s.player] ||= []).push(s);
}

// Skill scores: data-src/scores/<skill>-<season>.json
const scores = {};
if (existsSync(src("scores"))) for (const f of readdirSync(src("scores"))) {
  if (!f.endsWith(".json")) continue;
  const s = JSON.parse(readFileSync(src(join("scores", f)), "utf8"));
  scores[f.replace(/-\d{4}-\d{2}\.json$/, "")] = s;
}
// Latest national rankings file (for the DEF v2 score on player pages).
const RIDX = existsSync(src("rankings/index.json")) ? JSON.parse(readFileSync(src("rankings/index.json"), "utf8")) : null;
const RANK_LATEST = RIDX ? JSON.parse(readFileSync(src(`rankings/national-${RIDX.latest}.json`), "utf8")) : null;
const RC = RANK_LATEST ? Object.fromEntries(RANK_LATEST.cols.map((c, i) => [c, i])) : {};
const normName = (s) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
function playerScores(p) {
  const out = {};
  const pm = scores.playmaking?.rows.find((r) => r.id === p.id);
  if (pm) out.playmaking = { ...pm, pool: scores.playmaking.pool, version: scores.playmaking.version, groupLabel: scores.playmaking.groups[pm.grp]?.label, weights: scores.playmaking.weights, groupAvg: scores.playmaking.groups[pm.grp]?.avg };
  const dl = scores.defense ? Object.values(scores.defense.lists).flat() : [];
  const df = dl.find((r) => normName(r.name) === normName(`${p.first_name} ${p.last_name}`));
  if (df) out.defense = { ...df, pool: scores.defense.pool, version: scores.defense.version, weights: scores.defense.weights };
  // v1.1 skill components (RStudio). Match on name, then on last season's school.
  const SK = scores.skills;
  if (SK) {
    const last = p.seasons[p.seasons.length - 1];
    const school = normName(last?.school).slice(0, 5);
    const hits = SK.rows.filter((r) => normName(r[0]) === normName(`${p.first_name} ${p.last_name}`));
    const r = hits.length === 1 ? hits[0] : hits.find((h) => normName(h[1]).slice(0, 5) === school);
    if (r) {
      const sk = {};
      SK.skills.forEach((k, i) => {
        const v = r[7 + i];
        if (v == null) return;
        sk[k] = { score: v, rank: r[6] ? SK.rows.filter((o) => o[6] && o[7 + i] != null && o[7 + i] > v).length + 1 : null };
      });
      // Scores come from the rankings build (bell-curve scale; Defense = DEF v2).
      const NR = RANK_LATEST?.rows.find((x) => normName(x[RC.name]) === normName(r[0]) && x[RC.team] === r[1]);
      for (const k of Object.keys(sk)) delete sk[k];
      if (NR) {
        const pool = (key) => RANK_LATEST.rows.filter((x) => x[RC["rk_" + key]] != null).length;
        for (const [k, key] of [["scoring", "sc"], ["playmaking", "pl"], ["rebounding", "rb"], ["defense", "df"]])
          if (NR[RC[key]] != null) sk[k] = { score: NR[RC[key]], rank: NR[RC["rk_" + key]], pool: pool(key) };
      }
      out.skills = { version: SK.version, season: SK.season, pool: SK.pool, team: r[1], min: r[3], mpg: r[4], ref: !!r[6], s: sk };
    }
  }
  // No 2025-26 skill row (e.g. his last D-I season was earlier): use that season's national rankings.
  if (!out.skills) {
    const last = p.seasons[p.seasons.length - 1];
    const f = last && src(`rankings/national-${last.season}.json`);
    if (f && existsSync(f)) {
      const R = JSON.parse(readFileSync(f, "utf8")), C = Object.fromEntries(R.cols.map((c, i) => [c, i]));
      const hit = R.rows.filter((x) => normName(x[C.name]) === normName(`${p.first_name} ${p.last_name}`));
      const NR = hit.length === 1 ? hit[0] : hit.find((x) => normName(x[C.team]).slice(0, 5) === normName(last.school).slice(0, 5));
      if (NR) {
        const sk = {}, pool = (key) => R.rows.filter((x) => x[C["rk_" + key]] != null).length;
        for (const [k, key] of [["scoring", "sc"], ["playmaking", "pl"], ["rebounding", "rb"], ["defense", "df"]])
          if (NR[C[key]] != null) sk[k] = { score: NR[C[key]], rank: NR[C["rk_" + key]], pool: pool(key) };
        if (Object.keys(sk).length) out.skills = { version: "rankings", season: last.season, pool: pool("sc"), team: NR[C.team], min: Math.round(NR[C.min] || 0), mpg: null, ref: true, s: sk };
      }
    }
  }
  return out;
}

// Hand-built deep-dive modules embedded on player pages.
const MODULES = {
  "espn-5107273": [{ key: "pd", title: "Playmaking & Defense", src: "/modules/pd-espn-5107273.html", season: "2025-26" }],
};

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "players"), { recursive: true });
const write = (p, v) => writeFileSync(join(out, p), JSON.stringify(v));

const index = [], rosterRows = [], ROSTER_CID = new Map();
for (const p of roster.players) {
  const seasons = p.seasons.map((s) => ({ ...s, d: derive(s), pct: seasonPercentiles(s, pool) }));
  const last = seasons[seasons.length - 1] || null;
  const espnId = p.id.startsWith("espn-") ? p.id.slice(5) : null;
  const pdr = existsSync(src(`pd/${p.id}.json`)) ? JSON.parse(readFileSync(src(`pd/${p.id}.json`), "utf8")) : null;
  const player = { ...p, seasons: undefined, espnId, onRoster: true, cid: pdr?.cid || null };
  if (pdr?.cid) ROSTER_CID.set(pdr.cid, p.id);
  write(`players/${p.id}.json`, {
    player,
    seasons,
    shots: (shots[p.id] || []).sort((a, b) => a.season.localeCompare(b.season)),
    // DWT keeps his hand-built module; everyone else gets the same module generated from data.
    modules: MODULES[p.id] || (existsSync(src(`pd/${p.id}.json`)) ? [{ src: `/modules/pd.html?id=${encodeURIComponent(p.id)}`, title: "Playmaking & Defense" }] : []),
    scores: playerScores(p),
    // Live ESPN play-by-play for his latest D-I season (shot chart when none is prebuilt).
    pbp: (() => { try { const d = JSON.parse(readFileSync(src(`pd/${p.id}.json`), "utf8")); return d.espn && d.teamEspn ? { espn: d.espn, team: d.teamEspn, season: d.year, label: d.season, school: d.team, teamShort: d.teamShort, confShort: d.confShort } : null; } catch { return null; } })(),
  });
  const lastLite = last ? { season: last.season, school: last.school, gp: last.gp, mpg: last.mpg, ppg: last.ppg, three_pct: last.three_pct, three_pa: last.three_pa, ...last.d, pct: last.pct.metrics } : null;
  rosterRows.push({ ...player, last: lastLite });
  index.push({ id: p.id, first_name: p.first_name, last_name: p.last_name, school: roster.team, position: p.position, last: last ? { season: last.season, school: last.school, ppg: last.ppg } : null });
}
// ---------------------------------------------------------------- every D-I player (Search list)
// Same page as the roster players (/player/<canonical id>), from our pipeline's D-I seasons.
if (existsSync(src("search/players.json")) && existsSync(src("pd-cbb.json.gz"))) {
  const SP = JSON.parse(readFileSync(src("search/players.json"), "utf8")), PD = JSON.parse(gunzipSync(readFileSync(src("pd-cbb.json.gz"))));
  const pc = Object.fromEntries(SP.pcols.map((c, i) => [c, i])), sc = Object.fromEntries(SP.scols.map((c, i) => [c, i]));
  const bySeason = new Map(); for (const r of SP.seasons) { if (!bySeason.has(r[0])) bySeason.set(r[0], []); bySeason.get(r[0]).push(r); }
  mkdirSync(join(out, "pd"), { recursive: true });
  let nP = 0;
  SP.players.forEach((r, i) => {
    const cid = r[pc.id], g = (k) => r[pc[k]];
    const raw = (bySeason.get(i) || []).slice().reverse(); // oldest first
    const seasons = raw.map((x) => { const v = (k) => x[sc[k]];
      const s = { season: v("season"), school: v("school"), gp: v("gp"), gs: null, mpg: v("mpg"), ppg: v("ppg"), rpg: v("rpg"), apg: v("apg"), spg: v("spg"), bpg: v("bpg"), topg: v("topg"),
        fg_pct: v("fg_pct"), three_pct: v("three_pct"), ft_pct: v("ft_pct"), efg_pct: v("efg_pct"), fgm: v("fgm"), fga: v("fga"), three_pm: v("three_pm"), three_pa: v("three_pa"), ftm: v("ftm"), fta: v("fta"),
        points: v("points"), rebounds: v("rebounds"), assists: v("assists"), steals: v("steals"), blocks: v("blocks"), turnovers: v("turnovers") };
      return { ...s, d: derive(s), pct: seasonPercentiles(s, pool) }; });
    const p = { id: cid, first_name: g("first"), last_name: g("last"), school: g("team"), conference: g("conf"), position: g("pos"), height: g("ht"), weight: g("wt"), class_year: g("cls"), hometown: g("home"), high_school: g("hs"), jersey_number: g("jersey"), seasons: raw.map((x) => ({ school: x[sc.school] })) };
    if (ROSTER_CID.has(cid)) { write(`players/${cid}.json`, { redirect: ROSTER_CID.get(cid) }); return; }
    const pd = PD[cid];
    write(`players/${cid}.json`, {
      player: { ...p, seasons: undefined, espnId: g("espn") || null, espnTeamId: g("tid") || null, onRoster: false, source: "pipeline" },
      seasons, shots: [], scores: playerScores(p),
      modules: pd ? [{ src: `/modules/pd.html?id=${encodeURIComponent(cid)}`, title: "Playmaking & Defense" }] : [],
      pbp: pd && pd.teamEspn ? { espn: pd.espn || null, team: pd.teamEspn, season: pd.year, label: pd.season, school: pd.team, teamShort: pd.teamShort, confShort: pd.confShort } : null,
    });
    if (pd) write(`pd/${cid}.json`, { id: cid, cid, ...pd });
    nP++;
  });
  console.log(`all D-I: ${nP} player pages`);
}
mkdirSync(join(out, "scores"), { recursive: true });
for (const [k, s] of Object.entries(scores)) write(`scores/${k}.json`, s);
// Rankings tables (built by scripts/build-rankings.mjs from the RStudio exports).
if (existsSync(src("rankings"))) cpSync(src("rankings"), join(out, "rankings"), { recursive: true });
// Position shares by player-season (scripts/build-positions.mjs), for depth charts.
// Team scouting data (scripts/build-teams.mjs).
if (existsSync(src("teams"))) cpSync(src("teams"), join(out, "teams"), { recursive: true });
// Written scouting reports (scripts/build-reports.mjs), one combined file.
if (existsSync(src("reports/index.json"))) {
  const ix = JSON.parse(readFileSync(src("reports/index.json"), "utf8"));
  write("reports.json", { built: ix.built, teams: Object.fromEntries(ix.teams.map((k) => [k, JSON.parse(readFileSync(src(`reports/${k}.json`), "utf8"))])) });
}
// International board (DraftExpress list + map lookups).
if (existsSync(src("intl"))) cpSync(src("intl"), join(out, "intl"), { recursive: true });
if (existsSync(src("pd"))) cpSync(src("pd"), join(out, "pd"), { recursive: true });
if (existsSync(src("search"))) cpSync(src("search"), join(out, "search"), { recursive: true });
if (existsSync(src("rosters-2027.json"))) cpSync(src("rosters-2027.json"), join(out, "rosters-2027.json"));
if (existsSync(src("positions.json"))) cpSync(src("positions.json"), join(out, "positions.json"));
write("roster.json", { team: roster.team, season: roster.season, espnTeamId: roster.espnTeamId, players: rosterRows });
write("index.json", { players: index });
write("meta.json", { builtAt: new Date().toISOString(), pools: Object.fromEntries(Object.entries(pool).map(([s, m]) => [s, m.ppg[0]])), source: roster._about });
console.log(`built ${rosterRows.length} players, ${Object.values(shots).flat().length} shot profiles → public/data`);
