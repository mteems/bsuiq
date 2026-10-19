// Player Search data: every D-I player from last season (2025-26) with his full college
// history, from our own pipeline (same numbers as Scouting, Rankings and the player pages).
//   node scripts/build-search.mjs <site_export dir>
// Inputs:  <site_export>/player_team_seasons_all.csv  (NCAA play-by-play pipeline, D-I games only)
//          <site_export>/torvik/players_YYYY.csv       (Barttorvik usage %)
// Output:  data-src/search/players.json  (build-data.mjs copies it to public/data/search/)
// Players are keyed by canonical_player_id, our ID system. ESPN ids (headshots, game logs) and
// team logos come from the Recruiting Hub at page load (/api/hub/link), matched by name + school.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseCSV, parseRows } from "./lib-csv.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/build-search.mjs <site_export dir>"); process.exit(1); }
const LAST = 2026; // season end year of "last season"
const rows = parseCSV(readFileSync(join(dir, "player_team_seasons_all.csv"), "utf8"));
const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
const num = (v) => (v === "" || v == null || !Number.isFinite(+v) ? null : +v);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const pct = (v) => (num(v) == null ? null : r1(+v * 100));
const label = (y) => `${y - 1}-${String(y).slice(2)}`;
const CLASS = { "Fr.": "Freshman", "So.": "Sophomore", "Jr.": "Junior", "Sr.": "Senior", "Gr.": "Graduate" };
const POS = { G: "G", F: "F", C: "B" };
// Our conference names → the hub's names (the hub's level groups use these).
const CONF = { "Summit League": "Summit", AAC: "American", MWC: "Mountain West", "C-USA": "CUSA", WAC: "United Athletic" };

// Barttorvik usage by season + name + team.
const USG = new Map();
for (let y = 2017; y <= LAST; y++) {
  try {
    for (const c of parseRows(readFileSync(join(dir, `torvik/players_${y}.csv`), "utf8"))) USG.set(`${y}|${norm(c[0])}|${norm(c[1])}`, num(c[6]));
  } catch { /* season file missing */ }
}

// ESPN ids: team (NCAA id → ESPN id from the game file), then athlete by name on that team's
// ESPN roster (2025-26, then 2026-27), then by name anywhere on 2026-27 rosters if unique.
const TID = new Map();
for (const g of parseCSV(readFileSync(join(dir, "team_games_2026.csv"), "utf8"))) if (g.team_ncaa_team_id && g.team_espn_team_id) TID.set(g.team_ncaa_team_id, g.team_espn_team_id);
const ROST = parseCSV(readFileSync(join(dir, "espn_rosters.csv"), "utf8"));
const onTeam = new Map(), anywhere = new Map(), initial = new Map();
for (const r of ROST) {
  const k = norm(r.name), parts = String(r.name).trim().split(/\s+/);
  const ini = `${r.espn_team_id}|${norm(parts.slice(1).join(" "))}|${norm(parts[0])[0] || ""}`;
  if (!onTeam.has(`${r.espn_team_id}|${k}`)) onTeam.set(`${r.espn_team_id}|${k}`, r.athlete_id);
  if (!initial.has(ini)) initial.set(ini, new Set()); initial.get(ini).add(r.athlete_id);
  if (!anywhere.has(k)) anywhere.set(k, new Set()); anywhere.get(k).add(r.athlete_id);
}
function espnFor(r) {
  const tid = TID.get(r.team_ncaa_team_id), k = norm(r.player_name), parts = r.player_name.trim().split(/\s+/);
  if (tid && onTeam.has(`${tid}|${k}`)) return onTeam.get(`${tid}|${k}`);
  const ini = initial.get(`${tid}|${norm(parts.slice(1).join(" "))}|${norm(parts[0])[0] || ""}`);
  if (ini && ini.size === 1) return [...ini][0];
  const any = anywhere.get(k);
  return any && any.size === 1 ? [...any][0] : "";
}
const current = rows.filter((r) => +r.season === LAST);
const ids = new Map(); // canonical id → player index
const players = [];
for (const r of current) {
  if (ids.has(r.canonical_player_id)) continue;
  const name = r.player_name.trim(), sp = name.indexOf(" ");
  const [f, i] = String(r.height || "").split("-");
  ids.set(r.canonical_player_id, players.length);
  players.push([
    r.canonical_player_id, sp > 0 ? name.slice(0, sp) : name, sp > 0 ? name.slice(sp + 1) : "", r.team,
    CONF[r.conference] || r.conference, POS[r.position] || r.position || "", f && i != null ? `${f}'${i}"` : "",
    CLASS[r.class] || "", String(r.jersey || "").replace(/\.0+$/, ""), r.hometown || "", r.high_school || "",
    espnFor(r), TID.get(r.team_ncaa_team_id) || "",
  ]);
}
const seasons = [];
for (const r of rows) {
  const p = ids.get(r.canonical_player_id);
  if (p == null) continue;
  const y = +r.season, gp = num(r.games_played) || 0, pg = (k) => (gp ? r1(+r[k] / gp) : null);
  const fga = +r.fga || 0, tpa = +r.tpa || 0;
  seasons.push([
    p, label(y), r.team, CONF[r.conference] || r.conference, gp, r1(num(r.minutes)), r1(num(r.mpg)),
    pg("points"), pg("rebounds"), pg("assists"), pg("steals"), pg("blocks"), pg("turnovers"),
    pct(r.fg_pct), fga - tpa > 0 ? r1(((+r.fgm - +r.tpm) / (fga - tpa)) * 100) : null, pct(r.three_pct), pct(r.ft_pct), pct(r.efg_pct), pct(r.ts_pct),
    USG.get(`${y}|${norm(r.player_name)}|${norm(r.team)}`) ?? null,
    +r.fgm || 0, fga, +r.tpm || 0, tpa, +r.ftm || 0, +r.fta || 0,
    +r.points || 0, +r.rebounds || 0, +r.assists || 0, +r.steals || 0, +r.blocks || 0, +r.turnovers || 0, +r.oreb || 0, +r.dreb || 0,
  ]);
}
// Newest season first for each player (the hub's order: seasons[0] is the latest).
seasons.sort((a, b) => a[0] - b[0] || b[1].localeCompare(a[1]) || b[5] - a[5]);
const out = {
  built: new Date().toISOString(), season: label(LAST),
  note: "D-I games only (our play-by-play pipeline). Non-D-I games are left out on purpose, so games and totals can be a little lower than ESPN's.",
  pcols: ["id", "first", "last", "team", "conf", "pos", "ht", "cls", "jersey", "home", "hs", "espn", "tid"],
  players,
  scols: ["p", "season", "school", "conf", "gp", "min", "mpg", "ppg", "rpg", "apg", "spg", "bpg", "topg", "fg_pct", "two_pct", "three_pct", "ft_pct", "efg_pct", "ts_pct", "usage_pct", "fgm", "fga", "three_pm", "three_pa", "ftm", "fta", "points", "rebounds", "assists", "steals", "blocks", "turnovers", "oreb", "dreb"],
  seasons,
};
const root = new URL("../data-src/search/", import.meta.url).pathname;
mkdirSync(root, { recursive: true });
writeFileSync(join(root, "players.json"), JSON.stringify(out));
console.log(`espn ids: ${players.filter((p) => p[11]).length}/${players.length}, team ids: ${players.filter((p) => p[12]).length}`);
console.log(`search: ${players.length} players, ${seasons.length} season rows, usage on ${seasons.filter((s) => s[19] != null).length}`);
