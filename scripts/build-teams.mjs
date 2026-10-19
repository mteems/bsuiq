// Builds the data behind the team scouting pages (one JSON per team).
//   node scripts/build-teams.mjs <folder with team_games_2026.csv, lineup_stints_2026.csv, shots_2026.csv>
// Writes public-ready files to data-src/teams/:
//   <slug>.json  games (team + opponent box per game), lineups (per game),
//                shots (offense + defense), for every team in TEAMS
//   _dist.json   every D-I team's full-season numbers, for national ranks
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseCSV } from "./lib-csv.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/build-teams.mjs <folder>"); process.exit(1); }
const read = (f) => parseCSV(readFileSync(join(dir, f), "utf8"));
const n = (v) => (v === "" || v === "NA" || v == null || isNaN(+v) ? null : +v);
const r1 = (v, d = 1) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const SEASON = "2025-26";

// Teams that get a page: Boise St. + the 2026-27 schedule (data names).
export const TEAMS = ["Boise St.", "Washington", "Butler", "Oakland", "Nebraska", "Sam Houston", "Idaho St.", "Drake", "North Texas",
  "North Dakota St.", "Wichita St.", "A&M-Corpus Christi", "Utah Valley", "Santa Clara", "New Mexico", "Lamar University", "Utah St.",
  "Oregon St.", "Washington St.", "Gonzaga", "Fresno St.", "San Diego St.", "Texas St.", "Colorado St.",
  // Shareable sample pages (/share/...), not on the schedule.
  "Arizona"];
const slug = (t) => t.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------------------------------------------------------------- games
const G = read("team_games_2026.csv");
const BOX = ["fga", "fgm", "tpa", "tpm", "fta", "ftm", "orb", "drb", "to", "ast", "blk", "rima", "rimm"];
function gameRow(g) {
  const isHome = g.location === "home", oppEspn = g.team_espn_team_id === g.home_espn_team_id ? g.away_espn_team_id : g.home_espn_team_id;
  const o = { d: (() => { const [m, dd, y] = g.game_date.split("/"); return `${y}-${m}-${dd}`; })(), opp: g.team === g.home ? g.away : g.home, oid: +oppEspn || 0,
    loc: g.location === "home" ? "H" : g.location === "away" ? "A" : "N", conf: !!g.team_conference && g.team_conference === g.opponent_conference,
    cid: g.contest_id, pts: n(g.pts), op: n(g.d_pts), poss: n(g.o_poss), dposs: n(g.d_poss), mins: n(g.mins), tpp: n(g.time_per_poss), dtpp: n(g.d_time_per_poss) };
  for (const k of BOX) { o[k] = n(g[k]); o["d_" + k] = n(g["d_" + k]); }
  return o;
}
const byTeam = new Map();
for (const g of G) { if (!byTeam.has(g.team)) byTeam.set(g.team, []); byTeam.get(g.team).push(g); }
const conferenceOf = new Map(G.map((g) => [g.team, g.team_conference]));

// National distributions (full season, per team).
const sum = (a, k) => a.reduce((s, g) => s + (g[k] || 0), 0);
export function aggregate(games) {
  const s = (k) => sum(games, k), poss = s("poss"), dposs = s("dposs"), mins = s("mins");
  return {
    ortg: (100 * s("pts")) / poss, drtg: (100 * s("op")) / dposs, net: (100 * s("pts")) / poss - (100 * s("op")) / dposs,
    pace: (40 * (poss + dposs)) / 2 / mins,
    efg: (100 * (s("fgm") + 0.5 * s("tpm"))) / s("fga"), d_efg: (100 * (s("d_fgm") + 0.5 * s("d_tpm"))) / s("d_fga"),
    tov: (100 * s("to")) / poss, d_tov: (100 * s("d_to")) / dposs,
    orb: (100 * s("orb")) / (s("orb") + s("d_drb")), d_orb: (100 * s("d_orb")) / (s("d_orb") + s("drb")),
    ftr: (100 * s("fta")) / s("fga"), d_ftr: (100 * s("d_fta")) / s("d_fga"),
    tpr: (100 * s("tpa")) / s("fga"), d_tpr: (100 * s("d_tpa")) / s("d_fga"),
    tp: (100 * s("tpm")) / s("tpa"), d_tp: (100 * s("d_tpm")) / s("d_tpa"),
    rim: (100 * s("rimm")) / s("rima"), d_rim: (100 * s("d_rimm")) / s("d_rima"),
    tpp: games.reduce((a, g) => a + (g.tpp || 0) * (g.poss || 0), 0) / poss, dtpp: games.reduce((a, g) => a + (g.dtpp || 0) * (g.dposs || 0), 0) / dposs,
  };
}
const dist = {};
for (const [team, gs] of byTeam) {
  if (gs.length < 10) continue;
  const a = aggregate(gs.map(gameRow));
  for (const [k, v] of Object.entries(a)) if (isFinite(v)) (dist[k] ||= []).push(r1(v, 2));
}
for (const k in dist) dist[k].sort((x, y) => x - y);

// ---------------------------------------------------------------- lineups
const L = read("lineup_stints_2026.csv");
const flip = (s) => { const i = s.indexOf(","); return i < 0 ? s : `${s.slice(i + 1).trim()} ${s.slice(0, i).trim()}`; };
const stintsBy = new Map();
for (const s of L) { if (!TEAMS.includes(s.team)) continue; if (!stintsBy.has(s.team)) stintsBy.set(s.team, []); stintsBy.get(s.team).push(s); }

// ---------------------------------------------------------------- shots
const S = read("shots_2026.csv");
const shotsByGame = new Map();
for (const s of S) { if (!shotsByGame.has(s.contest_id)) shotsByGame.set(s.contest_id, []); shotsByGame.get(s.contest_id).push(s); }
// Data coordinates: x -25..25 across, y feet from the basket. Chart: x 0..50, basket at y = 1.
const shotRow = (gi, s) => { const x = n(s.shot_x), y = n(s.shot_y); if (x == null || y == null || y > 30) return null; return [gi, r1(x + 25, 1), r1(y + 1, 1), n(s.point_value) === 3 ? 3 : 2, s.made === "TRUE" ? 1 : 0, 0]; };

const out = new URL("../data-src/teams/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const index = [];
for (const team of TEAMS) {
  const raw = byTeam.get(team); if (!raw) { console.log("no games for", team); continue; }
  const games = raw.map(gameRow).sort((a, b) => a.d.localeCompare(b.d));
  const gi = new Map(games.map((g, i) => [g.cid, i]));
  // lineups: aggregate stints by game + five players
  const names = [], nameIdx = new Map(), defs = [], defIdx = new Map(), agg = new Map();
  const pid = (raw) => { const nm = flip(raw); if (!nameIdx.has(nm)) { nameIdx.set(nm, names.length); names.push(nm); } return nameIdx.get(nm); };
  for (const s of stintsBy.get(team) || []) {
    const g = gi.get(s.contest_id); if (g == null) continue;
    const five = [s.player_1, s.player_2, s.player_3, s.player_4, s.player_5].filter((x) => x && x !== "NA"); if (five.length !== 5) continue;
    const ids = five.map(pid).sort((a, b) => a - b), key = ids.join(",");
    if (!defIdx.has(key)) { defIdx.set(key, defs.length); defs.push(ids); }
    const k = `${g}|${defIdx.get(key)}`;
    if (!agg.has(k)) agg.set(k, [g, defIdx.get(key), 0, 0, 0, 0, 0]);
    const a = agg.get(k); a[2] += n(s.poss) || 0; a[3] += n(s.pts) || 0; a[4] += n(s.opp_poss) || 0; a[5] += n(s.opp_pts) || 0; a[6] += n(s.duration_mins) || 0;
  }
  const lrows = [...agg.values()].map((a) => [...a.slice(0, 6), r1(a[6], 2)]);
  // shots
  const tid = raw[0].team_ncaa_team_id, off = [], def = [];
  games.forEach((g, i) => { for (const s of shotsByGame.get(g.cid) || []) { const r = shotRow(i, s); if (!r) continue; (s.ncaa_team_id === tid ? off : def).push(r); } });
  for (const g of games) delete g.cid;
  const file = slug(team);
  writeFileSync(join(out, `${file}.json`), JSON.stringify({ team, season: SEASON, conf: conferenceOf.get(team), espnId: +raw[0].team_espn_team_id, games, lineups: { names, defs, rows: lrows }, shots: { off, def } }));
  index.push({ team, slug: file, games: games.length, shots: off.length });
}
writeFileSync(join(out, "_dist.json"), JSON.stringify({ season: SEASON, teams: byTeam.size, dist }));
writeFileSync(join(out, "_index.json"), JSON.stringify({ season: SEASON, teams: index }));
console.log(`teams: ${index.length} pages; ${index.map((t) => `${t.team} ${t.games}g/${t.shots}sh`).join(", ")}`);
