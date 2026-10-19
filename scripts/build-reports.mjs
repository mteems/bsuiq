// Builds the full written scouting report for every opponent on the 2026-27 schedule
// (the same template as the hand-built Washington tab): coach, game info, preseason ranks,
// projected depth chart and stats, leaders, the coach's last 3 seasons, story, scouting keys,
// who left / who's new and the full projected roster.
//   node scripts/build-reports.mjs <site_export folder>
// Reads  data-src/rosters-2027.json, data-src/positions.json, data-src/reports/_*.json
//        <site_export>/torvik/players_2024..2026.csv, team_season_totals.csv, espn_rosters.csv
// Writes data-src/reports/<key>.json  (one per opponent)  + data-src/reports/index.json
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseCSV, parseRows } from "./lib-csv.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/build-reports.mjs <site_export folder>"); process.exit(1); }
const root = new URL("../data-src/", import.meta.url).pathname;
const J = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const R27 = J("rosters-2027.json"), KP = J("reports/_kenpom27.json"), TV = J("reports/_torvik.json"), CO = J("reports/_coaches.json"), SCHED = J("reports/_schedule.json");
const LIVE = {};
for (const l of readFileSync(join(root, "reports/_espn_live.txt"), "utf8").split("\n")) {
  if (!l.trim() || l.startsWith("#")) continue;
  const [id, name, cls, home, jersey, pos, ht, wt] = l.split("|");
  (LIVE[id] ||= []).push({ name, cls: cls ? cls[0] + cls.slice(1).toLowerCase() : "", home, jersey, pos, ht, wt: wt ? +wt : null });
}
const POS = existsSync(join(root, "positions.json")) ? J("positions.json") : { p: {} };
const OVR_PATH = join(root, "reports/_overrides.json"), OVR = existsSync(OVR_PATH) ? JSON.parse(readFileSync(OVR_PATH, "utf8")) : {};

// ---------------------------------------------------------------- helpers
const n = (v) => (v === "" || v === "NA" || v == null || isNaN(+v) ? null : +v);
const r1 = (v, d = 1) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const f1 = (v) => (v == null || !isFinite(v) ? "—" : v.toFixed(1));
const sg = (v) => (v > 0 ? "+" : "") + v.toFixed(1);
const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
const htIn = (h) => { const m = String(h || "").match(/(\d+)-(\d+)/); return m ? +m[1] * 12 + +m[2] : null; };
const last = (nm) => String(nm).split(" ").filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV|V)$/.test(w)).slice(-1)[0];
const ord = (k) => { const v = k % 100; return k + (v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][k % 10] || "th"); };
const yy = (y) => `'${String(y).slice(2)}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GOOD = "GOOD", BAD = "BAD", NEU = "NEU";

// Opponents: key, display name (scouting tab), Torvik name, ESPN id, short label, team_season_totals name, players-CSV team name.
const TEAMS = [
  ["uw", "Washington", "Washington", 264, "UW"], ["butler", "Butler", "Butler", 2086, "BUT"], ["oakland", "Oakland", "Oakland", 2473, "OAK"],
  ["nebraska", "Nebraska", "Nebraska", 158, "NEB"], ["sam-houston", "Sam Houston", "Sam Houston St.", 2534, "SHSU"], ["idaho-st", "Idaho St.", "Idaho St.", 304, "ISU"],
  ["drake", "Drake", "Drake", 2181, "DRKE"], ["north-texas", "North Texas", "North Texas", 249, "UNT"], ["north-dakota-st", "North Dakota St.", "North Dakota St.", 2449, "NDSU"],
  ["wichita-st", "Wichita St.", "Wichita St.", 2724, "WSU"], ["tamu-cc", "TAMU-CC", "Texas A&M Corpus Chris", 357, "AMCC"], ["utah-valley", "Utah Valley", "Utah Valley", 3084, "UVU"],
  ["santa-clara", "Santa Clara", "Santa Clara", 2541, "SCU"], ["new-mexico", "New Mexico", "New Mexico", 167, "UNM"], ["lamar", "Lamar", "Lamar", 2320, "LAM"],
  ["utah-st", "Utah St.", "Utah St.", 328, "USU"], ["oregon-st", "Oregon St.", "Oregon St.", 204, "ORST"], ["washington-st", "Washington St.", "Washington St.", 265, "WSU"],
  ["gonzaga", "Gonzaga", "Gonzaga", 2250, "GONZ"], ["fresno-st", "Fresno St.", "Fresno St.", 278, "FRES"], ["san-diego-st", "San Diego St.", "San Diego St.", 21, "SDSU"],
  ["texas-st", "Texas St.", "Texas St.", 326, "TXST"], ["colorado-st", "Colorado St.", "Colorado St.", 36, "CSU"],
];
// team_season_totals uses NCAA short names.
const TOT_NAME = { "Sam Houston St.": "Sam Houston", "Texas A&M Corpus Chris": "A&M-Corpus Christi", "Lamar": "Lamar University", "Northern Iowa": "UNI", "Eastern Washington": "Eastern Wash." };
// 2026-27 conference by Torvik code; for the conference-jump adjustment.
const NEWCONF = { "Washington": "B10", "Butler": "BE", "Oakland": "Horz", "Nebraska": "B10", "Sam Houston St.": "CUSA", "Idaho St.": "BSky", "Drake": "MVC", "North Texas": "Amer", "North Dakota St.": "Sum", "Wichita St.": "Amer", "Texas A&M Corpus Chris": "Slnd", "Utah Valley": "BW", "Santa Clara": "WCC", "New Mexico": "MWC", "Lamar": "Slnd", "Utah St.": "P12", "Oregon St.": "P12", "Washington St.": "P12", "Gonzaga": "P12", "Fresno St.": "P12", "San Diego St.": "P12", "Texas St.": "P12", "Colorado St.": "P12" };
// Conference strength, approximate 2025-26 KenPom conference ratings (points per 100 vs average).
// Pac-12 = the 2026-27 league (Gonzaga, SDSU, USU, Boise, CSU, OSU, WSU, Fresno, Texas St.).
const CS = { B12: 17, SEC: 16.5, B10: 15.5, BE: 12, ACC: 11, P12: 6, MWC: 5, WCC: 5, A10: 4.5, Amer: 3, MVC: 1, WAC: -3, BW: 0, CUSA: -1, SB: -2, CAA: -2, MAC: -2, Ivy: -1, Sum: -3, Horz: -4, BSky: -6, SC: -5, ASun: -5, UAC: -5, BSth: -6, MAAC: -8, MC: -8, Slnd: -8, AE: -8, PL: -9, OVC: -9, NEC: -12, SWAC: -14, MEAC: -15, ind: -10 };
const CONF_NAME = { B12: "Big 12", SEC: "SEC", B10: "Big Ten", BE: "Big East", ACC: "ACC", P12: "Pac-12", MWC: "MWC", WCC: "WCC", A10: "A-10", Amer: "American", MVC: "MVC", WAC: "WAC", BW: "Big West", CUSA: "CUSA", SB: "Sun Belt", CAA: "CAA", MAC: "MAC", Ivy: "Ivy", Sum: "Summit", Horz: "Horizon", BSky: "Big Sky", SC: "SoCon", ASun: "ASUN", UAC: "UAC", BSth: "Big South", MAAC: "MAAC", MC: "MAAC", Slnd: "Southland", AE: "Am. East", PL: "Patriot", OVC: "OVC", NEC: "NEC", SWAC: "SWAC", MEAC: "MEAC" };

// ---------------------------------------------------------------- player seasons (Barttorvik)
// Column layout of Barttorvik's player CSV (no header row).
const TC = { name: 0, team: 1, conf: 2, gp: 3, minp: 4, ortg: 5, usg: 6, efg: 7, ts: 8, orb: 9, drb: 10, ast: 11, tov: 12, ftm: 13, fta: 14, tpm: 19, tpa: 20, tp: 21, blk: 22, stl: 23, ftr: 24, yr: 25, ht: 26, num: 27, pid: 32, home: 33, rec: 34, bpm: 50, obpm: 51, dbpm: 52, mp: 54, oreb: 57, dreb: 58, treb: 59, apg: 60, spg: 61, bpg: 62, ppg: 63, role: 64 };
const SEAS = [2024, 2025, 2026];
const PL = {}; // season -> [{...}]
for (const y of SEAS) {
  const rows = parseRows(readFileSync(join(dir, `torvik/players_${y}.csv`), "utf8"));
  PL[y] = rows.map((c) => { const o = { y }; for (const [k, i] of Object.entries(TC)) o[k] = ["name", "team", "conf", "yr", "ht", "home", "role"].includes(k) ? c[i] : n(c[i]); o.key = norm(o.name); o.min = (o.gp || 0) * (o.mp || 0); return o; });
}
const byName = {};
for (const y of SEAS) { byName[y] = new Map(); for (const p of PL[y]) { if (!byName[y].has(p.key)) byName[y].set(p.key, []); byName[y].get(p.key).push(p); } }
// Team-season box totals, for the trend stats.
const TOT = {};
for (const t of parseCSV(readFileSync(join(dir, "team_season_totals.csv"), "utf8"))) {
  const v = Object.fromEntries(Object.entries(t).map(([k, x]) => [k, n(x) ?? x]));
  const s = {
    tp: (100 * v.tpm) / v.tpa, tpar: (100 * v.tpa) / v.fga, orb: (100 * v.orb) / (v.orb + v.d_drb), ftr: (100 * v.fta) / v.fga, tod: (100 * v.d_to) / v.d_poss,
    dreb: (100 * v.d_orb) / (v.d_orb + v.drb), efgd: (100 * ((v.d_fgm || 0) + 0.5 * (v.d_tpm || 0))) / v.d_fga,
  };
  (TOT[t.season] ||= {})[t.team] = s;
}
// Team 3P% (team totals file has no made threes): sum of Barttorvik player makes/attempts.
const TOT_BY_TV = {};
for (const y of SEAS) {
  const agg = {};
  for (const p of PL[y]) { const a = (agg[p.team] ||= [0, 0]); a[0] += p.tpm || 0; a[1] += p.tpa || 0; }
  TOT_BY_TV[y] = Object.fromEntries(Object.entries(agg).filter(([, a]) => a[1] > 200).map(([t, a]) => [t, (100 * a[0]) / a[1]]));
}
const TOTPCT = {}, TOTAVG = {};
for (const [y, T] of Object.entries(TOT)) {
  TOTPCT[y] = {}; TOTAVG[y] = {};
  for (const k of ["tp", "tpar", "orb", "ftr", "tod", "dreb", "efgd"]) {
    const vals = (k === "tp" ? Object.values(TOT_BY_TV[y] || {}) : Object.values(T).map((s) => s[k])).filter(isFinite).sort((a, b) => a - b);
    TOTAVG[y][k] = vals.reduce((a, b) => a + b, 0) / vals.length;
    TOTPCT[y][k] = (v, low) => { const below = vals.filter((x) => x < v).length; const p = Math.round((100 * below) / (vals.length - 1)); return low ? 100 - p : p; };
  }
}
// Where 2025-26 players are now: every D-I 2026-27 roster.
const NOW = new Map();
for (const r of parseCSV(readFileSync(join(dir, "espn_rosters.csv"), "utf8"))) if (r.season === "2027") NOW.set(norm(r.name) + "|" + Math.round((+r.height_in || 0) / 2), [r.team, +r.espn_team_id]), NOW.set(norm(r.name), NOW.has(norm(r.name)) ? "dup" : [r.team, +r.espn_team_id]);

// ---------------------------------------------------------------- projection
const PRIOR = { pts40: 10.5, reb40: 6.0, ast40: 2.0, bpm: -3.0, blk: 1.5 };
const W = { 2026: 3, 2025: 2, 2024: 1 };
const DEV = { Fr: 1.0, So: 0.6, Jr: 0.3, Sr: 0, Gr: 0 };
const MINUTES = [31.5, 30, 28.5, 27.5, 25.5, 19.5, 15.5, 11, 6.5, 3.5, 1.5, 0.8, 0.5, 0.4, 0.3, 0.2, 0.2];

// Find a roster player's D-I seasons. Prefer the same team, then height agreement.
function history(p, torvikTeam) {
  const out = [], h = htIn(p.ht);
  let teamHint = torvikTeam;
  for (const y of [2026, 2025, 2024]) {
    const c = byName[y].get(norm(p.name)) || [];
    let pick = c.find((x) => x.team === teamHint) || null;
    if (!pick) {
      const ok = c.filter((x) => !h || !htIn(x.ht) || Math.abs(htIn(x.ht) - h) <= 2);
      if (ok.length === 1) pick = ok[0];
      else if (ok.length > 1) pick = ok.sort((a, b) => b.min - a.min)[0];
    }
    if (pick) { out.push(pick); teamHint = pick.team; }
  }
  return out; // newest first
}

function project(p, H, team) {
  const newConf = NEWCONF[team.tv];
  if (!H.length) return { none: true };
  const L = H[0];
  let wm = 0, a = { pts40: 0, reb40: 0, ast40: 0, bpm: 0, blk: 0 }, tpm = 0, tpa = 0;
  for (const s of H) {
    if (!s.mp) continue;
    const w = W[s.y] * s.min;
    wm += w;
    a.pts40 += w * (s.ppg / s.mp) * 40; a.reb40 += w * (s.treb / s.mp) * 40; a.ast40 += w * (s.apg / s.mp) * 40; a.bpm += w * (s.bpm ?? 0); a.blk += w * (s.blk ?? 0);
    tpm += W[s.y] * (s.tpm || 0); tpa += W[s.y] * (s.tpa || 0);
  }
  const P = 600; // prior strength in weighted minutes (~200 recent minutes)
  const o = {};
  for (const k of Object.keys(a)) o[k] = (a[k] + P * PRIOR[k]) / (wm + P);
  // conference jump: from the conference he played in last to the new one
  const cAdj = L.team === team.tv ? 0 : clamp(0.08 * ((CS[L.conf] ?? 0) - (CS[newConf] ?? 0)), -2.0, 1.2);
  const dev = (DEV[L.yr] ?? 0) * Math.min(1, (L.min || 0) / 300);
  o.bpm += cAdj + dev;
  o.pts40 *= 1 + 0.03 * cAdj + 0.04 * dev;
  o.p3 = tpa >= 20 ? (100 * (tpm + 0.34 * 150)) / (tpa + 150) : null;
  o.cAdj = cAdj; o.dev = dev;
  const solid = H.filter((s) => s.min >= 300).length;
  o.conf = solid >= 2 && Math.abs(cAdj) < 1 ? "H" : solid >= 1 ? "M" : "L";
  return o;
}

// Depth-chart slot from ESPN position + height when no lineup data exists.
function slotOf(p) {
  const h = htIn(p.ht) || 78, pos = String(p.pos || "").toUpperCase();
  if (pos === "C" || h >= 82) return "C";
  if (pos === "F") return h <= 79 ? "W" : "F";
  return h <= 74 ? "PG" : h <= 77 ? "SG" : "W";
}
const posTeam = (H) => (H[0] ? `${H[0].team} ${yy(H[0].y)}` : "");

// ---------------------------------------------------------------- build one team
function build(t) {
  const [key, disp, tv, espn, ab] = t, team = { key, disp, tv, espn, ab };
  const coach = CO[disp];
  // roster: live ESPN names/class/hometown, with jersey/position/size from the stored export
  const st = new Map((R27.teams[espn]?.players || []).map((p) => [norm(p.name), p]));
  const ro = (LIVE[espn] || []).map((l) => { const s0 = st.get(norm(l.name)) || {}; return { ...s0, name: l.name, cls: l.cls, home: l.home, jersey: l.jersey ?? s0.jersey ?? "", pos: l.pos || s0.pos || "", ht: l.ht || s0.ht || "", wt: l.wt || s0.wt || null }; });
  const kp = KP.t[tv], tr27 = TV[2027].t[tv], tr26 = TV[2026].t[tv];
  const bkp = KP.t["Boise St."], btr = TV[2027].t["Boise St."];

  // ------ players
  const players = ro.map((p) => {
    const H = history(p, tv);
    const pr = project(p, H, team);
    const L = H[0] || null;
    const tag = L && L.team === tv ? "" : L ? "T" : p.ret ? "" : "F";
    const cls = L ? ({ Fr: "So", So: "Jr", Jr: "Sr", Sr: "Gr" }[L.yr] || L.yr) : "Fr";
    return { p, H, pr, L, tag, cls, slot: slotOf(p) };
  });
  // team level for players without D-I history (freshmen, international, JUCO, non-D-I transfers)
  const lvl = kp ? kp[1] : 0, noneBpm = lvl >= 15 ? -1.0 : lvl >= 5 ? -2.0 : -2.8;
  for (const x of players) if (x.pr.none) x.pr = { none: true, bpm: noneBpm, pts40: 10, reb40: 6, ast40: 2, conf: "L" };
  // rotation order: projected BPM, small-sample players discounted
  // who plays: projected impact plus how big a role he had last season
  // (half projected BPM + last season's share of minutes + scoring rate; no-history players
  // are assumed to start around a 25%-minutes role, upperclassmen a bit more)
  const rate = (x) => (x.pr.none ? 0.5 * x.pr.bpm + 1.0 + (/^(Jr|Sr|Gr)/.test(x.p.cls || "") ? 0.5 : 0) : 0.5 * x.pr.bpm + (4 * Math.min(x.L?.minp || 0, 80)) / 80 + (x.L?.min >= 150 ? 0.1 * ((x.L.ppg / x.L.mp) * 40 - 12) : -0.5));
  const order = [...players].sort((a, b) => rate(b) - rate(a));
  // keep at least one big (F/C 6-9+) in the top five
  const isBig = (x) => (htIn(x.p.ht) || 0) >= 81 || /C/.test(x.p.pos || "");
  if (!order.slice(0, 5).some(isBig)) { const i = order.findIndex(isBig); if (i > 4) order.splice(4, 0, order.splice(i, 1)[0]); }
  const tot = MINUTES.slice(0, order.length).reduce((a, b) => a + b, 0) || 1;
  order.forEach((x, i) => { x.mpg = r1(((MINUTES[i] ?? 0.2) * 200) / tot); x.starter = i < 5 ? 1 : 0; x.rank = i; });
  // team totals: scale scoring to the projected team points (T-Rank tempo x AdjO)
  const teamPts = tr27 ? (tr27[7] * tr27[3]) / 100 : 72;
  const raw = players.map((x) => (x.pr.pts40 * x.mpg) / 40), sum = raw.reduce((a, b) => a + b, 0) || 1, sP = teamPts / sum;
  const rraw = players.reduce((a, x) => a + (x.pr.reb40 * x.mpg) / 40, 0) || 1, sR = 35.5 / rraw;
  const araw = players.reduce((a, x) => a + (x.pr.ast40 * x.mpg) / 40, 0) || 1, sA = Math.pow(13.8 / araw, 0.6);
  for (const x of players) { x.ppg = r1(((x.pr.pts40 * x.mpg) / 40) * sP); x.rpg = r1(((x.pr.reb40 * x.mpg) / 40) * sR); x.apg = r1(((x.pr.ast40 * x.mpg) / 40) * sA); x.bpm = r1(x.pr.bpm); }

  // ------ roster table rows (same shape as the hand-built tabs)
  const adv = (L) => (L ? [L.gp, r1(L.minp), r1(L.ortg), r1(L.usg), r1(L.ts), L.tpm, L.tpa, L.tpa ? r1((100 * L.tpm) / L.tpa) : 0, r1(L.ast), r1(L.tov), r1(L.blk), r1(L.bpm)] : null);
  const keyStat = (L) => {
    if (!L) return null;
    if (L.minp < 10) return ["GP", String(L.gp)];
    if (L.ast >= 22) return ["AST%", f1(L.ast)];
    if (L.tpa >= 90 && L.tpm / L.tpa >= 0.37) return ["3P%", f1((100 * L.tpm) / L.tpa)];
    if (L.blk >= 6) return ["BLK%", f1(L.blk)];
    if (L.orb >= 10) return ["ORB%", f1(L.orb)];
    if (L.usg >= 26) return ["USG", f1(L.usg)];
    if (L.ppg >= 12) return ["PPG", f1(L.ppg)];
    if (L.bpm >= 4) return ["BPM", sg(L.bpm)];
    if (L.minp < 10) return ["GP", String(L.gp)];
    return ["ORtg", f1(L.ortg)];
  };
  const noneLabel = (x) => (x.p.home && !/, [A-Z]{2}$/.test(x.p.home) ? ["intl", x.p.home.split(", ").pop()] : x.p.home ? ["from", x.p.home.split(", ").pop()] : ["new", ""]);
  const P = players.sort((a, b) => ["PG", "SG", "W", "F", "C"].indexOf(a.slot) - ["PG", "SG", "W", "F", "C"].indexOf(b.slot) || b.mpg - a.mpg).map((x) => {
    const has = !x.pr.none && x.H.length;
    const mid = has && x.mpg >= 2 ? [x.mpg, x.ppg, x.rpg, x.apg, x.pr.p3 == null ? null : r1(x.pr.p3), x.bpm, x.pr.conf] : [x.mpg];
    return [x.p.jersey ?? "", x.p.name, x.p.pos || "", x.p.ht || "", x.p.cls || x.cls, x.tag, posTeam(x.H), x.slot, x.starter, mid, adv(x.L), keyStat(x.L) || noneLabel(x)];
  });

  // ------ leaders
  const rot = players.filter((x) => !x.pr.none && x.H.length);
  const lastPpg = (x) => (x.L ? f1(x.L.ppg) : "—");
  const leaders = [
    ["Points", [...rot].sort((a, b) => b.ppg - a.ppg).slice(0, 4).map((x) => [x.p.name, f1(x.ppg), lastPpg(x)])],
    ["Rebounds", [...rot].sort((a, b) => b.rpg - a.rpg).slice(0, 3).map((x) => [x.p.name, f1(x.rpg), x.L ? f1(x.L.treb) : "—"])],
    ["Assists", [...rot].sort((a, b) => b.apg - a.apg).slice(0, 3).map((x) => [x.p.name, f1(x.apg), x.L ? f1(x.L.apg) : "—"])],
    ["3P% · 60+ att last yr", rot.filter((x) => x.L && x.L.tpa >= 60 && x.pr.p3).sort((a, b) => b.pr.p3 - a.pr.p3).slice(0, 3).map((x) => [x.p.name, f1(x.pr.p3) + "%", f1((100 * x.L.tpm) / x.L.tpa) + "%"])],
    ["Rim protection · BLK%", rot.filter((x) => x.L && x.L.minp >= 8 && x.L.blk >= 2.5).sort((a, b) => b.L.blk - a.L.blk).slice(0, 2).map((x) => [x.p.name, f1(x.L.blk), `${Math.round(x.L.minp)}% min`])],
  ].filter((g) => g[1].length);

  // ------ who left / who's new
  const prev = PL[2026].filter((s) => s.team === tv);
  const onRoster = new Set(players.filter((x) => x.L && x.L.team === tv && x.L.y === 2026).map((x) => x.L.key));
  const minTot = prev.reduce((a, s) => a + (s.minp || 0), 0) || 1;
  const retMin = prev.filter((s) => onRoster.has(s.key)).reduce((a, s) => a + (s.minp || 0), 0);
  const gone = prev.filter((s) => !onRoster.has(s.key) && s.minp >= 8).sort((a, b) => b.minp - a.minp).map((s) => {
    const k1 = NOW.get(s.key + "|" + Math.round((htIn(s.ht) || 0) / 2)), k2 = NOW.get(s.key);
    const dest = Array.isArray(k1) ? k1 : Array.isArray(k2) ? k2 : null;
    const next = dest && dest[1] !== espn ? [dest[0], dest[1]] : s.yr === "Sr" ? ["out of eligibility", 0] : ["departed", 0];
    return [s.name, s.role || "", r1(s.minp), r1(s.ppg), r1(s.treb), r1(s.bpm), next[0], next[1]];
  });
  const newT = players.filter((x) => x.tag === "T").sort((a, b) => b.mpg - a.mpg).map((x) => [x.p.name, x.L.team, x.L.conf, r1(x.L.ppg), r1(x.L.ortg), x.L.tpa ? r1((100 * x.L.tpm) / x.L.tpa) : null, x.L.tpa, x.pr.cAdj ? (x.pr.cAdj > 0 ? "+" : "−") + Math.abs(x.pr.cAdj).toFixed(1) : "0", yy(x.L.y)]);
  const fresh = players.filter((x) => x.tag === "F");
  const rets = players.filter((x) => x.tag === "" );

  // ------ coach's last 3 seasons
  const yrs = [], trend = { adjo: [], adjd: [], tp: [], tpar: [], orb: [], ftr: [], tod: [], tempo: [] };
  for (const y of SEAS) {
    const tn = coach.stops[y], T = TV[y].t[tn], N = 362, pct = (rk) => Math.round(100 * (1 - (rk - 1) / (N - 1)));
    const B = TOT[y]?.[TOT_NAME[tn] || tn];
    yrs.push(coach.lbl?.[y] || yy(y));
    trend.adjo.push(T ? [T[3], pct(T[4])] : null); trend.adjd.push(T ? [T[5], pct(T[6])] : null); trend.tempo.push(T ? [T[7]] : null);
    const tp = TOT_BY_TV[y]?.[tn];
    trend.tp.push(tp ? [r1(tp), TOTPCT[y].tp(tp, false)] : null);
    for (const k of ["orb", "ftr", "tod"]) trend[k].push(B ? [r1(B[k]), TOTPCT[y][k](B[k], false)] : null);
    trend.tpar.push(B ? [r1(B.tpar)] : null);
  }
  const avg26 = TOTAVG[2026];
  const trends = [
    ["adjo", "AdjO", trend.adjo, tr27 ? tr27[3] : null, "high", TV[2026].avg[0]],
    ["adjd", "AdjD", trend.adjd, tr27 ? tr27[5] : null, "low", TV[2026].avg[1]],
    ["tp", "3P%", trend.tp, null, "high", r1(avg26.tp)],
    ["tpar", "3PA rate", trend.tpar, null, "style", r1(avg26.tpar)],
    ["orb", "Off. reb %", trend.orb, null, "high", r1(avg26.orb)],
    ["ftr", "FT rate", trend.ftr, null, "high", r1(avg26.ftr)],
    ["tod", "Forced TO %", trend.tod, null, "high", r1(avg26.tod)],
    ["tempo", "Tempo", trend.tempo, tr27 ? tr27[7] : null, "style", TV[2026].avg[2]],
  ].map((r) => { r[2] = r[2].map((v) => v || [null]); return r; });
  if (yrs.length) yrs.push("'27p");

  // ------ text
  const T3 = (k) => trend[k].filter(Boolean).map((v) => v[0]);
  const tparR = T3("tpar"), tparLo = Math.min(...tparR), tparHi = Math.max(...tparR), tparAvg = tparR.reduce((a, b) => a + b, 0) / (tparR.length || 1);
  const poss = (nm) => (/s$/.test(nm) ? nm + "'" : nm + "'s");
  const coachLast = last(coach.name), owner = coach.program ? `${disp}` : `${coachLast}`;
  const threeStyle = tparAvg >= avg26.tpar + 3 ? "lots of threes" : tparAvg <= avg26.tpar - 3 ? "few threes" : "an average share of threes";
  const tempoRk = trend.tempo.filter(Boolean).map((v, i) => TV[SEAS[i]].t[coach.stops[SEAS[i]]]?.[8]).filter(Boolean);
  const tempoAvgRk = tempoRk.reduce((a, b) => a + b, 0) / (tempoRk.length || 1);
  const paceStyle = tempoAvgRk <= 90 ? "a fast pace" : tempoAvgRk >= 270 ? "a slow pace" : "an average pace";
  const last26 = (k) => trend[k][2];
  const statName = { adjo: "offense", adjd: "defense", tp: "three-point shooting", orb: "offensive rebounding", ftr: "getting to the line", tod: "forcing turnovers" };
  const st26 = ["adjo", "adjd", "tp", "orb", "ftr", "tod"].map((k) => ({ k, v: last26(k)?.[0], p: last26(k)?.[1] })).filter((s) => s.p != null);
  const best = [...st26].sort((a, b) => b.p - a.p)[0], worst = [...st26].sort((a, b) => a.p - b.p)[0];
  const rk = (p) => `#${Math.max(1, Math.round(362 - (p / 100) * 361))}`;
  const fmtStat = (s) => (s.k === "adjo" || s.k === "adjd" ? `${f1(s.v)} adjusted ${s.k === "adjo" ? "offense" : "defense"} (${rk(s.p)})` : `${f1(s.v)}${s.k === "ftr" ? " FT rate" : s.k === "orb" ? "% offensive rebounding" : s.k === "tod" ? "% forced turnovers" : "% from three"} (${rk(s.p)})`);
  const topGone = gone.slice(0, 2);
  const goneTxt = topGone.length ? topGone.map((g) => `${g[0]} (${f1(g[3])} ppg${g[6] !== "departed" ? ", " + (g[6] === "out of eligibility" ? "out of eligibility" : "→ " + g[6]) : ""})`).join(" and ") : "";
  const retPct = Math.round((100 * retMin) / minTot);
  const changeHead = retPct >= 60 ? "Most of last year's rotation is back" : retPct >= 35 ? "About half of last year's minutes return" : retPct <= 5 ? `Almost nothing returns (${retPct}% of last year's minutes)` : `Only ${retPct}% of last year's minutes return`;
  const story = `<b>${coach.program ? `${poss(disp)} last three seasons` : `${poss(coachLast)} teams`}: ${threeStyle} at ${paceStyle}. ${changeHead}${newT.length ? `, with ${newT.length} transfer${newT.length > 1 ? "s" : ""} added` : ""}.</b> ${coach.program && coach.yr === 1 ? `${coach.name} takes over in his first season, so the style lines below belong to the previous staff. ` : ""}In '26 ${coach.stops[2026] === tv ? poss(disp) : `at ${coach.stops[2026]}, his team's`} best area was ${statName[best.k]}: ${fmtStat(best)}. The weak spot was ${statName[worst.k]}: ${fmtStat(worst)}.${goneTxt ? ` Gone: ${goneTxt}.` : ""}${newT.length ? ` The top newcomer${newT.length > 1 ? "s are" : " is"} ${newT.slice(0, 2).map((n) => `${n[0]} (${f1(n[3])} ppg at ${n[1]})`).join(" and ")}.` : ""}`;

  // keys: two strengths (best projected players), two neutral, two concerns
  const keyPlayers = [...rot].filter((x) => x.L.min >= 250).sort((a, b) => b.ppg + 1.5 * b.bpm - (a.ppg + 1.5 * a.bpm));
  const role = (L) => (L.ppg >= 15 ? ["go-to scorer", L.ts >= 56 ? "Efficient first option" : L.usg >= 26 ? "High-usage first option, inefficient" : "First scoring option"] : L.ast >= 22 ? ["the point", "Table-setter"] : L.tpa >= 80 && L.tpm / L.tpa >= 0.36 ? ["the shooter", `${f1((100 * L.tpm) / L.tpa)}% from three on volume`] : L.blk >= 6 ? ["rim protector", "Shot-blocker in the middle"] : L.usg >= 26 ? ["volume scorer", "Takes a big share of the shots"] : L.ftr >= 45 && L.usg >= 18 ? ["downhill driver", "Lives at the free-throw line"] : L.orb >= 10 || L.drb >= 22 ? ["glass cleaner", "Wins the rebounds"] : L.stl >= 2.8 ? ["ball hawk", `${f1(L.stl)} STL% on defense`] : L.dbpm >= 2.5 ? ["defender", "Defense-first starter"] : L.bpm >= 3 && L.usg < 18 ? ["the glue", "Efficient low-usage piece"] : L.ppg >= 11 ? ["the scorer", "Primary scoring option"] : L.bpm >= 3 ? ["two-way piece", "Productive in his minutes"] : L.ppg >= 7 ? ["secondary scorer", "Next in line for shots"] : ["role player", "Fills a spot in the rotation"]);
  const roleOld = (L) => (L.ppg >= 15 ? ["go-to scorer", L.usg >= 26 ? "High-usage first option" : "Efficient first option"] : L.ast >= 22 ? ["the point", "Table-setter"] : L.usg >= 26 ? ["volume scorer", "Takes a big share of the shots"] : L.tpa >= 100 && L.tpm / L.tpa >= 0.37 ? ["the shooter", "Catch-and-shoot threat"] : L.blk >= 6 ? ["rim protector", "Shot-blocker in the middle"] : L.orb >= 10 || L.drb >= 22 ? ["glass cleaner", "Wins the rebounds"] : L.bpm >= 3 && L.usg < 18 ? ["the glue", "Efficient low-usage starter"] : L.ppg >= 12 ? ["the scorer", "Primary scoring option"] : L.bpm >= 4 ? ["two-way piece", "Productive in his minutes"] : ["rotation piece", "Steady minutes"]);
  const line = (x) => { const L = x.L, tp = L.tpa ? `${L.tpm}-of-${L.tpa} (${f1((100 * L.tpm) / L.tpa)}%) from three` : "no threes";
    return `${L.team === tv ? "Last season" : `At ${L.team} in ${yy(L.y)}`}: <b>${f1(L.ppg)} ppg, ${f1(L.treb)} rpg, ${f1(L.apg)} apg</b>, ${f1(L.usg)}% usage, ${f1(L.ts)} TS%, ${tp}, ${f1(L.ast)} AST%, ${f1(L.tov)} TOV%, BPM ${sg(L.bpm)}.`; };
  const proj = (x) => ` Projected ${f1(x.mpg)} mpg, ${f1(x.ppg)} ppg${x.pr.cAdj ? ` (BPM adjusted ${x.pr.cAdj > 0 ? "+" : "−"}${Math.abs(x.pr.cAdj).toFixed(1)} for the ${CONF_NAME[x.L.conf] || x.L.conf} → ${CONF_NAME[NEWCONF[tv]] || NEWCONF[tv]} move)` : ""}.`;
  const flaw = (L) => (L.tov >= 20 ? ` <b>Turnovers are the soft spot:</b> ${f1(L.tov)} TOV%.` : (L.tpa >= 80 && L.tpm / L.tpa < 0.31) || (L.tpa >= 45 && L.tpm / L.tpa < 0.28) ? ` <b>The three is the shot to give him:</b> ${f1((100 * L.tpm) / L.tpa)}% on ${L.tpa} attempts.` : L.ts < 50 && L.usg >= 20 ? ` <b>Efficiency is the question:</b> ${f1(L.ts)} TS% on ${f1(L.usg)}% usage.` : "");
  const keys = [];
  keyPlayers.slice(0, 2).forEach((x) => { const [r, sub] = role(x.L); keys.push([GOOD, `${x.p.name} · ${r}`, sub, line(x) + proj(x) + flaw(x.L)]); });
  keyPlayers.slice(2, 4).forEach((x) => { const [r, sub] = role(x.L); keys.push([NEU, `${x.p.name} · ${r}`, sub, line(x) + proj(x) + flaw(x.L)]); });
  if (keys.length < 4 && best) keys.push([GOOD, statName[best.k][0].toUpperCase() + statName[best.k].slice(1), `${rk(best.p)} nationally in '26`, `${fmtStat(best)} in '26; ${trend[best.k].map((v) => (v && v[0] != null ? f1(v[0]) : "—")).join(" → ")} over three seasons. The most likely thing to carry over to a new roster is the coach's system.`]);
  if (keys.length < 4 && fresh.length) { const up = fresh.filter((x) => /^(Jr|Sr|Gr)/.test(x.p.cls || "")).sort((a, b) => b.mpg - a.mpg);
    keys.push([NEU, "Unknowns in the rotation", `${fresh.length} players with no D-I stats`, `${up.length ? `Upperclassmen with no D-I history (JUCO, D-II or international): <b>${up.slice(0, 4).map((x) => `${x.p.name} (${x.p.ht}${x.p.home ? ", " + x.p.home : ""})`).join(", ")}</b>. ` : ""}${fresh.length - up.length ? `${fresh.length - up.length} freshmen. ` : ""}Projected minutes for these players are placeholders until games are played.`]); }
  // team concern from the coach's numbers
  const w3 = trend[worst.k].map((v) => (v && v[0] != null ? f1(v[0]) : "—")).join(" → ");
  keys.push([BAD, `${statName[worst.k][0].toUpperCase() + statName[worst.k].slice(1)}`, `${rk(worst.p)} nationally in '26`, `${owner === disp ? "The program" : poss(coachLast) + " teams"}: <b>${w3}</b> over the last three seasons (${yrs.slice(0, 3).join(", ")}). ${worst.k === "adjd" ? "Lower is better." : ""} D-I average ${f1(trends.find((r) => r[0] === worst.k)[5])}.`]);
  // roster concern
  const sloppy = rot.filter((x) => x.mpg >= 15 && x.L.tov >= 20).sort((a, b) => b.L.tov - a.L.tov)[0];
  const brick = rot.filter((x) => x.mpg >= 15 && x.L.tpa >= 80 && x.L.tpm / x.L.tpa < 0.31).sort((a, b) => a.L.tpm / a.L.tpa - b.L.tpm / b.L.tpa)[0];
  if (retPct < 30) keys.push([BAD, "Rebuilt roster", `${retPct}% of last season's minutes return`, `${rets.length} returner${rets.length === 1 ? "" : "s"}, ${newT.length} D-I transfer${newT.length === 1 ? "" : "s"}, ${fresh.length} freshmen/intl/other. ${goneTxt ? `Lost ${goneTxt}.` : ""} New groups tend to be sloppiest early, so the November games matter most for the projection.`]);
  else if (sloppy) keys.push([BAD, `Ball security · ${last(sloppy.p.name)}`, `${f1(sloppy.L.tov)} TOV% in a projected ${f1(sloppy.mpg)} mpg`, `${sloppy.p.name}: <b>${f1(sloppy.L.tov)} TOV%, ${f1(sloppy.L.ortg)} ORtg</b> on ${f1(sloppy.L.usg)}% usage${sloppy.L.team !== tv ? ` at ${sloppy.L.team}` : ""}. Pressure him.`]);
  else if (brick) keys.push([BAD, `Shooting hole · ${last(brick.p.name)}`, `${f1((100 * brick.L.tpm) / brick.L.tpa)}% from three on volume`, `${brick.p.name}: <b>${brick.L.tpm}-of-${brick.L.tpa}</b> from three${brick.L.team !== tv ? ` at ${brick.L.team}` : ""}. Help off him.`]);
  else { const w2 = [...st26].sort((a, b) => a.p - b.p)[1]; if (w2) keys.push([BAD, statName[w2.k][0].toUpperCase() + statName[w2.k].slice(1), `${rk(w2.p)} nationally in '26`, `${fmtStat(w2)} in '26. ${trend[w2.k].map((v) => (v && v[0] != null ? f1(v[0]) : "—")).join(" → ")} over three seasons.`]); }

  // ------ KPIs
  const tone = (rkv) => (rkv <= 100 ? GOOD : rkv >= 230 ? BAD : NEU);
  const better = kp && bkp ? (kp[0] < bkp[0] ? `${disp} rated higher than Boise` : `Boise rated higher`) : "";
  const kpis = [
    ["kenpom", "Preseason ranks", `#${kp?.[0] ?? "—"} · #${tr27?.[0] ?? "—"}`, "", `KenPom · T-Rank. <b style='color:#fff'>Boise: #${bkp[0]} · #${btr[0]}</b>. ${better}.`],
    ["adjo", "Proj. offense", f1(kp?.[2]), tone(kp?.[3] ?? 180), `KenPom AdjO · #${kp?.[3]}<br>T-Rank ${f1(tr27?.[3])} (#${tr27?.[4]})`],
    ["adjd", "Proj. defense", f1(kp?.[4]), tone(kp?.[5] ?? 180), `KenPom AdjD · #${kp?.[5]}<br>T-Rank ${f1(tr27?.[5])} (#${tr27?.[6]})`],
    ["retmin", "Returning minutes", `${retPct}%`, retPct >= 55 ? GOOD : retPct < 30 ? BAD : NEU, `${rets.length} returners${topGone.length ? ` · lost ${topGone.map((g) => `${last(g[0])} (${g[6] === "out of eligibility" ? "eligibility" : g[6] === "departed" ? "departed" : "→ " + g[6]})`).join(", ")}` : ""}`],
    ["", "Last season", tr26?.[1] ?? "—", "", `${tr26?.[2] ?? ""} ${CONF_NAME[tr26?.[9]] || tr26?.[9] || ""} · T-Rank #${tr26?.[0] ?? "—"}`],
    ["", "Roster build", `${newT.length} · ${fresh.length} · ${rets.length}`, "", "transfers · freshmen/intl/other · returners"],
    ["tpar", "3PA rate, 3 yrs", `${Math.round(tparLo)}–${Math.round(tparHi)}%`, NEU, `D-I avg ${f1(avg26.tpar)}%. ${coach.program ? "The program takes" : poss(coachLast) + " teams take"} ${threeStyle}`],
    ["tempo", "Proj. tempo", f1(kp?.[6]), NEU, `KenPom · #${kp?.[7]} · '26 was ${f1(tr26?.[7])} (${tr26?.[8] <= 90 ? "fast" : tr26?.[8] >= 270 ? "slow" : "about average"})`],
  ];

  // ------ game info
  const games = SCHED.games.filter((g) => g[1] === disp);
  const g0 = games.find((g) => !g[6]) || games[0], res = games.find((g) => g[6]);
  const dt = (g) => new Date(g[0] + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  const where = (g) => (g[2] === "H" ? "Home" : g[2] === "A" ? "Away" : "Neutral");
  const game = g0 ? { date: g0[0], label: `${g0[5] && g0[5] !== "Pac-12" ? g0[5] : g0[5] === "Pac-12" ? "Pac-12 game" : "Non-conference"} · ${where(g0)}`, pill: `${dt(g0)} · ${g0[4]}${/TBA/.test(g0[4]) ? "" : " MT"}`, venue: g0[3], more: games.filter((g) => g !== g0).map((g) => `${g[6] ? "Played" : "Also"} ${dt(g)} · ${where(g)}${g[6] ? ` · <b>${g[6]}</b>` : ""}`), result: res ? res[6] : null } : null;

  return {
    key, name: disp, tv, id: espn, ab, conf: NEWCONF[tv], coach: `HC ${coach.name} (yr ${coach.yr}) · ${coach.rec}`, coachBio: coach.bio, kp: kp ? String(kp[0]) : "", mode: "proj",
    game, kpis,
    depthCap: `Depth chart and minutes are Bronco IQ projections from last season's data. <span class="tag new">NEW</span> transfer · <span class="tag fr">FR</span> freshman / intl / no D-I stats · no tag = returner.`,
    leadHdr: "proj · last yr", leaders,
    trendHdr: coach.program ? `${poss(disp)} last 3 seasons (previous staff) · ◇ = '27 T-Rank projection` : coach.stops[2024] !== coach.stops[2026] ? `${poss(coachLast)} last 3 seasons · ${yrs.slice(0, 3).join(" · ")} · ◇ = '27 T-Rank projection` : `${poss(coachLast)} last 3 seasons · ◇ = '27 T-Rank projection`,
    yrs, story, trends, keys,
    midHdr: ["2026-27 projection", ["MPG", "PPG", "RPG", "APG", "<span data-def='p3'>3P%</span>", "<span data-def='bpm'>BPM</span>", "<span data-def='conf'>Conf.</span>"]], advHdr: "Last D-I season (Torvik)",
    P, slots: ["PG", "SG", "W", "F", "C"],
    left: { rows: gone, pct: Math.round(100 - retPct), team: tv },
    newc: newT, fresh: fresh.map((x) => [x.p.name, x.p.ht, x.p.home || "", x.p.cls || ""]),
    retPct, built: new Date().toISOString(),
  };
}

const index = [];
for (const t of TEAMS) {
  const r = build(t);
  const o = OVR[t[0]]; if (o) Object.assign(r, o);
  writeFileSync(join(root, `reports/${t[0]}.json`), JSON.stringify(r));
  index.push(t[0]);
  console.log(t[1].padEnd(18), `${r.P.length} players · ret ${r.retPct}% · new ${r.newc.length} · left ${r.left.rows.length}`);
}
writeFileSync(join(root, "reports/index.json"), JSON.stringify({ built: new Date().toISOString(), teams: index }));
