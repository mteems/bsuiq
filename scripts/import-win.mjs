// Adds the Win score (Win model v0.5) to the 2025-26 national rankings file.
//   node scripts/import-win.mjs <folder with win_v3_players.csv + win_v3_meta.json>  (model/win_v3/export.py)
// Re-run after scripts/build-rankings.mjs, which rewrites the rankings files.
// Rows join on our canonical player id. Columns added:
//   wn Win score · rk_wn D-I rank · wins wins added · wpts points added over replacement
//   imp impact / 100 (talent now) · oimp / dimp its offense / defense halves
//   wteam team context · wind his own on-court plus-minus · wbpm BPM-type ratings · wbox box-score profile
//   ovr Overall score · rk_ovr its rank · ind individual impact / 100 (no team context; what Win uses)
//   pimp projected impact / 100 for 2026-27 (with a year of development) · pdev that development
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCSV } from "./lib-csv.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/import-win.mjs <folder>"); process.exit(1); }
const W = parseCSV(readFileSync(join(dir, "win_v3_players.csv"), "utf8"));
const M = JSON.parse(readFileSync(join(dir, "win_v3_meta.json"), "utf8").replace(/\bNaN\b/g, "null"));
const file = new URL("../data-src/rankings/national-2025-26.json", import.meta.url);
const R = JSON.parse(readFileSync(file, "utf8"));
const OLD = ["wcov"]; // v0.2 column no longer produced
for (const k of OLD) { const i = R.cols.indexOf(k); if (i >= 0) { R.cols.splice(i, 1); for (const r of R.rows) r.splice(i, 1); } }
const NEW = ["wn", "rk_wn", "wins", "wpts", "imp", "oimp", "dimp", "wteam", "wind", "wbpm", "wbox", "pimp", "pdev", "pimpo", "pimpd", "wrec", "wpg", "wprk", "ovr", "rk_ovr", "ind"];
for (const k of NEW) if (!R.cols.includes(k)) R.cols.push(k);
const C = Object.fromEntries(R.cols.map((c, i) => [c, i]));
const n = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
const rd = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const byId = new Map(W.map((w) => [w.cid, w]));
let hit = 0; const miss = [];
for (const row of R.rows) {
  while (row.length < R.cols.length) row.push(null);
  for (const k of NEW) row[C[k]] = null;
  const w = byId.get(row[C.id]);
  if (!w) { if ((row[C.min] || 0) >= 200) miss.push(`${row[C.name]} (${row[C.team]})`); continue; }
  hit++;
  const ok = (row[C.min] || 0) >= 200;
  row[C.wn] = ok ? rd(n(w.win_score)) : null; row[C.ovr] = ok ? rd(n(w.overall)) : null; row[C.ind] = rd(n(w.ind));
  row[C.wins] = rd(n(w.wins_added), 2); row[C.wpts] = rd(n(w.pts_over_repl), 0);
  row[C.imp] = rd(n(w.now)); row[C.oimp] = rd(n(w.now_o)); row[C.dimp] = rd(n(w.now_d));
  row[C.wteam] = rd(n(w.g_team)); row[C.wind] = rd(n(w.g_own)); row[C.wbpm] = rd(n(w.g_bpm)); row[C.wbox] = rd(n(w.g_box));
  row[C.wrec] = rd(n(w.g_rec)); row[C.wpg] = w.pg || null;
  row[C.pimp] = rd(n(w.proj)); row[C.pdev] = rd(n(w.dev)); row[C.pimpo] = rd(n(w.proj_o)); row[C.pimpd] = rd(n(w.proj_d));
}
// rank in individual impact / 100 within position group (guards, forwards, bigs), 200+ minutes
for (const g of ["G", "F", "C"]) R.rows.filter((r) => r[C.wpg] === g && r[C.wn] != null).sort((a, b) => b[C.ind] - a[C.ind]).forEach((r, i) => (r[C.wprk] = i + 1));
const ranked = R.rows.filter((r) => r[C.wn] != null).sort((a, b) => b[C.wins] - a[C.wins]);
ranked.forEach((r, i) => (r[C.rk_wn] = i + 1));
R.rows.filter((r) => r[C.ovr] != null).sort((a, b) => b[C.ovr] - a[C.ovr]).forEach((r, i) => (r[C.rk_ovr] = i + 1));
R.win = { version: "v0.5", gamesStandard: M.games_standard, replacementByPosition: M.replacement_by_position, season: "2025-26", pool: ranked.length, pointsPerWin: rd(M.points_per_win, 1), replacement: rd(M.replacement, 2), test: M.final.test_2026, baselines: M.final.baselines_2026 };
writeFileSync(file, JSON.stringify(R));
console.log(`win v0.5: matched ${hit} of ${R.rows.length}; ranked ${ranked.length}; unmatched 200+ min: ${miss.length}`, miss.slice(0, 10));
