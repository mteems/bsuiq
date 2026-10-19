// Upcoming-season rosters for every team on the schedule (and every D-I id, for "is this opponent D-I?").
//   node scripts/build-rosters.mjs <path to espn_rosters.csv>
// espn_rosters.csv comes from scripts/03_export_positions.R (ESPN rosters, seasons 2026 + 2027).
// Non-D-I opponents (no ESPN roster) are read from data-src/rosters-extra.json, entered by hand
// or from the school's athletics site.
// Writes data-src/rosters-2027.json  { season, d1: [espn ids], teams: { <espnId or slug>: { team, src, players: [...] } } }
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseCSV } from "./lib-csv.mjs";

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/build-rosters.mjs <espn_rosters.csv>"); process.exit(1); }
const R = parseCSV(readFileSync(file, "utf8"));
const root = new URL("../data-src/", import.meta.url).pathname;
// ESPN team ids on the 2026-27 schedule (Boise St. included).
const SCHED = [68, 264, 2086, 2473, 158, 2534, 304, 2181, 249, 2449, 2724, 357, 3084, 2541, 167, 2320, 328, 204, 265, 2250, 278, 21, 326, 36];
const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
const ht = (i) => (+i ? `${Math.floor(+i / 12)}-${+i % 12}` : "");
const prev = new Map();
for (const r of R) if (r.season === "2026") { if (!prev.has(r.espn_team_id)) prev.set(r.espn_team_id, new Set()); prev.get(r.espn_team_id).add(norm(r.name)); }
const teams = {};
for (const r of R) {
  if (r.season !== "2027" || !SCHED.includes(+r.espn_team_id)) continue;
  const t = (teams[r.espn_team_id] ||= { team: r.team, src: "ESPN", players: [] });
  t.players.push({ id: r.athlete_id, name: r.name, jersey: r.jersey, pos: r.pos, ht: ht(r.height_in), wt: +r.weight_lb || null, ret: prev.get(r.espn_team_id)?.has(norm(r.name)) || false });
}
const extra = existsSync(root + "rosters-extra.json") ? JSON.parse(readFileSync(root + "rosters-extra.json", "utf8")) : {};
for (const [k, v] of Object.entries(extra)) if (!k.startsWith("_")) teams[k] = v;
const d1 = [...new Set(R.filter((r) => r.season === "2027").map((r) => +r.espn_team_id))].sort((a, b) => a - b);
writeFileSync(root + "rosters-2027.json", JSON.stringify({ season: "2026-27", built: new Date().toISOString(), d1, teams }));
console.log(`rosters: ${Object.keys(teams).length} teams, ${Object.values(teams).reduce((a, t) => a + t.players.length, 0)} players; ${d1.length} D-I ids`);
for (const id of SCHED) if (!teams[id]) console.log("  missing", id);
