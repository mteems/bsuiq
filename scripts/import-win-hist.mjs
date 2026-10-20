// Win and Overall scores (Win model v0.5) for every season, 2016-17 to 2025-26.
//   node scripts/import-win-hist.mjs <win_hist.csv>   (model/win_v5/rate_export.py)
// Run after scripts/import-win.mjs (which adds the 2025-26 model breakdown columns).
// Adds to every data-src/rankings/national-<season>.json and to bsu-last10.json:
//   wn Win score · rk_wn rank · ovr Overall score · rk_ovr rank · ind individual impact / 100
//   imp Impact / 100 (talent at the end of that season) · oimp / dimp its halves · wins wins added · wpts points over replacement
//   wteam / wind / wbpm / wbox / wrec the parts of Impact · wpg position group · wprk rank in his group
// Scores need 200+ minutes; ranks are among that season's D-I players with 200+ minutes.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseCSV } from "./lib-csv.mjs";

const f = process.argv[2];
if (!f) { console.error("usage: node scripts/import-win-hist.mjs <win_hist.csv>"); process.exit(1); }
const H = parseCSV(readFileSync(f, "utf8"));
const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
const rd = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const label = (y) => `${y - 1}-${String(y).slice(2)}`;
const BY = new Map(); // "2019-20|cid" → row
for (const h of H) BY.set(`${label(+h.season)}|${h.cid}`, h);
const COLS = ["wn", "rk_wn", "ovr", "rk_ovr", "ind", "imp", "oimp", "dimp", "wins", "wpts", "wteam", "wind", "wbpm", "wbox", "wrec", "wpg", "wprk"];
const dir = new URL("../data-src/rankings/", import.meta.url);
const ensure = (R) => { for (const k of COLS) if (!R.cols.includes(k)) R.cols.push(k); const C = Object.fromEntries(R.cols.map((c, i) => [c, i])); for (const r of R.rows) while (r.length < R.cols.length) r.push(null); return C; };
const fill = (r, C, h) => {
  const ok = num(h.mins) >= 200;
  r[C.wn] = ok ? rd(num(h.win_score)) : null; r[C.ovr] = ok ? rd(num(h.overall)) : null;
  r[C.ind] = rd(num(h.ind)); r[C.imp] = rd(num(h.now)); r[C.wins] = rd(num(h.wins_added), 2); r[C.wpg] = h.pg || null;
  r[C.oimp] = rd(num(h.now_o)); r[C.dimp] = rd(num(h.now_d)); r[C.wpts] = rd(num(h.pts_over_repl), 0);
  r[C.wteam] = rd(num(h.g_team)); r[C.wind] = rd(num(h.g_own)); r[C.wbpm] = rd(num(h.g_bpm)); r[C.wbox] = rd(num(h.g_box)); r[C.wrec] = rd(num(h.g_rec));
};
const RANKS = {}; // season → Map(cid → {rk_wn, rk_ovr, wprk}) from the national pool
const IDX = JSON.parse(readFileSync(new URL("index.json", dir), "utf8"));
for (const season of IDX.seasons) {
  const file = new URL(`national-${season}.json`, dir); if (!existsSync(file)) continue;
  const R = JSON.parse(readFileSync(file, "utf8")), C = ensure(R);
  let hit = 0;
  for (const r of R.rows) { for (const k of COLS) r[C[k]] = null; const h = BY.get(`${season}|${r[C.id]}`); if (h) { fill(r, C, h); hit++; } }
  const rank = (k, rk) => R.rows.filter((r) => r[C[k]] != null).sort((a, b) => b[C[k]] - a[C[k]]).forEach((r, i) => (r[C[rk]] = i + 1));
  rank("wn", "rk_wn"); rank("ovr", "rk_ovr");
  for (const g of ["G", "F", "C"]) R.rows.filter((r) => r[C.wpg] === g && r[C.wn] != null).sort((a, b) => b[C.ind] - a[C.ind]).forEach((r, i) => (r[C.wprk] = i + 1));
  RANKS[season] = new Map(R.rows.map((r) => [r[C.id], { rk_wn: r[C.rk_wn], rk_ovr: r[C.rk_ovr], wprk: r[C.wprk], pimp: r[C.pimp] ?? null, pdev: r[C.pdev] ?? null }]));
  writeFileSync(file, JSON.stringify(R));
  console.log(season, `matched ${hit} of ${R.rows.length}; Overall scores ${R.rows.filter((r) => r[C.ovr] != null).length}`);
}
// Boise St., last 10 seasons: same numbers; ranks from that season's national pool.
const bf = new URL("bsu-last10.json", dir), B = JSON.parse(readFileSync(bf, "utf8"));
for (const k of ["pimp", "pdev"]) if (!B.cols.includes(k)) B.cols.push(k); // 2026-27 projection (2025-26 rows only)
const BC = ensure(B);
let bh = 0;
for (const r of B.rows) {
  for (const k of COLS) r[BC[k]] = null;
  const h = BY.get(`${r[BC.season]}|${r[BC.id]}`); if (!h) continue; bh++; fill(r, BC, h);
  const k = RANKS[r[BC.season]]?.get(r[BC.id]); if (k) Object.assign(r, { [BC.rk_wn]: k.rk_wn, [BC.rk_ovr]: k.rk_ovr, [BC.wprk]: k.wprk, [BC.pimp]: k.pimp, [BC.pdev]: k.pdev });
}
writeFileSync(bf, JSON.stringify(B));
console.log(`bsu-last10: matched ${bh} of ${B.rows.length}`);
