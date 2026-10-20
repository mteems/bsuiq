// The college player pool shared by Player Search and the player pages.
// Numbers: our play-by-play pipeline (/data/search/players.json, D-I games only).
// ESPN ids (headshots, game logs) and team logos / 2026-27 conferences: matched through the
// Recruiting Hub (read-only), our own ESPN team rosters, and staff fixes in /api/search/links.
import { getJSON } from "/assets/core.js";
import * as H from "/assets/search-logic.js";

export const nameKey = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/["“”][^"“”]*["“”]/g, " ").replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, " ").replace(/[^a-z]/g, "");
const schoolKey = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(university|college|the|of)\b/g, " ").replace(/\bst\b/g, "state").replace(/\bsaint\b/g, "state").replace(/\s+/g, " ").trim();
const tokens = (s) => new Set(schoolKey(s).split(" ").filter((t) => t && t !== "state"));
// NCAA short names the hub spells differently.
const TEAM_ALIAS = { "Central Conn. St.": "Central Connecticut", "St. John's (NY)": "St. John's", Hawaii: "Hawai'i", "IU Indy": "IU Indianapolis", "Col. of Charleston": "Charleston", "Saint Mary's (CA)": "Saint Mary's", NIU: "Northern Illinois", FDU: "Fairleigh Dickinson", ULM: "UL Monroe", "West Ga.": "West Georgia" };
export function sameSchool(a, b) {
  a = TEAM_ALIAS[a] || a;
  const x = schoolKey(a), y = schoolKey(b);
  if (!x || !y) return false;
  if (x === y || x.startsWith(y + " ") || y.startsWith(x + " ")) return true;
  const A = tokens(a), B = tokens(b); let o = 0; for (const t of A) if (B.has(t)) o++;
  return o > 0 && o / Math.max(1, Math.min(A.size, B.size)) >= 0.99;
}
const darkLogo = (u) => String(u || "").replace("/teamlogos/ncaa/500/", "/teamlogos/ncaa/500-dark/");
export const headshotUrl = (espn, w = 150, h = 110) => `https://a.espncdn.com/combiner/i?img=/i/headshots/mens-college-basketball/players/full/${espn}.png&w=${w}&h=${h}&scale=crop`;

function link(pool, hub, links) {
  const { P, teamInfo, confLogo } = pool;
  const brand = new Map(hub.teams.map(([n, c, l, al]) => [n, { name: n, conf: c, logo: darkLogo(l), aliases: al || [] }]));
  for (const [n, l] of hub.confs) confLogo.set(n, l);
  // 1) Hub ESPN ids by name + school (or unique name, for players who moved).
  const byName = new Map();
  for (const r of hub.players) { const k = nameKey(r[1] + r[2]); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(r); }
  const ourCount = new Map(); for (const p of P) { const k = nameKey(p.first_name + p.last_name); ourCount.set(k, (ourCount.get(k) || 0) + 1); }
  const votes = new Map();
  for (const p of P) {
    const k = nameKey(p.first_name + p.last_name), all = byName.get(k) || [];
    const c = all.filter((r) => sameSchool(p.school, r[3]));
    if (!c.length && all.length === 1 && ourCount.get(k) === 1) { p.espnH = all[0][0]; continue; }
    if (c.length === 1) { p.espnH = c[0][0]; const v = votes.get(p.school) || new Map(); v.set(c[0][3], (v.get(c[0][3]) || 0) + 1); votes.set(p.school, v); }
  }
  // 2) Our team name → the hub's school → logo + 2026-27 conference (ESPN logo by team id as backup).
  const hubSchool = new Map();
  for (const [t, v] of votes) hubSchool.set(t, [...v].sort((a, b) => b[1] - a[1])[0][0]);
  for (const t of new Set(P.map((p) => p.school))) {
    let b = brand.get(hubSchool.get(t));
    if (!b) for (const x of brand.values()) if (sameSchool(t, x.name) || x.aliases.some((a) => sameSchool(t, a))) { b = x; break; }
    teamInfo.set(t, b ? { ...b } : null);
  }
  for (const p of P) if (p.tid && !teamInfo.get(p.school)?.logo) teamInfo.set(p.school, { ...(teamInfo.get(p.school) || { name: p.school, conf: "" }), logo: `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${p.tid}.png` });
  // 3) Final ESPN id: staff fix > our team-roster match > hub match.
  for (const p of P) {
    p.espn = links.espn?.[p.id] || p.espnB || p.espnH || "";
    p.photoUrl = links.photo?.[p.id] || (p.espn ? headshotUrl(p.espn) : "");
    p.photo = !!p.photoUrl;
    const b = teamInfo.get(p.school); p.logo = b?.logo || "";
    // 2026-27 conference from ESPN (by team id); the hub's conference field has errors (e.g. Texas Southern as SEC).
    p.conference = pool.conf27?.[p.tid] || p.conference;
    if (b) b.conf = p.conference;
  }
}

export async function loadPool({ refresh = false } = {}) {
  const [data, hub, rosters, links, c27] = await Promise.all([
    getJSON("/data/search/players.json"),
    getJSON("/api/hub/link" + (refresh ? "?refresh=1" : "")).catch((e) => ({ teams: [], confs: [], players: [], error: String(e.message || e) })),
    getJSON("/data/rosters-2027.json").catch(() => ({})),
    getJSON("/api/search/links").catch(() => ({ espn: {}, photo: {} })),
    getJSON("/data/conf-2027.json").catch(() => ({ conf: {} })),
  ]);
  const pc = data.pcols, sc = data.scols;
  const P = data.players.map((r) => { const o = Object.fromEntries(pc.map((k, i) => [k, r[i]])); return { id: o.id, first_name: o.first, last_name: o.last, school: o.team, conference: o.conf, position: o.pos, height: o.ht, class_year: o.cls, jersey_number: o.jersey, hometown: o.home, high_school: o.hs, espnB: o.espn || "", tid: o.tid || "", weight: o.wt || null, seasons: [] }; });
  for (const r of data.seasons) {
    const s = Object.fromEntries(sc.map((k, i) => [k, r[i]]));
    s.three_pa_pg = s.gp > 0 ? Math.round((s.three_pa / s.gp) * 10) / 10 : 0;
    P[s.p].seasons.push(s);
  }
  // Skill scores (2025-26) ride on the current season so Search can show and sort them like stats.
  data.players.forEach((r, i) => { const cur = P[i].seasons[0]; if (!cur) return; for (const k of ["sk_sc", "sk_pl", "sk_rb", "sk_df", "sk_wn"]) { const j = pc.indexOf(k); if (j >= 0) cur[k] = r[j]; } });
  const pool = { P, byId: new Map(P.map((p) => [p.id, p])), teamInfo: new Map(), confLogo: new Map(), D1: rosters.d1 ? new Set(rosters.d1.map(String)) : null, links, conf27: c27.conf || {},
    meta: { built: data.built, note: data.note, hubError: hub.error, season: data.season } };
  link(pool, hub, links);
  pool.TEAMS = [...new Set(P.map((p) => p.school))].sort();
  pool.CONFS = [...new Set([...H.conferenceOptions, ...P.map((p) => p.conference).filter(Boolean)])];
  return pool;
}

// ---------------------------------------------------------------- ESPN game logs
// ESPN turns the Bronco IQ server away right now, so the browser asks ESPN directly when the
// server can't. Rows come back in the hub's game shape (game_id, game_date, opponent, ...).
const madeAtt = (v) => { const [m, a] = String(v ?? "").split("-").map((x) => Number.parseFloat(x) || 0); return [m || 0, a || 0]; };
function parseGameLog(j, season) {
  const names = j.names || [], events = j.events || {}, rows = new Map();
  for (const st of j.seasonTypes || []) for (const cat of st.categories || []) {
    if (cat.type && cat.type !== "event") continue;
    for (const e of cat.events || []) {
      const ev = events[e.eventId]; if (!ev) continue;
      const s = Object.fromEntries(names.map((n, i) => [n, e.stats?.[i]])), f = (k) => Number.parseFloat(s[k]) || 0;
      const [fgm, fga] = madeAtt(s["fieldGoalsMade-fieldGoalsAttempted"]), [tpm, tpa] = madeAtt(s["threePointFieldGoalsMade-threePointFieldGoalsAttempted"]), [ftm, fta] = madeAtt(s["freeThrowsMade-freeThrowsAttempted"]);
      const home = String(ev.team?.id ?? "") === String(ev.homeTeamId ?? ""), n = (v) => (v == null || v === "" ? null : +v);
      rows.set(e.eventId, { id: e.eventId, date: ev.gameDate || "", opp: ev.opponent?.displayName || ev.opponent?.abbreviation || "Opponent", oppId: ev.opponent?.id || null, atVs: ev.atVs || "", result: ev.gameResult || "", tm: n(home ? ev.homeTeamScore : ev.awayTeamScore), op: n(home ? ev.awayTeamScore : ev.homeTeamScore), min: f("minutes"), pts: f("points"), reb: f("totalRebounds"), ast: f("assists"), stl: f("steals"), blk: f("blocks"), to: f("turnovers"), fgm, fga, tpm, tpa, ftm, fta, season });
    }
  }
  return [...rows.values()];
}
const endYear = (s) => +String(s).slice(0, 4) + 1;
async function gamesDirect(espn, seasons) {
  const out = [], errors = [];
  await Promise.all(seasons.map(async (s) => {
    try {
      const r = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/${espn}/gamelog?region=us&lang=en&contentorigin=espn&season=${endYear(s)}`);
      if (!r.ok) throw new Error("ESPN " + r.status);
      out.push(...parseGameLog(await r.json(), s));
    } catch (e) { errors.push(`${s}: ${e.message || e}`); }
  }));
  return { games: out, errors };
}
// Short game shape (Search) for every season, newest first; de-duplicated.
export async function espnGames(espn, seasons) {
  seasons = [...new Set(seasons)].slice(0, 6);
  let r = await getJSON(`/api/hub/games/espn-${espn}?seasons=${seasons.join(",")}`).catch(() => ({ games: [], errors: ["server"] }));
  if (!r.games?.length && r.errors?.length) r = await gamesDirect(espn, seasons);
  const seen = new Set();
  const games = (r.games || []).filter((g) => (seen.has(g.id) ? false : seen.add(g.id))).sort((a, b) => b.date.localeCompare(a.date));
  return { games, errors: r.errors || [], failed: !games.length && (r.errors || []).length >= seasons.length };
}
// The hub's game-row shape, for the player page.
export const hubGame = (g) => ({ game_id: g.id, season: g.season, game_date: g.date, opponent: g.opp, opponent_id: g.oppId, venue: g.atVs === "@" ? "away" : "home", result: g.result, team_score: g.tm, opponent_score: g.op,
  minutes: g.min, points: g.pts, rebounds: g.reb, assists: g.ast, steals: g.stl, blocks: g.blk, turnovers: g.to, fg_made: g.fgm, fg_attempted: g.fga, three_made: g.tpm, three_attempted: g.tpa, ft_made: g.ftm, ft_attempted: g.fta });
