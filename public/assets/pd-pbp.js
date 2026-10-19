// ESPN play-by-play pieces of the Playmaking & Defense module (read in the browser; ESPN's
// public feed allows it, the worker gets 403 for some endpoints).
//   pdPBP({espn, team, season, d1}) → {games, assists, gl, live, onoff, created}
// espn = athlete id, team = ESPN team id, season = end year (2026), d1 = Set of D-I ESPN team ids.
const API = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";
const j = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
async function pool(items, k, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: k }, async () => { while (i < items.length) { const n = i++; out[n] = await fn(items[n], n); } })); return out; }
const RIM = /LayUp|Dunk|Tip/i, FT = /FreeThrow/i;

// One read per page: the player page starts it, the module iframe (same origin) reuses it.
export function pdPBP(args) {
  const key = `${args.espn}|${args.team}|${args.season}`;
  try { const c = window.parent?.__pbpCache?.[key]; if (c) return c; } catch {}
  window.__pbpCache ||= {};
  return (window.__pbpCache[key] ||= read(args));
}
async function read({ espn, team, season, d1 }) {
  espn = String(espn); team = String(team);
  if (!d1) d1 = new Set(await fetch("/data/pd/_d1.json").then((r) => r.json()).catch(() => []));
  if (!d1.size) d1 = null;
  const sch = await Promise.all([2, 3].map((t) => j(`${API}/teams/${team}/schedule?season=${season}&seasontype=${t}`)));
  const evs = [];
  for (const s of sch) for (const e of s?.events || []) {
    const c = e.competitions?.[0]; if (!c || !c.status?.type?.completed) continue;
    const opp = c.competitors.find((x) => String(x.id) !== team), me = c.competitors.find((x) => String(x.id) === team);
    if (!opp || !me) continue;
    const note = (c.notes || e.competitions?.[0]?.notes || [])[0]?.headline || "";
    evs.push({ conf: !!c.conferenceCompetition, id: e.id, date: e.date, oppId: String(opp.id), opp: opp.team?.shortDisplayName || opp.team?.displayName || "", abbr: opp.team?.abbreviation || "", home: me.homeAway === "home", neutral: !!c.neutralSite, note, post: +e.seasonType?.type === 3 || (e.date.slice(5, 7) === "03" && /tournament|championship/i.test(note)) });
  }
  evs.sort((a, b) => a.date.localeCompare(b.date));
  const sums = await pool(evs, 6, (e) => j(`${API}/summary?event=${e.id}`));
  const games = [], assists = [], gl = [], shots = [];
  let live = 0, tos = 0, astPts = 0, ast3 = 0, astN = 0, teamPtsOn = 0, myPts = 0, myMin = 0, sharePts = 0;
  const S = () => ({ poss: 0, pts: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, orb: 0, drb: 0, to: 0, rima: 0, rimm: 0 });
  const on = S(), off = S();
  let ooGames = 0;
  sums.forEach((s, gi) => {
    const e = evs[gi]; if (!s) return;
    const bx = s.boxscore?.players || [];
    const mine = bx.find((t) => String(t.team?.id) === team), st = mine?.statistics?.[0];
    const row = st?.athletes?.find((a) => String(a.athlete?.id) === espn);
    const k = st?.keys || [], val = (key) => { const i = k.indexOf(key); return i < 0 || !row?.stats?.length ? 0 : parseInt(row.stats[i]) || 0; };
    const played = row && row.stats?.length && !row.didNotPlay && val("minutes") > 0;
    const isDI = d1 ? d1.has(e.oppId) : true;
    const g = { ...e, idx: games.length, di: isDI, played: !!played };
    games.push(g);
    if (!played) return;
    gl.push([g.idx, val("minutes"), val("assists"), val("turnovers")]);
    const plays = s.plays || [];
    // assists, live-ball turnovers
    plays.forEach((p, i) => {
      const pa = (p.participants || []).map((x) => String(x.athlete?.id));
      if (p.shootingPlay && !FT.test(p.type?.text || "") && pa[0] === espn) {
        const c = p.coordinate || {};
        if (c.x != null && c.y != null && Math.abs(c.x) < 1000 && Math.abs(c.y) < 1000) shots.push([g.idx, c.x, c.y, /three point/i.test(p.text || "") ? 3 : 2, p.scoringPlay ? 1 : 0, p.scoringPlay && pa[1] ? 1 : 0]);
      }
      if (p.scoringPlay && p.shootingPlay && !FT.test(p.type?.text || "") && pa[1] === espn) {
        const pv = p.scoreValue || 2, rim = RIM.test(p.type?.text || "") ? 1 : 0, c = p.coordinate || {};
        if (c.x != null && c.y != null && Math.abs(c.x) < 1000) assists.push([g.idx, c.x, c.y, pv, rim]);
        if (isDI) { astN++; astPts += pv; if (pv === 3) ast3++; }
      }
      if (isDI && /Turnover/i.test(p.type?.text || "") && pa[0] === espn) {
        tos++;
        const nx = plays.slice(i + 1, i + 3).find((q) => /Steal/i.test(q.type?.text || ""));
        if (nx && nx.clock?.displayValue === p.clock?.displayValue) live++;
      }
    });
    if (!isDI) return;
    myPts += val("points"); myMin += val("minutes");
    // Older ESPN feeds (before 2024-25) carry no substitutions; on/off needs them.
    if (!plays.some((p) => p.type?.text === "Substitution")) return;
    sharePts += val("points") + plays.filter((p) => p.scoringPlay && p.shootingPlay && !FT.test(p.type?.text || "") && String(p.participants?.[1]?.athlete?.id) === espn).reduce((a, p) => a + (p.scoreValue || 2), 0);
    // on/off replay: starters, then every substitution.
    const lineup = new Set((st.athletes || []).filter((a) => a.starter).map((a) => String(a.athlete.id)));
    ooGames++;
    for (const p of plays) {
      const tt = p.type?.text || "", pt = String(p.team?.id || ""), pa = (p.participants || []).map((x) => String(x.athlete?.id));
      if (tt === "Substitution") { if (pt === team) { if (/subbing in/i.test(p.text)) lineup.add(pa[0]); else lineup.delete(pa[0]); } continue; }
      const isOn = lineup.has(espn), a = isOn ? on : off;
      if (pt === team) { // our offense
        if (isOn && p.scoringPlay) teamPtsOn += p.scoreValue || 0;
        if (/Defensive Rebound/i.test(tt)) a.drb++;
        continue;
      }
      if (!pt) continue;
      // opponent offense
      if (p.shootingPlay) {
        if (FT.test(tt)) { a.fta++; if (p.scoringPlay) a.pts += 1; }
        else { a.fga++; const three = /three point/i.test(p.text || ""); if (three) a.tpa++; if (RIM.test(tt)) a.rima++;
          if (p.scoringPlay) { a.fgm++; a.pts += p.scoreValue || 2; if (three) a.tpm++; if (RIM.test(tt)) a.rimm++; } }
      } else if (/Offensive Rebound/i.test(tt)) a.orb++;
      else if (/Turnover/i.test(tt)) a.to++;
    }
  });
  for (const a of [on, off]) a.poss = a.fga - a.orb + a.to + 0.44 * a.fta;
  const r = (x, d = 1) => (x == null || !isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
  const st = (a) => ({ poss: a.poss, opp100: a.poss ? (100 * a.pts) / a.poss : null, oefg: a.fga ? (100 * (a.fgm + 0.5 * a.tpm)) / a.fga : null, otov: a.poss ? (100 * a.to) / a.poss : null,
    oorb: a.orb + a.drb ? (100 * a.orb) / (a.orb + a.drb) : null, oftr: a.fga ? (100 * a.fta) / a.fga : null, orimr: a.fga ? (100 * a.rima) / a.fga : null, orimp: a.rima ? (100 * a.rimm) / a.rima : null,
    o2p: a.fga - a.tpa ? (100 * (a.fgm - a.tpm)) / (a.fga - a.tpa) : null, o3r: a.fga ? (100 * a.tpa) / a.fga : null, o3p: a.tpa ? (100 * a.tpm) / a.tpa : null });
  const ON = st(on), OFF = st(off);
  const rows = [["opp100", "Opp pts / 100", "low"], ["oefg", "Opp eFG%", "low"], ["otov", "Opp TO%", "high"], ["oorb", "Opp ORB%", "low"], ["oftr", "Opp FT rate", "low"], ["orimr", "Opp rim rate", "low"], ["orimp", "Opp rim FG%", "low"], ["o2p", "Opp 2P%", "low"], ["o3r", "Opp 3PA rate", "low"], ["o3p", "Opp 3P%", "low", 1]]
    .map(([k, l, b, dim]) => [k, l, r(ON[k]), r(OFF[k]), b, dim || 0]).filter((x) => x[2] != null && x[3] != null);
  return {
    games, assists, gl, shots, live, tos,
    created: { astN, astPts, ast3, ppa: astN ? astPts / astN : null, teamPtsOn: ooGames ? teamPtsOn : null, sharePts, shareGames: ooGames, myPts, myMin },
    onoff: ooGames && on.poss > 50 && off.poss > 50 ? { games: ooGames, onPoss: Math.round(on.poss), offPoss: Math.round(off.poss), rows } : null,
  };
}

// Short game label in the hand-built modules' style: "@ Oregon St", "vs CSUN", "Summit QF · ORU", "NCAA R1 · MSU".
export function gameLabel(g, confShort) {
  const o = g.abbr || g.opp;
  if (g.post && g.note) {
    const n = g.note, r = /Final(?!s)/i.test(n) && !/Semi|Quarter/i.test(n) ? "F" : /Semi/i.test(n) ? "SF" : /Quarter/i.test(n) ? "QF" : /1st Round|First Round/i.test(n) ? "R1" : /2nd Round|Second Round/i.test(n) ? "R2" : /Sweet/i.test(n) ? "S16" : /Elite/i.test(n) ? "E8" : "";
    return `${/NCAA/i.test(n) ? "NCAA" : /NIT/.test(n) ? "NIT" : confShort}${r ? " " + r : ""} · ${o}`;
  }
  return `${g.home ? "vs" : "@"} ${o}`;
}
// Shot profile in the format of data-src/shots/*.json (what renderShotChart draws).
export function shotProfile(X, { id, season, team, teamShort, confShort }) {
  const played = X.games.filter((g) => g.played).length;
  return {
    player: id, season, team, source: "ESPN play-by-play", coords: "espn",
    games: X.games.map((g) => ({ date: g.date.slice(0, 10), label: gameLabel(g, confShort), conf: !!g.conf || !!g.post, post: !!g.post })),
    shots: X.shots,
    notes: `${played} ${teamShort} games he played, read live from ESPN's public play-by-play. Coordinates charted by arena stat crews (whole feet), basket at ESPN (25,1).`,
    rangeLabels: { conf: `${String(confShort || "CONF").toUpperCase()} + POST` },
  };
}
