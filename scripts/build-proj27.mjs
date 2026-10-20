// 2026-27 team projections for every D-I team, from the Win model's player projections.
//   node scripts/build-proj27.mjs <site_export folder>      → data-src/proj-2027.json (copied to public/data)
// Each team's 2026-27 ESPN roster (espn_rosters.csv, season 2027). Each player's projected impact per
// 100 possessions (pimpo / pimpd: Win model, with a year of growth and team-change effect); incoming
// freshmen in the 247 Composite top 100 use the model's freshman terms (rank + height); anyone else
// with no D-I season gets the model's average newcomer. Minutes: players sorted best to worst get the
// average D-I minutes curve by rotation spot (2021-22 to 2024-25), so every team is judged the same way,
// with no depth-chart guesses. Team net = sum of impact x minutes / 40.
// Backtest (same method, 2019-20 to 2025-26 rosters): r = .75 to .85 with actual team strength, better
// than last season's team every year; projections run ~20% too spread out, so SHRINK = 0.8 is applied
// before win probabilities: rating = SHRINK x (net - average team net).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCSV } from "./lib-csv.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/build-proj27.mjs <site_export folder>"); process.exit(1); }
const src = (p) => new URL(`../data-src/${p}`, import.meta.url);
const CURVE = [32.6, 30.1, 27.5, 24.8, 21.8, 18.2, 14.8, 11.4, 8.2, 5.3, 3.0, 1.5, 0.6, 0.2, 0.1];
const PRIOR = { po: -1.9, pd: -0.7 }, SHRINK = 0.8;
const nk = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
const S = JSON.parse(readFileSync(src("search/players.json"), "utf8")), PC = Object.fromEntries(S.pcols.map((c, i) => [c, i]));
const byEspn = new Map(S.players.filter((p) => p[PC.espn]).map((p) => [String(p[PC.espn]), p[PC.id]]));
const N = JSON.parse(readFileSync(src("rankings/national-2025-26.json"), "utf8")), NC = Object.fromEntries(N.cols.map((c, i) => [c, i]));
const nat = new Map(N.rows.map((r) => [r[NC.id], r]));
const natByName = new Map(); for (const r of N.rows) { const k = nk(r[NC.name]); natByName.set(k, natByName.has(k) ? null : r); }
const FR = JSON.parse(readFileSync(src("rankings/freshmen-2026-27.json"), "utf8"));
const frBy = new Map(FR.rows.map((r) => [nk(r.name), r]));
const CONF = JSON.parse(readFileSync(src("conf-2027.json"), "utf8")).conf;
const ROS = parseCSV(readFileSync(join(dir, "espn_rosters.csv"), "utf8")).filter((r) => r.season === "2027");
const teams = new Map();
for (const r of ROS) {
  if (!teams.has(r.espn_team_id)) teams.set(r.espn_team_id, { tid: +r.espn_team_id, team: r.team, conf: CONF[r.espn_team_id] || "", players: [] });
  const cid = byEspn.get(String(r.athlete_id));
  let row = cid ? nat.get(cid) : null; if (!row) row = natByName.get(nk(r.name)) || null;
  let po, pd, basis;
  if (row && row[NC.pimpo] != null && (row[NC.min] || 0) >= 50) { po = row[NC.pimpo]; pd = row[NC.pimpd]; basis = "D-I"; }
  else if (frBy.has(nk(r.name))) { const f = frBy.get(nk(r.name)); po = f.proj_o; pd = f.proj_d; basis = `247 #${f.rank}`; }
  else { po = PRIOR.po; pd = PRIOR.pd; basis = "newcomer"; }
  teams.get(r.espn_team_id).players.push({ name: r.name, id: row ? row[NC.id] : null, espn: r.athlete_id, po: Math.round(po * 100) / 100, pd: Math.round(pd * 100) / 100, basis });
}
const out = [];
for (const t of teams.values()) {
  t.players.sort((a, b) => b.po + b.pd - (a.po + a.pd));
  let o = 0, d = 0; t.players.forEach((p, i) => { const m = CURVE[i] || 0; p.mpg = m; o += (p.po * m) / 40; d += (p.pd * m) / 40; });
  out.push({ ...t, o: Math.round(o * 100) / 100, d: Math.round(d * 100) / 100, net: Math.round((o + d) * 100) / 100 });
}
out.sort((a, b) => b.net - a.net).forEach((t, i) => (t.rank = i + 1));
const MEAN = out.reduce((a, t) => a + t.net, 0) / out.length; // the average D-I team = 0 after centering
writeFileSync(src("proj-2027.json"), JSON.stringify({ season: "2026-27", built: new Date().toISOString().slice(0, 10), curve: CURVE, shrink: SHRINK, mean: Math.round(MEAN * 100) / 100, meanO: Math.round((out.reduce((a, t) => a + t.o, 0) / out.length) * 100) / 100, meanD: Math.round((out.reduce((a, t) => a + t.d, 0) / out.length) * 100) / 100, prior: PRIOR, sd: 5.5, teams: out }));
const pac = out.filter((t) => t.conf === "Pac-12");
console.log(`teams ${out.length}; top 10:`, out.slice(0, 10).map((t) => `${t.team} ${t.net}`).join(", "));
console.log("Pac-12:", pac.map((t) => `${t.team} ${t.net} (#${t.rank})`).join(", "));
