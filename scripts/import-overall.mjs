// Overall score v1 for every season, 2016-17 to 2025-26 (model/overall_v1).
//   node scripts/import-overall.mjs <overall_final.csv>
// Run after scripts/import-win-hist.mjs. Adds / replaces in national-<season>.json and bsu-last10.json:
//   ovr Overall score · rk_ovr rank · oprk rank among his position group (guards, forwards, bigs)
//   tal Talent / 100 (points per 100 possessions vs. an average D-I rotation player) · talo / tald its halves
//   oval value: points per 100 team possessions he adds over a replacement player at his position, at his minutes
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseCSV } from "./lib-csv.mjs";
const f = process.argv[2];
if (!f) { console.error("usage: node scripts/import-overall.mjs <overall_final.csv>"); process.exit(1); }
const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
const rd = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const label = (y) => `${y - 1}-${String(y).slice(2)}`;
const BY = new Map(parseCSV(readFileSync(f, "utf8")).map((h) => [`${label(+h.season)}|${h.cid}`, h]));
const COLS = ["ovr", "rk_ovr", "oprk", "tal", "talo", "tald", "oval"];
const dir = new URL("../data-src/rankings/", import.meta.url);
const ensure = (R) => { for (const k of COLS) if (!R.cols.includes(k)) R.cols.push(k); const C = Object.fromEntries(R.cols.map((c, i) => [c, i])); for (const r of R.rows) while (r.length < R.cols.length) r.push(null); return C; };
const fill = (r, C, h) => { r[C.ovr] = num(h.mins) >= 200 ? rd(num(h.ovr)) : null; r[C.tal] = rd(num(h.tal)); r[C.talo] = rd(num(h.talo)); r[C.tald] = rd(num(h.tald)); r[C.oval] = rd(num(h.oval), 2); };
const IDX = JSON.parse(readFileSync(new URL("index.json", dir), "utf8")), RK = {};
for (const season of IDX.seasons) {
  const file = new URL(`national-${season}.json`, dir); if (!existsSync(file)) continue;
  const R = JSON.parse(readFileSync(file, "utf8")), C = ensure(R); let hit = 0;
  for (const r of R.rows) { for (const k of COLS) r[C[k]] = null; const h = BY.get(`${season}|${r[C.id]}`); if (h) { fill(r, C, h); r._pg = h.pg; hit++; } }
  R.rows.filter((r) => r[C.ovr] != null).sort((a, b) => b[C.ovr] - a[C.ovr]).forEach((r, i) => (r[C.rk_ovr] = i + 1));
  for (const g of ["G", "F", "C"]) R.rows.filter((r) => r._pg === g && r[C.ovr] != null).sort((a, b) => b[C.ovr] - a[C.ovr]).forEach((r, i) => (r[C.oprk] = i + 1));
  RK[season] = new Map(R.rows.map((r) => [r[C.id], [r[C.rk_ovr], r[C.oprk]]]));
  for (const r of R.rows) delete r._pg;
  writeFileSync(file, JSON.stringify(R)); console.log(season, `matched ${hit}; Overall ${R.rows.filter((r) => r[C.ovr] != null).length}`);
}
const bf = new URL("bsu-last10.json", dir), B = JSON.parse(readFileSync(bf, "utf8")), BC = ensure(B);
for (const r of B.rows) { for (const k of COLS) r[BC[k]] = null; const h = BY.get(`${r[BC.season]}|${r[BC.id]}`); if (!h) continue; fill(r, BC, h); const k = RK[r[BC.season]]?.get(r[BC.id]); if (k) [r[BC.rk_ovr], r[BC.oprk]] = k; }
writeFileSync(bf, JSON.stringify(B)); console.log("bsu-last10 done");
