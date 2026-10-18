// Builds the Rankings tables from the RStudio exports (data/site_export/).
//   node scripts/build-rankings.mjs <site_export folder>
// Reads:  player_team_seasons_all.csv (or player_team_seasons_2026.csv)
//         team_season_totals.csv        (optional: REB%, AST%, USG%, STL%, BLK%)
//         player_skill_components_2026_v1_1.csv
// Writes: data-src/rankings/national-2025-26.json  every D-I player, 2025-26
//         data-src/rankings/bsu-last10.json         every Boise St. player-season, last 10 seasons
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseCSV } from "./lib-csv.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/build-rankings.mjs <site_export folder>"); process.exit(1); }
const read = (f) => (existsSync(join(dir, f)) ? parseCSV(readFileSync(join(dir, f), "utf8")) : null);
const n = (v) => (v === "" || v === "NA" || v == null || isNaN(+v) ? null : +v);
const rd = (v, d = 1) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const per = (a, b) => (a == null || !b ? null : a / b);
const seasonLabel = (y) => `${y - 1}-${String(y).slice(2)}`;

const players = read("player_team_seasons_all.csv") || read("player_team_seasons_2026.csv");
const teams = read("team_season_totals.csv");
const skills = read("player_skill_components_2026_v1_1.csv") || [];

// Team totals keyed by season|team id. "mins" in the team-game table is game
// minutes (40 + OT); team player-minutes = 5x that.
const T = new Map();
for (const t of teams || []) {
  const g = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, n(v) ?? v]));
  T.set(`${t.season}|${t.team_ncaa_team_id}`, g);
}
const S = new Map();
for (const s of skills) S.set(`${s.season}|${s.canonical_player_id}|${s.team_ncaa_team_id}`, s);

// Column order for every rankings file.
const COLS = [
  "name", "id", "season", "team", "conf", "cls", "pos", "ht", "gp", "min", "mpg",
  // scoring
  "ppg", "pts40", "ts", "efg", "usg", "fga40", "p3", "tpa40", "tpar", "ftr", "ft", "rim", "rimr", "mid", "unast",
  // playmaking
  "apg", "ast40", "astp", "tov40", "tovp", "ato", "orapm",
  // rebounding
  "rpg", "reb40", "oreb40", "dreb40", "orbp", "drbp", "trbp", "pb40",
  // defense
  "spg", "bpg", "stl40", "blk40", "stlp", "blkp", "pf40", "drapm", "rapm",
  // skill scores
  "sc", "pl", "rb", "df",
];

function row(p) {
  const v = Object.fromEntries(Object.entries(p).map(([k, x]) => [k, n(x)]));
  const mp = v.minutes, f40 = (x) => (mp > 0 && x != null ? (x * 40) / mp : null);
  const t = T.get(`${p.season}|${p.team_ncaa_team_id}`);
  const tm = t ? t.mins * 5 : null; // team player-minutes
  const share = tm && mp ? (tm / 5) / mp : null; // (TmMP/5)/MP
  const tsa = (v.fga ?? 0) + 0.44 * (v.fta ?? 0);
  const sk = S.get(`${p.season}|${p.canonical_player_id}|${p.team_ncaa_team_id}`);
  const skv = (k) => (sk && sk.skill_score_eligible !== "FALSE" ? rd(n(sk[k])) : null);
  const reb = v.rebounds ?? ((v.oreb ?? 0) + (v.dreb ?? 0));
  return {
    name: p.player_name, id: p.canonical_player_id, season: seasonLabel(+p.season), team: p.team, conf: p.conference || t?.team_conference || "",
    cls: p.class || "", pos: p.position || "", ht: p.height || "", gp: v.games_played, min: rd(mp, 0), mpg: rd(v.mpg),
    ppg: rd(v.ppg), pts40: rd(f40(v.points)), ts: rd(v.ts_pct * 100), efg: rd(v.efg_pct * 100),
    usg: share && t ? rd((100 * (tsa + (v.turnovers ?? 0)) * share) / (t.fga + 0.44 * t.fta + t.to)) : null,
    fga40: rd(f40(v.fga)), p3: v.tpa ? rd(v.three_pct * 100) : null, tpa40: rd(f40(v.tpa)), tpar: rd(v.three_rate * 100),
    ftr: v.fga ? rd((100 * v.fta) / v.fga) : null, ft: v.fta ? rd(v.ft_pct * 100) : null,
    rim: v.rim_att ? rd(v.rim_pct * 100) : null, rimr: rd(v.rim_rate * 100), mid: v.mid_att ? rd(v.mid_pct * 100) : null,
    unast: v.fgm ? rd((100 * (v.unassisted_fgm ?? 0)) / v.fgm) : null,
    apg: rd(v.apg), ast40: rd(f40(v.assists)),
    astp: share && t ? rd((100 * v.assists) / ((t.fgm / share) - v.fgm)) : null,
    tov40: rd(f40(v.turnovers)), tovp: tsa + (v.turnovers ?? 0) ? rd((100 * v.turnovers) / (tsa + v.turnovers)) : null,
    ato: v.turnovers ? rd(v.assists / v.turnovers, 2) : null, orapm: rd(v.national_orapm, 2),
    rpg: rd(v.rpg), reb40: rd(f40(reb)), oreb40: rd(f40(v.oreb)), dreb40: rd(f40(v.dreb)),
    orbp: share && t ? rd((100 * v.oreb * share) / (t.orb + t.d_drb)) : null,
    drbp: share && t ? rd((100 * v.dreb * share) / (t.drb + t.d_orb)) : null,
    trbp: share && t ? rd((100 * reb * share) / (t.orb + t.drb + t.d_orb + t.d_drb)) : null,
    pb40: rd(f40(v.putback_made)),
    spg: rd(v.spg), bpg: rd(v.bpg), stl40: rd(f40(v.steals)), blk40: rd(f40(v.blocks)),
    stlp: share && t ? rd((100 * v.steals * share) / t.d_poss) : null,
    blkp: share && t ? rd((100 * v.blocks * share) / (t.d_fga - t.d_tpa)) : null,
    pf40: rd(f40(v.fouls)), drapm: rd(v.national_drapm, 2), rapm: rd(v.national_rapm_net, 2),
    sc: skv("scoring_score"), pl: skv("creation_score"), rb: skv("rebounding_score"), df: skv("defense_score"),
  };
}
const pack = (rows) => rows.map((r) => COLS.map((c) => r[c] ?? null));

const out = new URL("../data-src/rankings/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const all = players.filter((p) => n(p.minutes) > 0);
const latest = Math.max(...all.map((p) => +p.season));
const nat = all.filter((p) => +p.season === latest && n(p.minutes) >= 50).map(row);
const bsu = all.filter((p) => p.team === "Boise St." && +p.season > latest - 10).map(row);
const meta = { cols: COLS, rates: !!teams, built: new Date().toISOString() };
writeFileSync(join(out, `national-${seasonLabel(latest)}.json`), JSON.stringify({ ...meta, season: seasonLabel(latest), rows: pack(nat) }));
writeFileSync(join(out, "bsu-last10.json"), JSON.stringify({ ...meta, seasons: [...new Set(bsu.map((r) => r.season))].sort(), rows: pack(bsu) }));
console.log(`rankings: ${nat.length} players in ${seasonLabel(latest)}, ${bsu.length} Boise St. player-seasons; team rates ${teams ? "on" : "off (no team_season_totals.csv)"}`);
