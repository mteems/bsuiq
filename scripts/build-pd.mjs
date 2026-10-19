// Playmaking & Defense module data for every roster player (the layout of DWT's hand-built
// module, public/modules/pd-espn-5107273.html, generated from data so every player matches).
//   node scripts/build-pd.mjs <site_export dir>
// Reads: player_team_seasons_all.csv (our pipeline: assisted splits, RAPM, D-I games)
//        torvik/players_YYYY.csv (usage, AST%, TOV%, DRtg, Adj DRtg, DBPM, STL%, BLK%, DRB%, fouls, role)
//        team_strength_adjusted.csv (team defense, for the DEF score's halo damping)
//        team_games_2026.csv (NCAA team id → ESPN team id)
//        bsuiq_tmp/lineups.csv.gz (lineup stints with team/opponent stats, for on/off)
// Writes: data-src/pd/<player id>.json. The play-by-play parts (assist map, game log,
// live-ball turnovers, points per assist) are read from ESPN in the browser when the page opens.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parseCSV } from "./lib-csv.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/build-pd.mjs <site_export dir>"); process.exit(1); }
const root = new URL("../data-src/", import.meta.url).pathname;
const n = (v) => (v === "" || v === "NA" || v == null || isNaN(+v) ? null : +v);
const rd = (v, d = 1) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
const label = (y) => `${y - 1}-${String(y).slice(2)}`;
const yy = (y) => "'" + String(y).slice(2);
const median = (a) => { const v = a.filter((x) => x != null).sort((p, q) => p - q); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
// Percentile (100 = best): share of the pool below, ties count half. lower = lower is better.
function pctl(pool, v, lower = false) {
  const a = pool.filter((x) => x != null); if (v == null || !a.length) return null;
  let below = 0, eq = 0; for (const x of a) { if (x < v) below++; else if (x === v) eq++; }
  const p = (100 * (below + 0.5 * eq)) / a.length;
  return Math.round(lower ? 100 - p : p);
}

const roster = JSON.parse(readFileSync(join(root, "roster.json"), "utf8"));
const rows = parseCSV(readFileSync(join(dir, "player_team_seasons_all.csv"), "utf8"));
const TID = new Map();
for (const g of parseCSV(readFileSync(join(dir, "team_games_2026.csv"), "utf8"))) if (g.team_ncaa_team_id && g.team_espn_team_id) TID.set(g.team_ncaa_team_id, g.team_espn_team_id);
const search = JSON.parse(readFileSync(join(root, "search/players.json"), "utf8"));
const byEspn = new Map(search.players.map((r) => [String(r[search.pcols.indexOf("espn")]), r[0]]));
const TIDBYNAME = new Map(search.players.filter((r) => r[search.pcols.indexOf("tid")]).map((r) => [r[search.pcols.indexOf("team")], String(r[search.pcols.indexOf("tid")])]));
const TEAMD = new Map(); for (const t of parseCSV(readFileSync(join(dir, "team_strength_adjusted.csv"), "utf8"))) TEAMD.set(`${t.season}|${t.team}`, n(t.adjusted_def_rating));

// ---------------------------------------------------------------- Torvik, by season
const TV = new Map();
function torvik(y) {
  if (TV.has(y)) return TV.get(y);
  const f = join(dir, "torvik", `players_${y}.csv`);
  if (!existsSync(f)) { TV.set(y, null); return null; }
  const all = parseCSV(Array.from({ length: 70 }, (_, i) => "c" + i).join(",") + "\n" + readFileSync(f, "utf8")).map((t) => ({
    name: t.c0, team: t.c1, conf: t.c2, gp: n(t.c3), minp: n(t.c4), usg: n(t.c6), drb: n(t.c10), ast: n(t.c11), tov: n(t.c12),
    blk: n(t.c22), stl: n(t.c23), pf: n(t.c30), atr: n(t.c35), drtg: n(t.c46), adrtg: n(t.c47), dbpm: n(t.c52), mp: n(t.c54), apg: n(t.c60), spg: n(t.c61), role: t.c64 || "?",
  }));
  for (const t of all) t.passidx = t.ast != null && t.usg ? t.ast / t.usg : null;
  const pool = all.filter((t) => t.minp >= 40 && t.gp >= 15);
  // DEF score v2 (same recipe as scripts/build-rankings.mjs) with each component's z for the bars.
  const teamD = [...TEAMD].filter(([k]) => k.startsWith(y + "|")).map(([, v]) => v).filter((v) => v != null), lg = teamD.length ? mean(teamD) : 0;
  const DEFW = { dbpm: 0.25, drapm: 0.20, adjd: -0.15, stl: 0.13, blk: 0.10, drb: 0.10, pf: -0.07 };
  const dpool = all.filter((t) => t.minp >= 40);
  for (const t of dpool) { const ad = TEAMD.get(`${y}|${t.team}`) ?? lg; t._d = { dbpm: t.dbpm == null ? null : t.dbpm - (0.5 * (lg - ad)) / 5, adjd: t.adrtg == null ? null : t.adrtg + 0.5 * (lg - ad), stl: t.stl, blk: t.blk, drb: t.drb, pf: t.pf, drapm: DRAPM.get(`${y}|${norm(t.name)}|${t.team}`) ?? null }; }
  const byRole = new Map(); dpool.forEach((t) => { if (!byRole.has(t.role)) byRole.set(t.role, []); byRole.get(t.role).push(t); });
  for (const g of byRole.values()) for (const k of Object.keys(DEFW)) {
    const v = g.map((t) => t._d[k]).filter((x) => x != null), mu = v.length ? mean(v) : 0, sd = Math.sqrt(v.length ? mean(v.map((x) => (x - mu) ** 2)) : 0) || 1;
    g.forEach((t) => { (t._z ||= {})[k] = t._d[k] == null ? 0 : Math.max(-3, Math.min(3, (t._d[k] - mu) / sd)); });
  }
  dpool.forEach((t) => (t._raw = Object.entries(DEFW).reduce((s, [k, w]) => s + w * t._z[k], 0) * (t.minp / (t.minp + 15))));
  const order = [...dpool].sort((a, b) => a._raw - b._raw);
  order.forEach((t, i) => (t.defScore = (100 * (i + 0.5)) / order.length));
  [...dpool].sort((a, b) => b._raw - a._raw).forEach((t, i) => (t.defRank = i + 1));
  const out = { all, pool, dpool, find: (name, team) => all.find((t) => norm(t.name) === norm(name) && t.team === team) || all.filter((t) => norm(t.name) === norm(name)).find((t) => !team) };
  TV.set(y, out); return out;
}
const DRAPM = new Map(), ORAPM = new Map();
for (const r of rows) { const k = `${r.season}|${norm(r.player_name)}|${r.team}`; if (n(r.national_drapm) != null) DRAPM.set(k, n(r.national_drapm)); }

// ---------------------------------------------------------------- lineup stints (on/off), latest season only
let STINTS = null;
const stintFile = join(dir, "bsuiq_tmp", "lineups.csv.gz");
if (existsSync(stintFile)) STINTS = parseCSV(gunzipSync(readFileSync(stintFile)).toString("utf8"));
function onOff(team, last, first) {
  if (!STINTS) return null;
  const me = `${last}, ${first}`.toLowerCase();
  const agg = () => ({ poss: 0, pts: 0, opp_poss: 0, opp_pts: 0, opp_fga: 0, opp_fgm: 0, opp_tpa: 0, opp_tpm: 0, opp_fta: 0, opp_orb: 0, drb: 0, opp_to: 0, opp_rima: 0, opp_rimm: 0, games: new Set() });
  const on = agg(), off = agg();
  const mine = STINTS.filter((s) => s.team === team);
  const isOn = (s) => [s.player_1, s.player_2, s.player_3, s.player_4, s.player_5].some((p) => String(p).toLowerCase() === me);
  const played = new Set(mine.filter(isOn).map((s) => s.contest_id)); // only games he played in
  if (!played.size) return null;
  for (const s of mine) {
    if (!played.has(s.contest_id)) continue;
    const a = isOn(s) ? on : off; a.games.add(s.contest_id);
    for (const k of Object.keys(a)) if (k !== "games") a[k] += n(s[k]) || 0;
  }
  // Possessions = FGA − ORB + TOV + 0.44 × FTA (same as DWT's module).
  for (const a of [on, off]) a.opp_poss = a.opp_fga - a.opp_orb + a.opp_to + 0.44 * a.opp_fta;
  const games = played.size;
  const st = (a) => ({ poss: a.opp_poss, opp100: a.opp_poss ? (100 * a.opp_pts) / a.opp_poss : null, teamPts: a.pts, oefg: a.opp_fga ? (100 * (a.opp_fgm + 0.5 * a.opp_tpm)) / a.opp_fga : null, otov: a.opp_poss ? (100 * a.opp_to) / a.opp_poss : null,
    oorb: a.opp_orb + a.drb ? (100 * a.opp_orb) / (a.opp_orb + a.drb) : null, oftr: a.opp_fga ? (100 * a.opp_fta) / a.opp_fga : null, orimr: a.opp_fga ? (100 * a.opp_rima) / a.opp_fga : null, orimp: a.opp_rima ? (100 * a.opp_rimm) / a.opp_rima : null,
    o2p: a.opp_fga - a.opp_tpa ? (100 * (a.opp_fgm - a.opp_tpm)) / (a.opp_fga - a.opp_tpa) : null, o3r: a.opp_fga ? (100 * a.opp_tpa) / a.opp_fga : null, o3p: a.opp_tpa ? (100 * a.opp_tpm) / a.opp_tpa : null });
  return { on: st(on), off: st(off), games };
}

// ---------------------------------------------------------------- per player
const fmtSigned = (v, d = 1) => (v == null ? "—" : (v < 0 ? "−" : v > 0 ? "+" : "") + Math.abs(v).toFixed(d));
const fmtNeg = (v, d = 1) => (v == null ? "—" : (v < 0 ? "−" : "") + Math.abs(v).toFixed(d));
const TEAMSHORT = (s) => ({ "North Dakota St.": "NDSU", "South Dakota St.": "SDSU" })[s] || String(s || "");
const CONFSHORT = (c) => ({ MWC: "MW", AAC: "American", "C-USA": "CUSA", WAC: "WAC" })[c] || String(c || "").replace(/ (League|Conference)$/, "");
mkdirSync(join(root, "pd"), { recursive: true });
const made = [];
for (const p of roster.players) {
  const espn = p.id.startsWith("espn-") ? p.id.slice(5) : null;
  // Our pipeline rows for this player: by canonical id (via Search's ESPN match), else by name + school.
  let cid = espn ? byEspn.get(espn) : null;
  let mine = cid ? rows.filter((r) => r.canonical_player_id === cid) : [];
  if (!mine.length) { const k = norm(p.first_name + p.last_name); const hit = rows.filter((r) => norm(r.player_name) === k); const ids = [...new Set(hit.map((r) => r.canonical_player_id))]; if (ids.length === 1) { cid = ids[0]; mine = hit; } }
  mine = mine.filter((r) => n(r.minutes) > 0).sort((a, b) => +a.season - +b.season);
  if (!mine.length) { console.log(`  ${p.first_name} ${p.last_name}: no D-I seasons`); continue; }
  const cur = mine[mine.length - 1], Y = +cur.season, T = torvik(Y);
  const tme = T?.find(cur.player_name, cur.team);
  const v = Object.fromEntries(Object.entries(cur).map(([k, x]) => [k, n(x) ?? x]));
  const role = tme?.role || "?", conf = tme?.conf || "", rolePool = T ? T.pool.filter((t) => t.role === role) : [], confPool = T ? T.pool.filter((t) => t.conf === conf) : [];
  const col = (k, pool) => pool.map((t) => t[k]);
  const pmRow = (k, name, his, fmtV, lower = false, opts = {}) => {
    const dp = T ? col(k, T.pool) : [], rp = col(k, rolePool), cp = col(k, confPool);
    return [k, name, his == null ? "—" : fmtV(his), opts.dmed ?? (median(dp) == null ? "—" : opts.fm ? opts.fm(median(dp)) : median(dp).toFixed(opts.d ?? 1)), opts.nullPct ? null : pctl(dp, his, lower),
      opts.noRole ? "—" : median(rp) == null ? "—" : opts.fm ? opts.fm(median(rp)) : median(rp).toFixed(opts.d ?? 1), opts.noRole || opts.nullPct ? null : pctl(rp, his, lower), opts.noRole || opts.nullPct ? null : pctl(cp, his, lower)];
  };
  const pc1 = (x) => x.toFixed(1) + "%", f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);
  // TOV% vs players with similar usage (±3 points).
  const band = tme?.usg != null ? [Math.round(tme.usg - 3), Math.round(tme.usg + 3)] : null;
  const bandPool = band ? T.pool.filter((t) => t.usg >= band[0] && t.usg <= band[1]) : [];
  const PM = tme ? [
    pmRow("usg", "Usage", tme.usg, pc1), pmRow("ast", "AST%", tme.ast, pc1), pmRow("astg", "AST / g", tme.apg, f1, false, {}).map((x, i) => (i === 0 ? "astg" : x)),
    pmRow("atr", "AST / TO", tme.atr, f2, false, { d: 2 }), pmRow("tov", "TOV%", tme.tov, pc1, true),
    ["tovband", "TOV% vs usage peers", pc1(tme.tov), median(col("tov", bandPool)) == null ? "—" : median(col("tov", bandPool)).toFixed(1), pctl(col("tov", bandPool), tme.tov, true), "—", null, null],
    pmRow("passidx", "Pass-first index", tme.passidx, f2, false, { d: 2 }),
  ] : [];
  // apg is stored as Torvik "apg"; fix the astg row's pools to use apg
  if (tme) PM[2] = (() => { const r = pmRow("apg", "AST / g", tme.apg, f1); r[0] = "astg"; return r; })();
  const myDrapm = n(cur.national_drapm), myOrapm = n(cur.national_orapm);
  const drapmPool = T ? T.pool.map((t) => DRAPM.get(`${Y}|${norm(t.name)}|${t.team}`)).filter((x) => x != null) : [];
  const zero = (x) => (x === 0 ? null : x);
  const DM = tme ? [
    ["drapm", "Defensive RAPM", fmtSigned(myDrapm), "0.0", pctl(drapmPool, myDrapm), "—", null, null],
    pmRow("drtg", "DRtg", tme.drtg, f1, true), pmRow("adrtg", "Adj DRtg", tme.adrtg, f1, true),
    (() => { const r = pmRow("dbpm", "DBPM", tme.dbpm, (x) => fmtNeg(x), false, { fm: (x) => fmtNeg(x) }); return r; })(),
    pmRow("stl", "STL%", tme.stl, pc1), (() => { const r = pmRow("spg", "STL / g", tme.spg, f1); r[0] = "stlg"; return r; })(),
    pmRow("drb", "DRB%", tme.drb, pc1), pmRow("pf", "Fouls / 40", tme.pf, f1, true),
    (() => { const r = pmRow("blk", "BLK%", tme.blk, pc1); if (!tme.blk) { r[4] = r[6] = r[7] = null; } return r; })(),
  ] : [];
  // Usage vs TOV% heat grid over the D-I pool (1.5-point cells from 8% usage and 4% TOV).
  const grid = new Map();
  for (const t of T?.pool || []) { if (t.usg == null || t.tov == null) continue; const i = Math.floor((t.usg - 8) / 1.5), j = Math.floor((t.tov - 4) / 1.5); if (i < 0 || j < 0) continue; const k = i + "," + j; grid.set(k, (grid.get(k) || 0) + 1); }
  // Career path (Torvik seasons) and arcs: the last 4 seasons ending with this one.
  const years = [Y - 3, Y - 2, Y - 1, Y];
  const careerT = years.map((y) => { const r = mine.find((m) => +m.season === y); const t = r ? torvik(y)?.find(r.player_name, r.team) : null; return t ? { ...t, pf: t.pf } : null; });
  const path = careerT.map((t, i) => (t && t.usg != null && t.tov != null ? [rd(t.usg), rd(t.tov), yy(years[i])] : null)).filter(Boolean);
  const med = (k) => rd(median(col(k, T?.pool || [])), k === "atr" ? 2 : 1);
  const arc = (k, name, better, d = 1) => [k, name, careerT.map((t) => (t?.[k] == null ? null : rd(t[k], d))), better, d === 2 ? "f2" : "f1", med(k)];
  const arcP = [arc("usg", "Usage %", "high"), arc("ast", "AST %", "high"), arc("tov", "TOV %", "low"), arc("atr", "AST / TO", "high", 2)];
  const arcD = [arc("drtg", "DRtg", "low"), arc("dbpm", "DBPM", "high", 2), arc("stl", "STL %", "high"), arc("drb", "DRB %", "high"), arc("pf", "Fouls / 40", "low")];
  // Assisted splits (our pipeline, D-I games).
  const fgm = v.fgm || 0, tpm = v.tpm || 0, rimM = v.rim_made || 0, oth = fgm - tpm - rimM;
  const aT = v.assisted_3pm || 0, aR = v.assisted_rim_made || 0, aO = Math.max(0, (v.assisted_fgm || 0) - aT - aR);
  const SB = [["3PT makes", tpm, aT], ["At-rim makes", rimM, aR], ["Other 2 makes", oth, aO]].filter((r) => r[1] > 0);
  // DEF score v2.
  const def = tme?.defScore != null ? { score: rd(tme.defScore), rank: tme.defRank, n: T.dpool.length, rolePct: pctl(T.dpool.filter((t) => t.role === role).map((t) => t.defScore), tme.defScore), roleN: T.dpool.filter((t) => t.role === role).length,
    confRank: [...T.dpool.filter((t) => t.conf === conf)].sort((a, b) => b._raw - a._raw).findIndex((t) => t === tme) + 1, confN: T.dpool.filter((t) => t.conf === conf).length,
    z: [["dbpm", "DBPM*", 0.25, tme._z.dbpm], ["adrtg", "Adj DRtg*", 0.15, -tme._z.adjd], ["drapm", "Defensive RAPM", 0.20, tme._z.drapm], ["stl", "STL%", 0.13, tme._z.stl], ["blk", "BLK%", 0.10, tme._z.blk], ["drb", "DRB%", 0.10, tme._z.drb], ["pf", "Fouls/40", 0.07, -tme._z.pf]].map(([k, l, w, z]) => [k, l, w, rd(z, 2)]) } : null;
  // On/off (lineup stints cover the latest season only).
  const [last, ...fr] = [cur.player_name.split(" ").slice(1).join(" "), cur.player_name.split(" ")[0]];
  const oo = Y === 2026 ? onOff(cur.team, last, fr[0]) : null;
  const onoffRows = oo ? [["opp100", "Opp pts / 100", "low"], ["oefg", "Opp eFG%", "low"], ["otov", "Opp TO%", "high"], ["oorb", "Opp ORB%", "low"], ["oftr", "Opp FT rate", "low"], ["orimr", "Opp rim rate", "low"], ["orimp", "Opp rim FG%", "low"], ["o2p", "Opp 2P%", "low"], ["o3r", "Opp 3PA rate", "low"], ["o3p", "Opp 3P%", "low", 1]]
    .map(([k, l, b, dim]) => [k, l, rd(oo.on[k]), rd(oo.off[k]), b, dim || 0]).filter((r) => r[2] != null && r[3] != null) : [];
  const out = {
    id: p.id, cid, espn, name: `${p.first_name} ${p.last_name}`, first: p.first_name, last: p.last_name,
    season: label(Y), year: Y, team: cur.team, teamShort: TEAMSHORT(cur.team), teamEspn: TID.get(cur.team_ncaa_team_id) || TIDBYNAME.get(cur.team) || null, conf, confName: cur.conference, confShort: CONFSHORT(cur.conference), role,
    arcTeams: [...new Set(years.map((y) => mine.find((m) => +m.season === y)?.team).filter(Boolean).map(TEAMSHORT))], torvikYears: years.map((y, i) => (careerT[i] ? 1 : 0)),
    gamesDI: v.games_played, minutes: v.minutes, pts: v.points, fga: v.fga, fta: v.fta, ast: v.assists, tov: v.turnovers, fgm, unast: v.unassisted_fgm || 0,
    poolN: T?.pool.length || 0, roleN: rolePool.length, confN: confPool.length, torvik: !!tme,
    usg: tme?.usg ?? null, tovp: tme?.tov ?? null, astp: tme?.ast ?? null, atr: tme?.atr ?? null, mpg: tme?.mp ?? null,
    medUsg: med("usg"), medTov: med("tov"), medAtr: med("atr"), roleAtr: rd(median(col("atr", rolePool)), 2),
    band, bandN: bandPool.length, bandMed: rd(median(col("tov", bandPool))), bandPct: tme ? pctl(col("tov", bandPool), tme.tov, true) : null,
    orapm: rd(myOrapm), orapmPoss: n(cur.national_rapm_off_poss), drapm: rd(myDrapm), drapmPoss: n(cur.national_rapm_def_poss), drapmPct: pctl(drapmPool, myDrapm),
    PM, DM, H: [...grid].map(([k, c]) => `${k},${c}`).join(";"), path, arcYears: years.map(yy), arcP, arcD, SB, def,
    onoff: oo ? { games: oo.games, onPoss: Math.round(oo.on.poss), offPoss: Math.round(oo.off.poss), teamPtsOn: oo.on.teamPts, rows: onoffRows } : null,
  };
  writeFileSync(join(root, "pd", `${p.id}.json`), JSON.stringify(out));
  made.push(`${out.name} ${out.season} ${out.team} · Torvik ${tme ? "yes" : "NO"} · on/off ${oo ? "yes" : "no"} · DEF ${def?.score ?? "—"}`);
}
console.log(made.join("\n"));
// D-I ESPN team ids (the module counts creation and on/off in D-I games only, like the rest of the site).
writeFileSync(join(root, "pd", "_d1.json"), JSON.stringify([...new Set(TID.values())].map(String).sort()));
