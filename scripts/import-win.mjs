// Adds the Win score (Win model v0.2) to the 2025-26 national rankings file.
//   node scripts/import-win.mjs <win_v2 folder>     (players.csv + validation.json from win_v2.py)
// Re-run after scripts/build-rankings.mjs, which rewrites the rankings files.
// New columns: wn (Win score), rk_wn, wins (wins added), imp (impact / 100), oimp, dimp,
//              wpts (points over replacement), wcov (share of his possessions the fit kept),
//              wteam (his team's level, a fifth per player), wind (his own on-court evidence beyond it).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCSV } from "./lib-csv.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/import-win.mjs <win_v2 folder>"); process.exit(1); }
const W = parseCSV(readFileSync(join(dir, "players.csv"), "utf8"));
const V = JSON.parse(readFileSync(join(dir, "validation.json"), "utf8"));
const file = new URL("../data-src/rankings/national-2025-26.json", import.meta.url);
const R = JSON.parse(readFileSync(file, "utf8"));
const NEW = ["wn", "rk_wn", "wins", "imp", "oimp", "dimp", "wpts", "wcov", "wteam", "wind"];
for (const k of NEW) if (!R.cols.includes(k)) R.cols.push(k);
const C = Object.fromEntries(R.cols.map((c, i) => [c, i]));
const n = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
const rd = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
// Team names: both sources use NCAA short names; a few differ.
const TEAM = { "Saint Mary's (CA)": "Saint Mary's", "St. John's (NY)": "St. John's", "Miami (FL)": "Miami (FL)", "Miami (OH)": "Miami (OH)" };
const tk = (t) => norm(TEAM[t] || t);
const byKey = new Map(), byName = new Map();
for (const w of W) {
  if (!(n(w.mins) > 0)) continue;
  byKey.set(norm(w.clean_name) + "|" + tk(w.team), w);
  const k = norm(w.clean_name); byName.set(k, byName.has(k) ? "dup" : w);
}
let hit = 0, miss = [];
for (const row of R.rows) {
  while (row.length < R.cols.length) row.push(null);
  const w = byKey.get(norm(row[C.name]) + "|" + tk(row[C.team])) || (byName.get(norm(row[C.name])) !== "dup" ? byName.get(norm(row[C.name])) : null);
  for (const k of NEW) row[C[k]] = null;
  if (!w) { if ((row[C.min] || 0) >= 200) miss.push(`${row[C.name]} (${row[C.team]})`); continue; }
  hit++;
  // Win score and rank need 200+ minutes, the same bar as the skill scores.
  const ok = (row[C.min] || 0) >= 200;
  row[C.wn] = ok ? rd(n(w.win_score)) : null;
  row[C.wins] = rd(n(w.wins_added), 2); row[C.imp] = rd(n(w.impact), 1); row[C.oimp] = rd(n(w.off), 1); row[C.dimp] = rd(n(w.def), 1);
  row[C.wteam] = rd(n(w.team_part), 1); row[C.wind] = n(w.impact) == null ? null : rd(n(w.impact) - n(w.team_part), 1);
  row[C.wpts] = rd(n(w.pts_over_repl), 0); row[C.wcov] = n(w.coverage) == null ? null : Math.round(n(w.coverage) * 100);
}
// D-I rank among 200+ minute players
const ranked = R.rows.filter((r) => r[C.wn] != null).sort((a, b) => b[C.wins] - a[C.wins]);
ranked.forEach((r, i) => (r[C.rk_wn] = i + 1));
R.win = { version: "v0.2", season: "2025-26", pool: ranked.length, pointsPerWin: rd(V.points_per_win, 1), replacement: rd(V.replacement_impact, 2),
  selected: V.selected, test: { model: V.test_box_prior, teamOnly: V.test_team_only, rapm01: V.test_rapm_v01, boxOnly: V.test_box_only, constant: V.test_constant } };
writeFileSync(file, JSON.stringify(R));
console.log(`win score: matched ${hit} of ${R.rows.length}; ranked ${ranked.length}; unmatched 200+ min: ${miss.length}`, miss.slice(0, 15));
