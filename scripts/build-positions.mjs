// Works out where every D-I player actually played (PG, SG, SF, PF, C).
//   node scripts/build-positions.mjs <site_export folder>
// Reads:  lineups_<year>.csv              every 5-man stint (RStudio export)
//         player_team_seasons_all.csv     height + rebounding/shot profile
//         espn_rosters.csv                weight (optional, from ESPN)
// Writes: data-src/positions.json         { "<season>|<team>|<name>": [pg, sg, sf, pf, c] }
//
// Method
//  1. Size score for each player-season: 45% height, 35% weight, 20% "big
//     man" stats (offensive rebounds, blocks, rim attempts, fewer threes,
//     fewer assists), each as a z-score among D-I players that season.
//     Without a weight, height and stats share the weight.
//  2. In every stint, the five players on the floor are ranked by size: the
//     smallest is the PG ... the biggest is the C. Each player collects the
//     minutes he spent in each spot. This is what makes it context-aware: a
//     wing playing next to two bigs is a 3, the same player in a small lineup
//     is a 4.
//  3. One-for-one substitutions: players who directly replace each other
//     are pulled toward each other (25% blend), since they share a spot.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseCSV } from "./lib-csv.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/build-positions.mjs <site_export folder>"); process.exit(1); }
const read = (f) => (existsSync(join(dir, f)) ? parseCSV(readFileSync(join(dir, f), "utf8")) : null);
const n = (v) => (v === "" || v === "NA" || v == null || isNaN(+v) ? null : +v);
const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
const flip = (s) => { const i = s.indexOf(","); return i < 0 ? s : `${s.slice(i + 1).trim()} ${s.slice(0, i).trim()}`; };
const seasonLabel = (y) => `${y - 1}-${String(y).slice(2)}`;
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const zf = (vals) => { const v = vals.filter((x) => x != null), mu = mean(v), sd = Math.sqrt(mean(v.map((x) => (x - mu) ** 2))) || 1; return (x) => (x == null ? null : (x - mu) / sd); };
const parseHt = (h) => { const m = String(h || "").match(/(\d+)\D+(\d+)/); return m ? +m[1] * 12 + +m[2] : null; };

const players = read("player_team_seasons_all.csv") || [];
const espn = read("espn_rosters.csv") || [];
const WT = new Map(); // season(end year)|team|name -> weight
for (const r of espn) { const w = n(r.weight_lb); if (w) { WT.set(`${r.season}|${r.team}|${norm(r.name)}`, w); if (!WT.has(`${r.season}|*|${norm(r.name)}`)) WT.set(`${r.season}|*|${norm(r.name)}`, w); } }

const out = {}, stats = {};
for (const file of ["lineups_2025.csv", "lineups_2026.csv"]) {
  const L = read(file); if (!L) continue;
  const yEnd = +file.match(/(\d{4})/)[1]; // lineups_2026 = 2025-26 season
  // 1. size score
  const ps = players.filter((p) => +p.season === yEnd && n(p.minutes) > 0);
  const f40 = (p, k) => (n(p.minutes) ? (n(p[k]) ?? 0) * 40 / n(p.minutes) : null);
  const rows = ps.map((p) => ({ team: p.team, name: norm(p.player_name), ht: n(p.ht_inches) ?? parseHt(p.height),
    wt: WT.get(`${yEnd}|${p.team}|${norm(p.player_name)}`) ?? WT.get(`${yEnd}|*|${norm(p.player_name)}`) ?? WT.get(`${yEnd + 1}|*|${norm(p.player_name)}`) ?? null,
    orb: f40(p, "oreb"), blk: f40(p, "blocks"), rim: n(p.rim_rate), tpr: n(p.three_rate), ast: f40(p, "assists"), min: n(p.minutes) }));
  const Z = Object.fromEntries(["ht", "wt", "orb", "blk", "rim", "tpr", "ast"].map((k) => [k, zf(rows.filter((r) => r.min >= 100).map((r) => r[k]))]));
  const size = new Map();
  for (const r of rows) {
    const big = mean([Z.orb(r.orb), Z.blk(r.blk), Z.rim(r.rim), Z.tpr(r.tpr) == null ? null : -Z.tpr(r.tpr), Z.ast(r.ast) == null ? null : -Z.ast(r.ast)].filter((x) => x != null));
    const parts = [[0.45, Z.ht(r.ht)], [0.35, Z.wt(r.wt)], [0.20, big]].filter(([, v]) => v != null && isFinite(v));
    const w = parts.reduce((s, [a]) => s + a, 0);
    if (w) size.set(`${r.team}|${r.name}`, parts.reduce((s, [a, v]) => s + a * v, 0) / w);
  }
  // 2. stint slots + 3. substitution pairs
  const mins = new Map(), pairs = new Map(), disp = new Map();
  let used = 0, skipped = 0;
  for (const s of L) {
    const d = n(s.duration_mins); if (!d || d <= 0) continue;
    const five = [s.player_1, s.player_2, s.player_3, s.player_4, s.player_5].filter(Boolean).map((x) => { const nm = norm(flip(x)); disp.set(`${s.team}|${nm}`, flip(x)); return `${s.team}|${nm}`; });
    if (five.length !== 5) { skipped++; continue; }
    const sz = five.map((k) => size.get(k));
    if (sz.some((v) => v == null)) { skipped++; continue; }
    used++;
    five.map((k, i) => [k, sz[i]]).sort((a, b) => a[1] - b[1]).forEach(([k], slot) => {
      if (!mins.has(k)) mins.set(k, [0, 0, 0, 0, 0]); mins.get(k)[slot] += d;
    });
    const pin = String(s.players_in || "").split("|").map((x) => x.trim()).filter((x) => x && x !== "NA");
    const pout = String(s.players_out || "").split("|").map((x) => x.trim()).filter((x) => x && x !== "NA");
    if (pin.length === 1 && pout.length === 1) {
      const a = `${s.team}|${norm(flip(pin[0]))}`, b = `${s.team}|${norm(flip(pout[0]))}`;
      for (const [x, y] of [[a, b], [b, a]]) { if (!pairs.has(x)) pairs.set(x, new Map()); pairs.get(x).set(y, (pairs.get(x).get(y) || 0) + 1); }
    }
  }
  const share = (k) => { const m = mins.get(k); if (!m) return null; const t = m.reduce((a, b) => a + b, 0); return t ? m.map((v) => v / t) : null; };
  let count = 0;
  for (const [k, m] of mins) {
    const tot = m.reduce((a, b) => a + b, 0); if (tot < 30) continue; // need 30+ tracked minutes
    let sh = share(k);
    const P = pairs.get(k);
    if (P) {
      let w = 0; const acc = [0, 0, 0, 0, 0];
      for (const [o, c] of P) { const os = share(o); if (!os) continue; os.forEach((v, i) => (acc[i] += v * c)); w += c; }
      if (w >= 3) sh = sh.map((v, i) => 0.75 * v + 0.25 * (acc[i] / w));
    }
    const [team, nm] = k.split("|");
    out[`${seasonLabel(yEnd)}|${team}|${nm}`] = sh.map((v) => Math.round(v * 100) / 100);
    count++;
  }
  stats[seasonLabel(yEnd)] = { stints: used, skipped, players: count, withWeight: rows.filter((r) => r.wt).length, of: rows.length };
}
writeFileSync(new URL("../data-src/positions.json", import.meta.url), JSON.stringify({ built: new Date().toISOString(), slots: ["PG", "SG", "SF", "PF", "C"], stats, p: out }));
console.log("positions:", JSON.stringify(stats));
