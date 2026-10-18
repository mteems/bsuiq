// Imports the skill-component scores from the RStudio project.
//   node scripts/import-skills.mjs <player_skill_components_2026_v1_1.csv>
// The CSV is written by RECRUITING_HUB_V3/scripts/00_inventory_for_site.R
// (data/site_export/). Output: data-src/scores/skills-2025-26.json
import { readFileSync, writeFileSync } from "node:fs";
import { parseCSV } from "./lib-csv.mjs";

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/import-skills.mjs <csv>"); process.exit(1); }

const num = (v) => (v === "" || v === "NA" || v == null ? null : +v);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const raw = parseCSV(readFileSync(file, "utf8")).filter((r) => r.skill_score_eligible === "TRUE");
const SKILLS = [["scoring", "scoring_score"], ["playmaking", "creation_score"], ["rebounding", "rebounding_score"], ["defense", "defense_score"]];

// Compact rows: [name, team, conf, minutes, mpg, ppg, ref(1 = 200+ min), scoring, playmaking, rebounding, defense]
// Ranks are worked out on the page, within the reference group (200+ minutes).
const rows = raw.map((r) => [r.player_name, r.team, r.conference, Math.round(num(r.minutes)), r1(num(r.mpg)), r1(num(r.ppg)),
  r.skill_reference_group === "TRUE" ? 1 : 0, ...SKILLS.map(([, c]) => r1(num(r[c])))]);
const out = {
  season: "2025-26", version: "v1.1", source: "RStudio · player_skill_components_2026_v1_1",
  pool: rows.filter((r) => r[6]).length, eligible: rows.length,
  cols: ["name", "team", "conf", "min", "mpg", "ppg", "ref", ...SKILLS.map(([k]) => k)],
  skills: SKILLS.map(([k]) => k),
  rows,
};
writeFileSync(new URL("../data-src/scores/skills-2025-26.json", import.meta.url), JSON.stringify(out));
console.log(`skills: ${rows.length} eligible players, ${out.pool} in the 200+ minute reference group`);
