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
// Team model v2 (model/team_v2): learned minutes + program level + returning minutes. Fit in the
// session scratchpad (team_backtest.py) on 2019-20 to 2025-26; walk-forward test r = .88 with actual
// team strength (site v1 curve method: .86), game margin error 9.72 (v1 9.88).
const TM = JSON.parse(readFileSync(src("team-model-2027.json"), "utf8"));
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
  const hist = basis === "D-I", lastMpg = hist ? row[NC.mpg] || 0 : 0;
  const ret = hist && TM.teams[r.espn_team_id]?.m26?.[row[NC.id]] != null;
  teams.get(r.espn_team_id).players.push({ name: r.name, id: row ? row[NC.id] : null, espn: r.athlete_id, po: Math.round(po * 100) / 100, pd: Math.round(pd * 100) / 100, basis, ret: ret ? 1 : 0, moved: hist && !ret ? 1 : 0, lastMpg });
}
// Rotation order: the learned minutes model (role on this roster, last season's minutes, returner or
// transfer, freshman, no D-I history) predicts each player's share; players are then ordered by it.
const MB = Object.fromEntries(TM.minutes.MF.map((k, i) => [k, TM.minutes.b[i]]));
export function minutesFor(players) {
  const P = [...players].sort((a, b) => b.po + b.pd - (a.po + a.pd));
  const top8 = P.slice(0, 8).reduce((a, p) => a + p.po + p.pd, 0) / Math.min(8, P.length || 1);
  const raw = P.map((p, i) => { const rk = i + 1, f = { rel: p.po + p.pd - top8, ret: p.ret ? 1 : 0, hsh: p.ret ? p.lastMpg / 40 : 0, hshm: p.moved ? p.lastMpg / 40 : 0, fr: p.basis !== "D-I" ? 1 : 0, nohist: p.basis !== "D-I" ? 1 : 0 };
    for (let k = 1; k <= 11; k++) f["r" + k] = rk === k ? 1 : 0; f.r12 = rk >= 12 ? 1 : 0;
    return Math.max(0, Math.min(0.95, Object.entries(MB).reduce((a, [k, b]) => a + b * (f[k] || 0), 0))); });
  const tot = raw.reduce((a, b) => a + b, 0) || 1;
  return new Map(P.map((p, i) => [p, (raw[i] / tot) * 5]));
}
const out = [];
for (const t of teams.values()) {
  // Rotation order from the minutes model; minutes = the average D-I minutes for each rotation spot.
  const MP = minutesFor(t.players); t.players.sort((a, b) => MP.get(b) - MP.get(a));
  // o, d: per 100 possessions vs average = sum of impact x his share of the game (shares add to 5)
  let o = 0, d = 0; t.players.forEach((p, i) => { const m = CURVE[i] || 0; p.mpg = m; o += (p.po * m) / 40; d += (p.pd * m) / 40; });
  const h = TM.teams[String(t.tid)] || null, m26 = h?.m26 || {}, tot26 = Object.values(m26).reduce((a, b) => a + b, 0);
  const retShare = tot26 ? t.players.reduce((a, p) => a + (p.id && m26[p.id] ? m26[p.id] : 0), 0) / tot26 : 0;
  const netC = (o + d) / 5, hist3 = h ? h.hist3 : null;
  out.push({ ...t, o: Math.round(o * 100) / 100, d: Math.round(d * 100) / 100, net: Math.round((o + d) * 100) / 100, netC: Math.round(netC * 1000) / 1000, hist3, ret: Math.round(retShare * 100) / 100 });
}
const minH = Math.min(...out.filter((t) => t.hist3 != null).map((t) => t.hist3));
for (const t of out) { const h3 = t.hist3 ?? minH; t.rate0 = TM.coef.int + TM.coef.netC * t.netC + TM.coef.hist3 * h3 + TM.coef.ret * t.ret; }
const RMEAN = out.reduce((a, t) => a + t.rate0, 0) / out.length;
for (const t of out) { t.rate = Math.round((t.rate0 - RMEAN) * 100) / 100; delete t.rate0; }
out.sort((a, b) => b.rate - a.rate).forEach((t, i) => (t.rank = i + 1));
const MEAN = out.reduce((a, t) => a + t.net, 0) / out.length; // the average D-I team = 0 after centering
writeFileSync(src("proj-2027.json"), JSON.stringify({ season: "2026-27", built: new Date().toISOString().slice(0, 10), model: "team v2", curve: CURVE, shrink: SHRINK, mean: Math.round(MEAN * 100) / 100, meanO: Math.round((out.reduce((a, t) => a + t.o, 0) / out.length) * 100) / 100, meanD: Math.round((out.reduce((a, t) => a + t.d, 0) / out.length) * 100) / 100, prior: PRIOR, sd: 5.5,
  boise: { hist3: TM.teams["68"]?.hist3 ?? null, m26: TM.teams["68"]?.m26 || {} }, coef: TM.coef, rmean: Math.round(RMEAN * 1000) / 1000, minH, minutes: TM.minutes, teamSd: 4.4, gameSd: 10.4, home: TM.home, teams: out }));
const pac = out.filter((t) => t.conf === "Pac-12");
console.log(`teams ${out.length}; top 10:`, out.slice(0, 10).map((t) => `${t.team} ${t.rate}`).join(", "));
console.log("Pac-12:", pac.map((t) => `${t.team} ${t.rate} (#${t.rank})`).join(", "));
