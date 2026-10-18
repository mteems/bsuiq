// Turns the raw result of scripts/playmaking-score.sql into
// data-src/scores/playmaking-2025-26.json.
//   node scripts/import-playmaking.mjs <raw-result.json>
// raw-result.json = the single result row: { groups: "<json>", n: 2456, rows: "<json>" }
import { readFileSync, writeFileSync } from "node:fs";

const raw = JSON.parse(readFileSync(process.argv[2], "utf8"));
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const MWC = new Set(["Air Force", "Boise State", "Colorado State", "Fresno State", "Nevada", "New Mexico", "San Diego State", "San José State", "San Jose State", "UNLV", "Utah State", "Wyoming", "Grand Canyon"]);
const GROUP = { G: "Guards", F: "Forwards", B: "Bigs" };

const groups = Object.fromEntries(parse(raw.groups).map(([g, n, a40, ash, ato, tovr, load]) => [g, { label: GROUP[g], n, avg: { a40, ash, ato, tovr, load } }]));
const rows = parse(raw.rows).map(([id, name, school, grp, gp, mpg, score, rank, a40, ash, ato, tovr, load, za, zs, zt, zv, zl]) => ({
  id, name, school, grp, gp, mpg, score, rank, mwc: MWC.has(school),
  v: { a40, ash, ato, tovr, load }, z: { a40: za, ash: zs, ato: zt, tovr: zv, load: zl },
}));
rows.sort((a, b) => a.rank - b.rank);

writeFileSync(new URL("../data-src/scores/playmaking-2025-26.json", import.meta.url), JSON.stringify({
  _about: "Playmaking score v0 (box score), 2025-26. Built by scripts/playmaking-score.sql from season box-score totals.",
  season: "2025-26", version: "v0", pool: Number(raw.n),
  weights: [["a40", "AST / 40", 30], ["ato", "AST / TO", 20], ["tovr", "TOV%", -20], ["ash", "Assist share", 15], ["load", "Plays / 40", 15]],
  groups, rows,
}, null, 1));
console.log(`imported ${rows.length} rows (pool ${raw.n})`);
