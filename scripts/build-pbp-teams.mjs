// Team pages for opponents outside our NCAA play-by-play pipeline (Bismarck State, West Coast
// Baptist), built from the play-by-play the staff collected from box-score sites.
//   node scripts/build-pbp-teams.mjs data-src/pbp-teams   (the staff zip: all_play_by_play.csv, games.csv, scoring_validation.csv)
// Writes data-src/teams/<slug>.json in the same shape as scripts/build-teams.mjs (games, lineups),
// plus shot types without locations (zones) and per-player season lines, and adds the teams to
// data-src/teams/_index.json (run after build-teams.mjs, which rewrites the index).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseCSV } from "./lib-csv.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/build-pbp-teams.mjs <folder>"); process.exit(1); }
const read = (f) => parseCSV(readFileSync(join(dir, f), "utf8"));
const r1 = (v, d = 1) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const out = new URL("../data-src/teams/", import.meta.url).pathname;

// Data team name → page name (the Scouting tab's name) and our-row pattern in the score table.
const TEAMS = {
  "Bismarck State": { page: "Bismarck St.", slug: "bismarck-st", me: /bismarck|^bsc\b|mystics/i, level: "NJCAA" },
  "West Coast Baptist": { page: "West Coast Baptist", slug: "west-coast-baptist", me: /west coast|^wcb/i, level: "NCCAA" },
};
const D1_OPP = /weber st|utah valley|southern utah/i; // D-I opponents in these schedules

const ev = read("all_play_by_play.csv");
const games = new Map(read("games.csv").map((g) => [g.game_id, g]));
const valid = new Map(read("scoring_validation.csv").map((v) => [v.game_id, v]));

// ---------------------------------------------------------------- parsing
const RE = /^(GOOD|MISS) (3PTR|JUMPER|LAYUP|DUNK|TIPIN|2PTR|FT)\b/;
function parse(desc) {
  const m = desc.match(/^(.*?) by (.*)$/); if (!m) return null;
  const act = m[1].trim(); let who = m[2].replace(/\(.*$/, "").trim();
  const team = !who.includes(",") || /^(TM|TEAM)\b/i.test(who);
  return { act, who: team ? null : who };
}
const fixWho = (who) => { const [l, f = ""] = who.split(",").map((x) => x.trim()); if (/^(JR|SR|II|III|IV)\.?$/i.test(l) && f.includes(" ")) { const w = f.split(/\s+/); return `${w.pop()} ${l},${w.join(" ")}`; } return who; };
const keyOf = (who) => { who = fixWho(who); let [l, f = ""] = who.split(","); l = l.replace(/\s*(JR|SR|III|II|IV)\.?\s*$/i, "").trim(); f = f.replace(/\b(JR|SR|II|III|IV)\.?\s*$/i, "").trim(); return l.toUpperCase().replace(/[^A-Z]/g, "") + "|" + f.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1); };
const pretty = (who) => { const [l, f = ""] = fixWho(who).split(",").map((s) => s.trim()); const tc = (s) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (x, a, b) => a + b.toUpperCase()).replace(/\bMc([a-z])/g, (x, c) => "Mc" + c.toUpperCase()).replace(/\b(Ii|Iii|Iv)\b/g, (x) => x.toUpperCase()); return `${tc(f)} ${tc(l)}`.trim(); };
const clockS = (c) => { const m = String(c).match(/^(\d+):(\d+)$/); return m ? +m[1] * 60 + +m[2] : null; };

const index = existsSync(join(out, "_index.json")) ? JSON.parse(readFileSync(join(out, "_index.json"), "utf8")) : { season: "2025-26", teams: [] };
for (const [team, cfg] of Object.entries(TEAMS)) {
  const rows = ev.filter((e) => e.team === team);
  const byGame = new Map();
  for (const e of rows) { if (!byGame.has(e.game_id)) byGame.set(e.game_id, []); byGame.get(e.game_id).push(e); }
  // Display names: most common spelling per player key across the season.
  const spell = new Map();
  for (const e of rows) { const p = parse(e.description); if (!p?.who) continue; const k = keyOf(p.who); const m = spell.get(k) || new Map(); m.set(p.who, (m.get(p.who) || 0) + 1); spell.set(k, m); }
  const freqKey = new Map([...spell].map(([k, m]) => [k, [...m.values()].reduce((a, b) => a + b, 0)]));
  // Same player spelled differently by different scorekeepers (Jensen / Jenson, Anderson / Andersson):
  // same first initial and last names one letter apart → one player.
  const canon = new Map();
  for (const k of [...freqKey.keys()].sort((a, b) => freqKey.get(b) - freqKey.get(a))) {
    const [l, f] = k.split("|"), hit = [...new Set(canon.values())].find((c) => { const [cl, cf] = c.split("|"); return cf === f && l.length >= 4 && lev(cl, l) <= 1; });
    canon.set(k, hit || k);
    if (hit) { const m = spell.get(hit); for (const [w, c] of spell.get(k)) m.set(w, (m.get(w) || 0) + c); freqKey.set(hit, freqKey.get(hit) + freqKey.get(k)); }
  }
  const K = (who) => canon.get(keyOf(who)) || keyOf(who);

  const G = [], skipped = [], lrows = [], names = [], nameIdx = new Map(), defs = [], defIdx = new Map(), zones = { off: [], def: [] }, P = new Map();
  const pid = (k) => { if (!nameIdx.has(k)) { nameIdx.set(k, names.length); names.push(k); } return nameIdx.get(k); };
  for (const [gid, E] of [...byGame].sort((a, b) => a[0].localeCompare(b[0]))) {
    const g = games.get(gid), v = valid.get(gid);
    if (v && v.score_reconciles !== "True") { skipped.push(`${g?.date || gid} (${g ? oppName(g, cfg) : "?"}: the source puts both teams' plays on one side)`); continue; }
    E.sort((a, b) => +a.period - +b.period || +a.sequence - +b.sequence);
    // Which side is this team? The side whose points match our row in the score table.
    const sideTot = { away: +v?.pbp_away_points || 0, home: +v?.pbp_home_points || 0 };
    const sr = JSON.parse(g.score_rows_json || "[]"), mine = sr.find((r) => cfg.me.test(String(r[0]).replace(/^Winner /, ""))), other = sr.find((r) => r !== mine);
    const myPts = mine ? +mine[mine.length - (mine.length >= 5 ? 2 : 1)] : null;
    let side = myPts === sideTot.away && myPts !== sideTot.home ? "away" : myPts === sideTot.home && myPts !== sideTot.away ? "home" : null;
    if (!side) { // tie in score: the side whose players recur through the season
      const sc = { away: 0, home: 0 }; const seen = new Set();
      for (const e of E) { const p = parse(e.description); if (!p?.who) continue; const k = e.event_side + K(p.who); if (seen.has(k)) continue; seen.add(k); sc[e.event_side] += freqKey.get(K(p.who)) > 60 ? 1 : 0; }
      side = sc.away >= sc.home ? "away" : "home";
    }
    const gi = G.length, per = Math.max(...E.map((e) => +e.period || 1));
    const box = { us: blank(), them: blank() };
    // lineup replay
    let on = new Set(), lastClock = 1200, cur = null; const periodLen = (p) => (p <= 2 ? 1200 : 300);
    const flush = () => { if (!cur) return; if (cur.five && (cur.poss || cur.opp_poss || cur.secs)) { const ids = cur.five.map(pid).sort((a, b) => a - b), key = ids.join(","); if (!defIdx.has(key)) { defIdx.set(key, defs.length); defs.push(ids); } lrows.push([gi, defIdx.get(key), cur.poss, cur.pts, cur.opp_poss, cur.opp_pts, cur.secs / 60]); } cur = null; };
    const start = () => { flush(); cur = { five: on.size === 5 ? [...on] : null, poss: 0, pts: 0, opp_poss: 0, opp_pts: 0, secs: 0 }; };
    const appeared = new Set();
    for (let p = 1; p <= per; p++) {
      const PE = E.filter((e) => +e.period === p);
      // Who is on at the start: SUB STARTER rows, else players whose first entry this period isn't a SUB IN.
      const first = new Map();
      for (const e of PE) { if (e.event_side !== side) continue; const x = parse(e.description); if (!x?.who) continue; const k = K(x.who); if (!first.has(k)) first.set(k, x.act); }
      let st = [...first].filter(([, a]) => a === "SUB STARTER").map(([k]) => k);
      if (st.length !== 5) st = [...first].filter(([, a]) => a !== "SUB IN").map(([k]) => k);
      on = new Set(st.length === 5 ? st : []); lastClock = periodLen(p); start();
      for (const e of PE) {
        const x = parse(e.description); const s = clockS(e.clock);
        if (s != null && s <= lastClock) { if (cur) cur.secs += lastClock - s; lastClock = s; }
        if (!x) continue;
        const us = e.event_side === side, B = us ? box.us : box.them, k = x.who ? K(x.who) : null;
        if (us && k) { const pl = P.get(k) || { k, gp: new Set(), pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, to: 0, stl: 0, blk: 0, pf: 0, secs: 0 }; P.set(k, pl); if (x.act !== "SUB OUT") pl.gp.add(gi); appeared.add(k); }
        if (/^SUB (IN|OUT)$/.test(x.act)) { if (us && k) { if (x.act === "SUB IN") on.add(k); else on.delete(k); start(); } continue; }
        const pl = us && k ? P.get(k) : null;
        const m = x.act.match(RE);
        if (m) {
          const made = m[1] === "GOOD", typ = m[2];
          if (typ === "FT") { B.fta++; if (made) { B.ftm++; B.pts++; } if (pl) { pl.fta++; if (made) { pl.ftm++; pl.pts++; } } }
          else { const three = typ === "3PTR", rim = /LAYUP|DUNK|TIPIN/.test(typ), pv = three ? 3 : 2; B.fga++; if (three) B.tpa++; if (rim) B.rima++; if (made) { B.fgm++; B.pts += pv; if (three) B.tpm++; if (rim) B.rimm++; }
            (us ? zones.off : zones.def).push([gi, three ? 2 : rim ? 0 : 1, made ? 1 : 0]);
            if (pl) { pl.fga++; if (three) pl.tpa++; if (made) { pl.fgm++; pl.pts += pv; if (three) pl.tpm++; } } }
          if (cur) { if (us) cur.pts += made ? (typ === "FT" ? 1 : typ === "3PTR" ? 3 : 2) : 0; else cur.opp_pts += made ? (typ === "FT" ? 1 : typ === "3PTR" ? 3 : 2) : 0;
            const dp = typ === "FT" ? 0.44 : 1; if (us) cur.poss += dp; else cur.opp_poss += dp; }
        } else if (/^REBOUND OFF/.test(x.act)) { B.orb++; if (pl) pl.orb++; if (cur) { if (us) cur.poss -= 1; else cur.opp_poss -= 1; } }
        else if (/^REBOUND DEF/.test(x.act)) { B.drb++; if (pl) pl.drb++; }
        else if (/^TURNOVER/.test(x.act)) { B.to++; if (pl) pl.to++; if (cur) { if (us) cur.poss += 1; else cur.opp_poss += 1; } }
        else if (/^ASSIST/.test(x.act)) { B.ast++; if (pl) pl.ast++; }
        else if (/^STEAL/.test(x.act)) { B.stl++; if (pl) pl.stl++; }
        else if (/^BLOCK/.test(x.act)) { B.blk++; if (pl) pl.blk++; }
        else if (/^FOUL/.test(x.act) && !/TECH/.test(x.act)) { if (pl) pl.pf++; }
      }
      if (cur && lastClock > 0) { cur.secs += lastClock; lastClock = 0; }
      flush();
    }
    // minutes per player from the replayed stints of this game
    const U = box.us, T = box.them, poss = U.fga - U.orb + U.to + 0.44 * U.fta, dposs = T.fga - T.orb + T.to + 0.44 * T.fta;
    const opp = oppName(g, cfg);
    const row = { d: g.date, opp, oid: 0, loc: side === "home" ? "H" : "A", conf: false, pts: U.pts, op: T.pts, poss: r1(poss), dposs: r1(dposs), mins: 40 + 5 * Math.max(0, per - 2), tpp: null, dtpp: null, nd: false, d1opp: D1_OPP.test(opp), src: g.source_url };
    for (const k of ["fga", "fgm", "tpa", "tpm", "fta", "ftm", "orb", "drb", "to", "ast", "blk", "rima", "rimm"]) { row[k] = U[k]; row["d_" + k] = T[k]; }
    G.push(row);
  }
  // player minutes from lineup rows
  for (const r of lrows) for (const p of defs[r[1]]) { const pl = P.get(names[p]); if (pl) pl.secs += r[6] * 60; }
  const players = [...P.values()].filter((p) => p.gp.size).map((p) => {
    const gp = p.gp.size, nm = pretty([...spell.get(p.k)].sort((a, b) => b[1] - a[1])[0][0]);
    return { name: nm, gp, mpg: r1(p.secs / 60 / gp), fgm: p.fgm, fga: p.fga, tpm: p.tpm, tpa: p.tpa, ftm: p.ftm, fta: p.fta, pts: p.pts, ppg: r1(p.pts / gp), rpg: r1((p.orb + p.drb) / gp), orb: p.orb, drb: p.drb, ast: p.ast, apg: r1(p.ast / gp), to: p.to, stl: p.stl, blk: p.blk, pf: p.pf, fgpct: p.fga ? r1((100 * p.fgm) / p.fga) : null };
  }).sort((a, b) => b.pts - a.pts);
  const nameList = names.map((k) => pretty([...spell.get(k)].sort((a, b) => b[1] - a[1])[0][0]));
  const file = { team: cfg.page, season: "2025-26", conf: cfg.level, espnId: 0, pbpSource: true,
    src: `play-by-play from box-score sites, ${G.length} games${skipped.length ? `; left out ${skipped.join("; ")}` : ""}`,
    games: G, lineups: { names: nameList, defs, rows: lrows.map((r) => [r[0], r[1], r1(r[2]), r[3], r1(r[4]), r[5], r1(r[6], 2)]) }, shots: { off: [], def: [] }, noLoc: true, zones, players };
  writeFileSync(join(out, `${cfg.slug}.json`), JSON.stringify(file));
  index.teams = index.teams.filter((t) => t.team !== cfg.page).concat({ team: cfg.page, slug: cfg.slug, games: G.length, shots: zones.off.length, pbpSource: true });
  // checks
  const lp = lrows.reduce((a, r) => a + r[2], 0), tp = G.reduce((a, g) => a + g.poss, 0), lm = lrows.reduce((a, r) => a + r[6], 0), tm = G.reduce((a, g) => a + g.mins, 0);
  console.log(`${cfg.page}: ${G.length} games (${G.filter((g) => g.pts > g.op).length}-${G.filter((g) => g.pts < g.op).length}), skipped ${skipped.length}; lineup possessions ${Math.round(lp)} of ${Math.round(tp)}, minutes ${Math.round(lm)} of ${tm}; ${players.length} players; ${defs.length} lineups`);
}
writeFileSync(join(out, "_index.json"), JSON.stringify(index));

function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
function blank() { return { pts: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0, orb: 0, drb: 0, to: 0, ast: 0, stl: 0, blk: 0, rima: 0, rimm: 0 }; }
function oppName(g, cfg) {
  const t = g.title || "";
  if (/Bismarck State College\s*$/.test(t)) { const m = t.match(/ vs (.*?) on \d/); if (m) return m[1].trim(); }
  const sr = JSON.parse(g.score_rows_json || "[]"), o = sr.find((r) => !cfg.me.test(String(r[0]).replace(/^Winner /, "")));
  if (!o) return "Opponent";
  const toks = String(o[0]).replace(/^Winner /, "").split(/\s+/); let i = 0;
  while (i < toks.length - 1 && !/[a-z]/.test(toks[i])) i++;
  return toks.slice(i).join(" ").replace(/^Alas\. /, "Alaska ").replace(/ Warr$/, "");
}
