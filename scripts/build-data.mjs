// Builds the static JSON the pages read (public/data/) from data-src/.
//   node scripts/build-data.mjs
// During the formatting phase data-src/ holds a sample export. When the data
// moves into Bronco IQ's own database, this script (or the Worker API that
// replaces it) produces the same file shapes, so the pages don't change.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, cpSync } from "node:fs";
import { join } from "node:path";
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
  return out;
}

// Hand-built deep-dive modules embedded on player pages.
const MODULES = {
  "espn-5107273": [{ key: "pd", title: "Playmaking & Defense", src: "/modules/pd-espn-5107273.html", season: "2025-26" }],
};

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "players"), { recursive: true });
const write = (p, v) => writeFileSync(join(out, p), JSON.stringify(v));

const index = [], rosterRows = [];
for (const p of roster.players) {
  const seasons = p.seasons.map((s) => ({ ...s, d: derive(s), pct: seasonPercentiles(s, pool) }));
  const last = seasons[seasons.length - 1] || null;
  const espnId = p.id.startsWith("espn-") ? p.id.slice(5) : null;
  const player = { ...p, seasons: undefined, espnId, onRoster: true };
  write(`players/${p.id}.json`, {
    player,
    seasons,
    shots: (shots[p.id] || []).sort((a, b) => a.season.localeCompare(b.season)),
    modules: MODULES[p.id] || [],
    scores: playerScores(p),
  });
  const lastLite = last ? { season: last.season, school: last.school, gp: last.gp, mpg: last.mpg, ppg: last.ppg, three_pct: last.three_pct, three_pa: last.three_pa, ...last.d, pct: last.pct.metrics } : null;
  rosterRows.push({ ...player, last: lastLite });
  index.push({ id: p.id, first_name: p.first_name, last_name: p.last_name, school: roster.team, position: p.position, last: last ? { season: last.season, school: last.school, ppg: last.ppg } : null });
}
mkdirSync(join(out, "scores"), { recursive: true });
for (const [k, s] of Object.entries(scores)) write(`scores/${k}.json`, s);
// Rankings tables (built by scripts/build-rankings.mjs from the RStudio exports).
if (existsSync(src("rankings"))) cpSync(src("rankings"), join(out, "rankings"), { recursive: true });
// Position shares by player-season (scripts/build-positions.mjs), for depth charts.
// Team scouting data (scripts/build-teams.mjs).
if (existsSync(src("teams"))) cpSync(src("teams"), join(out, "teams"), { recursive: true });
if (existsSync(src("positions.json"))) cpSync(src("positions.json"), join(out, "positions.json"));
write("roster.json", { team: roster.team, season: roster.season, espnTeamId: roster.espnTeamId, players: rosterRows });
write("index.json", { players: index });
write("meta.json", { builtAt: new Date().toISOString(), pools: Object.fromEntries(Object.entries(pool).map(([s, m]) => [s, m.ppg[0]])), source: roster._about });
console.log(`built ${rosterRows.length} players, ${Object.values(shots).flat().length} shot profiles → public/data`);
