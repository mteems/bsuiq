// Team scouting data sections: snapshot, wins vs losses, pace, shooting, lineups.
// Everything redraws for the window picked in the toggle bar
// (full season, conference, last 10, last 5, last game).
//   renderTeamData(el, D, DIST)  D = /data/teams/<slug>.json, DIST = /data/teams/_dist.json
import { d3, tipOn, tipOff, LG } from "/assets/core.js";
import { renderShotChart } from "/assets/shotchart.js";

const GOOD = "#e2622a", BAD = "#4a7fe0", GOOD_T = "#f08a5d", BAD_T = "#7fa6f0", NEU = "#5d6168";
const WINDOWS = [["all", "FULL SEASON"], ["conf", "CONFERENCE"], ["l10", "LAST 10"], ["l5", "LAST 5"], ["l1", "LAST GAME"]];
const f1 = (v) => (v == null || !isFinite(v) ? "—" : v.toFixed(1));
const ord = (n) => { const v = n % 100; return n + (v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"); };
const sum = (a, k) => a.reduce((s, g) => s + (g[k] || 0), 0);
const last = (s) => String(s).split(" ").slice(-1)[0].replace(/^(Jr\.?|II|III|IV)$/, "") || s;

// Per-game and aggregate stat definitions. dir: 1 = higher is better for this team, -1 = lower.
const STATS = {
  efg: { l: "eFG%", side: "off", dir: 1, g: (g) => (100 * (g.fgm + 0.5 * g.tpm)) / g.fga, def: "Effective FG%: field-goal % with made threes worth 1.5." },
  tov: { l: "Turnover %", side: "off", dir: -1, g: (g) => (100 * g.to) / g.poss, def: "Turnovers per 100 possessions." },
  orb: { l: "Off. reb %", side: "off", dir: 1, g: (g) => (100 * g.orb) / (g.orb + g.d_drb), def: "Share of their own misses they rebounded." },
  ftr: { l: "FT rate", side: "off", dir: 1, g: (g) => (100 * g.fta) / g.fga, def: "Free-throw attempts per 100 field-goal attempts." },
  tpr: { l: "3PA rate", side: "off", dir: 0, g: (g) => (100 * g.tpa) / g.fga, def: "Share of field-goal attempts that were threes (style, not good or bad)." },
  tp: { l: "3P%", side: "off", dir: 1, g: (g) => (g.tpa ? (100 * g.tpm) / g.tpa : null), def: "Three-point %." },
  rim: { l: "Rim FG%", side: "off", dir: 1, g: (g) => (g.rima ? (100 * g.rimm) / g.rima : null), def: "Field-goal % at the rim." },
  d_efg: { l: "Opp. eFG%", side: "def", dir: -1, g: (g) => (100 * (g.d_fgm + 0.5 * g.d_tpm)) / g.d_fga, def: "Opponents' effective FG%." },
  d_tov: { l: "Forced TO %", side: "def", dir: 1, g: (g) => (100 * g.d_to) / g.dposs, def: "Opponent turnovers per 100 opponent possessions." },
  d_orb: { l: "Opp. off. reb %", side: "def", dir: -1, g: (g) => (100 * g.d_orb) / (g.d_orb + g.drb), def: "Share of opponents' misses the opponent got back." },
  d_ftr: { l: "Opp. FT rate", side: "def", dir: -1, g: (g) => (100 * g.d_fta) / g.d_fga, def: "Opponent free-throw attempts per 100 field-goal attempts." },
  d_tp: { l: "Opp. 3P%", side: "def", dir: -1, g: (g) => (g.d_tpa ? (100 * g.d_tpm) / g.d_tpa : null), def: "Opponents' three-point %." },
  pace: { l: "Pace", side: "pace", dir: 0, g: (g) => (40 * (g.poss + g.dposs)) / 2 / g.mins, def: "Possessions per 40 minutes." },
};
function agg(games) {
  const s = (k) => sum(games, k), poss = s("poss"), dposs = s("dposs");
  const A = {
    ortg: (100 * s("pts")) / poss, drtg: (100 * s("op")) / dposs, pace: (40 * (poss + dposs)) / 2 / s("mins"),
    efg: (100 * (s("fgm") + 0.5 * s("tpm"))) / s("fga"), tov: (100 * s("to")) / poss, orb: (100 * s("orb")) / (s("orb") + s("d_drb")),
    ftr: (100 * s("fta")) / s("fga"), tpr: (100 * s("tpa")) / s("fga"), tp: (100 * s("tpm")) / s("tpa"), rim: (100 * s("rimm")) / s("rima"),
    d_efg: (100 * (s("d_fgm") + 0.5 * s("d_tpm"))) / s("d_fga"), d_tov: (100 * s("d_to")) / dposs, d_orb: (100 * s("d_orb")) / (s("d_orb") + s("drb")),
    d_ftr: (100 * s("d_fta")) / s("d_fga"), d_tp: (100 * s("d_tpm")) / s("d_tpa"),
    tpp: games.reduce((a, g) => a + g.tpp * g.poss, 0) / poss, dtpp: games.reduce((a, g) => a + g.dtpp * g.dposs, 0) / dposs,
  };
  A.net = A.ortg - A.drtg;
  return A;
}

export function renderTeamData(el, D, DIST) {
  const dist = DIST?.dist || {}, NT = DIST?.teams || 0;
  // D-I rank among teams for a full-season-style value (1 = best).
  const rank = (k, v, dir) => { const a = dist[k]; if (!a || v == null || !isFinite(v)) return null; const better = dir > 0 ? a.filter((x) => x > v).length : a.filter((x) => x < v).length; return better + 1; };
  const pctl = (k, v, dir) => { const r = rank(k, v, dir), a = dist[k]; return r == null ? null : 100 * (1 - (r - 1) / (a.length - 1 || 1)); };
  const tone = (p) => (p == null ? "var(--text)" : p >= 70 ? GOOD_T : p <= 30 ? BAD_T : "var(--text)");
  const games = D.games.map((g, i) => ({ ...g, i, w: g.pts > g.op, m: g.pts - g.op }));
  const st = { win: "all", shotSide: "off" };
  const uid = "td" + Math.random().toString(36).slice(2, 7), I = (s) => `${uid}_${s}`;

  el.innerHTML = `<div class="tdbar"><div class="seg" id="${I("win")}">${WINDOWS.map(([k, l]) => `<button data-w="${k}" class="${k === "all" ? "on" : ""}">${l}</button>`).join("")}</div><span class="label" id="${I("wl")}"></span></div>
  <section><div class="shead"><h2>Snapshot</h2><span class="label" id="${I("snaplbl")}"></span></div>
    <div class="tdkpis" id="${I("kpis")}"></div>
    <div class="panel" style="margin-top:12px"><div class="label ptitle"><span>Every game · margin</span><span>orange = win · blue = loss · faded = outside the window</span></div><div id="${I("strip")}"></div></div></section>
  <section><div class="shead"><h2>What wins and loses their games</h2><span class="label">averages in wins vs losses · biggest swings first</span></div>
    <div class="story" id="${I("wlstory")}"></div><div id="${I("wlbody")}"></div></section>
  <section><div class="shead"><h2>Pace</h2><span class="label">possessions per 40 · seconds per possession</span></div>
    <div class="story" id="${I("pacestory")}"></div>
    <div class="grid" style="grid-template-columns:1.6fr 1fr;margin-top:12px"><div class="panel"><div class="label ptitle"><span>Pace by game</span><span>dashed = D-I average</span></div><div id="${I("pacechart")}"></div></div>
    <div class="panel"><div class="label ptitle"><span>Seconds per possession</span><span>vs every D-I team</span></div><div id="${I("tpp")}"></div></div></div></section>
  <section><div class="shead"><h2>Shooting</h2><span class="label">where they shoot · what they allow</span><div style="margin-left:auto" class="seg" id="${I("shotside")}"><button data-s="off" class="on">THEIR SHOTS</button><button data-s="def">WHAT THEY ALLOW</button></div></div>
    <div id="${I("shots")}" style="margin-top:12px"></div></section>
  <section><div class="shead"><h2>Lineups</h2><span class="label">5-man units · player on/off · per 100 possessions</span></div>
    <div class="story" id="${I("lustory")}"></div>
    <div class="grid" style="grid-template-columns:1.35fr 1fr;margin-top:12px"><div class="panel"><div class="label ptitle"><span>Most-used lineups</span><span>net rating · bar width = possessions</span></div><div id="${I("lineups")}"></div></div>
    <div class="panel"><div class="label ptitle"><span>On / off</span><span>team net rating with him on vs off</span></div><div id="${I("onoff")}"></div></div></div></section>`;
  const $ = (s) => el.querySelector("#" + I(s));

  const inWin = () => {
    const all = games;
    if (st.win === "conf") return all.filter((g) => g.conf);
    if (st.win === "l10") return all.slice(-10);
    if (st.win === "l5") return all.slice(-5);
    if (st.win === "l1") return all.slice(-1);
    return all;
  };

  function draw() {
    const W = inWin(), set = new Set(W.map((g) => g.i));
    const wins = W.filter((g) => g.w).length;
    $("wl").textContent = W.length ? `${W.length} game${W.length > 1 ? "s" : ""} · ${wins}-${W.length - wins} · ${D.season}` : "no games in this window";
    if (!W.length) { ["kpis", "strip", "wlbody", "pacechart", "tpp", "shots", "lineups", "onoff"].forEach((k) => ($(k).innerHTML = `<div class="cap">No ${st.win === "conf" ? "conference " : ""}games yet.</div>`)); return; }
    const A = agg(W), F = agg(games);
    snapshot(W, A, set);
    winsLosses(W, F);
    pace(W, A, set);
    shots(set);
    lineups(set);
  }

  // ------------------------------------------------------------ snapshot
  function snapshot(W, A, set) {
    const wins = W.filter((g) => g.w).length, cw = games.filter((g) => g.conf && g.w).length, cg = games.filter((g) => g.conf).length;
    const tile = (label, def, val, k, dir, sub) => { const r = rank(k, val, dir || 1), p = dir ? pctl(k, val, dir) : null;
      return `<div class="kpi"><span class="label" data-def="${def}">${label}</span><b style="color:${tone(p)}">${f1(val)}</b><div class="sub">${r ? `${ord(r)} of ${NT} in D-I` : ""}${sub ? ` · ${sub}` : ""}</div></div>`; };
    $("kpis").innerHTML = `<div class="kpi"><span class="label">Record</span><b>${wins}-${W.length - wins}</b><div class="sub">${st.win === "all" ? `${cw}-${cg - cw} in conference` : `season ${games.filter((g) => g.w).length}-${games.filter((g) => !g.w).length}`} · avg margin ${A.net >= 0 ? "+" : ""}${f1(sum(W, "m") / W.length)}</div></div>`
      + tile("Offense", "ortg", A.ortg, "ortg", 1, "pts / 100 poss") + tile("Defense", "drtg", A.drtg, "drtg", -1, "allowed / 100") + tile("Net rating", "netrtg", A.net, "net", 1, "") + tile("Pace", "pace", A.pace, "pace", 0, "poss / 40");
    // margin strip
    const box = $("strip"), w = box.clientWidth || 900, h = 150, m = { t: 14, b: 22, l: 30, r: 8 };
    const x = d3.scaleBand(games.map((g) => g.i), [m.l, w - m.r]).padding(0.18), mx = d3.max(games, (g) => Math.abs(g.m)) || 10;
    const y = d3.scaleLinear([-mx, mx], [h - m.b, m.t]);
    const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", "100%");
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#3a3d42");
    [-20, -10, 10, 20].filter((v) => Math.abs(v) <= mx).forEach((v) => svg.append("text").attr("x", m.l - 6).attr("y", y(v) + 3).attr("text-anchor", "end").attr("class", "tdax").text((v > 0 ? "+" : "") + v));
    svg.selectAll("rect").data(games).join("rect").attr("x", (g) => x(g.i)).attr("width", x.bandwidth()).attr("y", (g) => Math.min(y(0), y(g.m))).attr("height", (g) => Math.max(1.5, Math.abs(y(g.m) - y(0))))
      .attr("rx", 2).attr("fill", (g) => (g.w ? GOOD : BAD)).attr("opacity", (g) => (set.has(g.i) ? 1 : 0.18))
      .on("mousemove", (e, g) => tipOn(e, `<b>${g.w ? "W" : "L"} ${g.pts}-${g.op}</b> ${g.loc === "A" ? "@" : g.loc === "N" ? "vs" : "vs"} ${g.opp}${g.loc === "N" ? " (neutral)" : ""}<br>${g.d}${g.conf ? " · conference" : ""}`)).on("mouseleave", tipOff);
    // month ticks
    let prev = "";
    games.forEach((g) => { const mo = new Date(g.d + "T12:00").toLocaleString("en-US", { month: "short" }); if (mo !== prev) { svg.append("text").attr("x", x(g.i)).attr("y", h - 6).attr("class", "tdax").text(mo); prev = mo; } });
    box.replaceChildren(svg.node());
    $("snaplbl").textContent = `${D.team} · ${D.season} · D-I games only`;
  }

  // ------------------------------------------------------------ wins vs losses
  function winsLosses(W, F) {
    const body = $("wlbody"), story = $("wlstory");
    const Wg = W.filter((g) => g.w), Lg = W.filter((g) => !g.w);
    const keys = Object.keys(STATS).filter((k) => k !== "pace" || true);
    if (Wg.length < 3 || Lg.length < 3) {
      // small window: game-by-game factor table vs season average
      story.innerHTML = W.length <= 5 ? `Too few wins and losses in this window to compare, so here is each game against their full-season average (orange = better than usual, blue = worse).` : `Only ${Wg.length} win${Wg.length === 1 ? "" : "s"} and ${Lg.length} loss${Lg.length === 1 ? "" : "es"} here, too few to compare. Each game against their season average:`;
      const cols = ["efg", "tov", "orb", "ftr", "tp", "d_efg", "d_tov", "d_orb", "d_tp", "pace"];
      body.innerHTML = `<div class="panel scroll" style="margin-top:12px"><table><thead><tr><th class="l">Game</th><th>Result</th>${cols.map((k, i) => `<th class="${i === 5 || i === 9 ? "sep" : ""}" title="${STATS[k].def}">${STATS[k].l}</th>`).join("")}</tr></thead><tbody>${W.slice().reverse().map((g) => `<tr><td class="l">${g.d.slice(5)} ${g.loc === "A" ? "@" : "vs"} ${g.opp}</td><td style="color:${g.w ? GOOD_T : BAD_T};font-weight:600">${g.w ? "W" : "L"} ${g.pts}-${g.op}</td>${cols.map((k, i) => { const v = STATS[k].g(g), s = F[k], dir = STATS[k].dir, d = v == null ? 0 : (v - s) * dir; const c = !dir || Math.abs(v - s) < Math.max(1.5, Math.abs(s) * 0.04) ? "var(--text)" : d > 0 ? GOOD_T : BAD_T; return `<td class="${i === 5 || i === 9 ? "sep" : ""}" style="color:${c}">${f1(v)}</td>`; }).join("")}</tr>`).join("")}
        <tr class="m"><td class="l m">Season average</td><td></td>${cols.map((k, i) => `<td class="m ${i === 5 || i === 9 ? "sep" : ""}">${f1(F[k])}</td>`).join("")}</tr></tbody></table></div>`;
      return;
    }
    // standardized gap between wins and losses for every stat
    const rows = keys.map((k) => {
      const S = STATS[k], vals = W.map((g) => S.g(g)).filter((v) => v != null && isFinite(v));
      const mean = d3.mean(vals), sd = d3.deviation(vals) || 1;
      const wa = agg(Wg)[k] ?? d3.mean(Wg.map(S.g)), la = agg(Lg)[k] ?? d3.mean(Lg.map(S.g));
      return { k, S, wa, la, mean, sd, gap: Math.abs(wa - la) / sd };
    }).filter((r) => isFinite(r.wa) && isFinite(r.la)).sort((a, b) => b.gap - a.gap);
    // best single threshold for each of the top stats
    const split = (k) => {
      const S = STATS[k], pts = W.map((g) => ({ v: S.g(g), w: g.w })).filter((p) => p.v != null && isFinite(p.v)).sort((a, b) => a.v - b.v);
      let best = null;
      for (let i = 3; i <= pts.length - 3; i++) {
        const lo = pts.slice(0, i), hi = pts.slice(i), cut = (pts[i - 1].v + pts[i].v) / 2;
        const good = S.dir < 0 ? lo : hi, bad = S.dir < 0 ? hi : lo;
        const gw = good.filter((p) => p.w).length, bw = bad.filter((p) => p.w).length;
        const score = gw / good.length - bw / bad.length;
        if (!best || score > best.score) best = { score, cut, good: [gw, good.length - gw], bad: [bw, bad.length - bw], low: S.dir < 0 };
      }
      return best;
    };
    const top = rows.filter((r) => r.S.dir !== 0).slice(0, 3).map((r) => ({ ...r, sp: split(r.k) })).filter((r) => r.sp);
    const phrase = (r) => { const sp = r.sp, opp = r.S.side === "def"; const verb = opp ? (sp.low ? "hold opponents under" : "push opponents over") : (sp.low ? "keep it under" : "get to");
      return `<b>${sp.good[0]}-${sp.good[1]}</b> when they ${verb} <b>${f1(sp.cut)}</b> ${r.S.l.replace("Opp. ", "")}${r.k === "d_tov" ? "" : ""} · ${sp.bad[0]}-${sp.bad[1]} otherwise`; };
    story.innerHTML = top.length ? `<b>${top[0].S.l} decides their games.</b> In wins it averages ${f1(top[0].wa)}; in losses ${f1(top[0].la)}.${top[1] ? ` Next: ${top[1].S.l} (${f1(top[1].wa)} vs ${f1(top[1].la)})${top[2] ? ` and ${top[2].S.l} (${f1(top[2].wa)} vs ${f1(top[2].la)})` : ""}.` : ""}` : "";
    const cards = top.map((r) => `<div class="tdcall"><span class="label">${r.S.side === "def" ? "Defense" : "Offense"} · ${r.S.l}</span><div class="tdcallv">${phrase(r)}</div><div class="tdmini" data-k="${r.k}" data-cut="${r.sp.cut}"></div></div>`).join("");
    const dumb = rows.map((r) => {
      const lo = Math.min(r.wa, r.la, r.mean) - r.sd * 0.6, hi = Math.max(r.wa, r.la, r.mean) + r.sd * 0.6, X = (v) => ((v - lo) / (hi - lo)) * 100;
      const better = r.S.dir === 0 ? null : (r.wa - r.la) * r.S.dir > 0;
      return `<div class="tdrow"><span title="${r.S.def}" data-def-inline>${r.S.l}</span><div class="tdtrack"><i class="tdline" style="left:${Math.min(X(r.wa), X(r.la))}%;width:${Math.abs(X(r.wa) - X(r.la))}%"></i>
        <i class="tddot" style="left:${X(r.la)}%;background:${BAD}" title="Losses ${f1(r.la)}"></i><i class="tddot" style="left:${X(r.wa)}%;background:${GOOD}" title="Wins ${f1(r.wa)}"></i></div>
        <span class="m" style="color:${GOOD_T}">${f1(r.wa)}</span><span class="m" style="color:${BAD_T}">${f1(r.la)}</span><span class="tdgap" style="opacity:${Math.min(1, 0.35 + r.gap / 1.6)}">${r.gap >= 1 ? "big" : r.gap >= 0.55 ? "some" : "little"}${better === false ? " *" : ""}</span></div>`;
    }).join("");
    body.innerHTML = `<div class="tdcalls">${cards}</div>
      <div class="panel" style="margin-top:12px"><div class="tdrow tdhead"><span class="label">Stat</span><span class="label">● wins · ● losses</span><span class="label" style="color:${GOOD_T}">Wins</span><span class="label" style="color:${BAD_T}">Losses</span><span class="label">Swing</span></div>${dumb}
      <div class="cap">${Wg.length} wins, ${Lg.length} losses in this window. Swing = gap between wins and losses in standard deviations of their game-to-game numbers (big = 1+ SD). * = they did better on this stat in losses.</div></div>`;
    // mini scatter: stat vs margin for each callout
    body.querySelectorAll(".tdmini").forEach((div) => {
      const k = div.dataset.k, cut = +div.dataset.cut, S = STATS[k], w = div.clientWidth || 300, h = 120, m = { t: 8, b: 18, l: 26, r: 8 };
      const pts = W.map((g) => ({ g, v: S.g(g) })).filter((p) => p.v != null && isFinite(p.v));
      const x = d3.scaleLinear(d3.extent(pts, (p) => p.v), [m.l, w - m.r]).nice(), mx = d3.max(pts, (p) => Math.abs(p.g.m)) || 10, y = d3.scaleLinear([-mx, mx], [h - m.b, m.t]);
      const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", "100%");
      svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#3a3d42");
      svg.append("line").attr("x1", x(cut)).attr("x2", x(cut)).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "#8a8e95").attr("stroke-dasharray", "3 3");
      svg.append("g").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(4).tickSize(0)).call((g) => { g.select(".domain").remove(); g.selectAll("text").attr("class", "tdax").attr("dy", 10); });
      svg.append("text").attr("x", 2).attr("y", y(mx * 0.75)).attr("class", "tdax").text("W");
      svg.append("text").attr("x", 2).attr("y", y(-mx * 0.75)).attr("class", "tdax").text("L");
      svg.selectAll("circle").data(pts).join("circle").attr("cx", (p) => x(p.v)).attr("cy", (p) => y(p.g.m)).attr("r", 4).attr("fill", (p) => (p.g.w ? GOOD : BAD)).attr("stroke", "#1e1f22")
        .on("mousemove", (e, p) => tipOn(e, `${p.g.w ? "W" : "L"} ${p.g.pts}-${p.g.op} ${p.g.loc === "A" ? "@" : "vs"} ${p.g.opp}<br>${S.l}: ${f1(p.v)}`)).on("mouseleave", tipOff);
      div.replaceChildren(svg.node());
    });
  }

  // ------------------------------------------------------------ pace
  function pace(W, A, set) {
    const pr = rank("pace", A.pace, 1), tr = rank("tpp", A.tpp, -1), dr = rank("dtpp", A.dtpp, 1);
    const avg = d3.mean(dist.pace || [68]);
    const speed = pr == null ? "" : pr <= NT * 0.25 ? "play fast" : pr >= NT * 0.75 ? "play slow" : "play at an average pace";
    $("pacestory").innerHTML = `<b>They ${speed}</b>: ${f1(A.pace)} possessions per 40 (${ord(pr)} fastest of ${NT}). On offense they take <b>${f1(A.tpp)} seconds</b> per possession (${ord(tr)} quickest); opponents take <b>${f1(A.dtpp)}</b> against them (${ord(dr)} longest), ${A.dtpp > d3.mean(dist.dtpp || [17]) + 0.4 ? "so their defense makes teams work deep into the clock" : A.dtpp < d3.mean(dist.dtpp || [17]) - 0.4 ? "so opponents get shots up quickly against them" : "about average"}.`;
    // pace by game
    const box = $("pacechart"), w = box.clientWidth || 700, h = 200, m = { t: 12, b: 22, l: 30, r: 10 };
    const vals = games.map((g) => ({ g, v: STATS.pace.g(g) }));
    const x = d3.scalePoint(games.map((g) => g.i), [m.l, w - m.r]).padding(0.5), y = d3.scaleLinear(d3.extent([...vals.map((p) => p.v), avg]), [h - m.b, m.t]).nice();
    const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", "100%");
    y.ticks(4).forEach((t) => { svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", "#2a2c30"); svg.append("text").attr("x", m.l - 6).attr("y", y(t) + 3).attr("text-anchor", "end").attr("class", "tdax").text(t); });
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(avg)).attr("y2", y(avg)).attr("stroke", "#8a8e95").attr("stroke-dasharray", "4 4");
    svg.append("path").attr("d", d3.line().x((p) => x(p.g.i)).y((p) => y(p.v)).curve(d3.curveMonotoneX)(vals)).attr("fill", "none").attr("stroke", "#5d6168").attr("stroke-width", 1.5);
    svg.selectAll("circle").data(vals).join("circle").attr("cx", (p) => x(p.g.i)).attr("cy", (p) => y(p.v)).attr("r", 4).attr("fill", (p) => (p.g.w ? GOOD : BAD)).attr("opacity", (p) => (set.has(p.g.i) ? 1 : 0.2))
      .on("mousemove", (e, p) => tipOn(e, `${p.g.w ? "W" : "L"} ${p.g.pts}-${p.g.op} ${p.g.loc === "A" ? "@" : "vs"} ${p.g.opp}<br>${f1(p.v)} possessions per 40`)).on("mouseleave", tipOff);
    box.replaceChildren(svg.node());
    // seconds per possession vs D-I
    const bar = (label, v, k, dir, note) => { const a = dist[k] || [], lo = a[0], hi = a[a.length - 1], X = (z) => ((z - lo) / (hi - lo)) * 100, r = rank(k, v, dir);
      const dots = a.map((z) => `<i style="left:${X(z)}%"></i>`).join("");
      return `<div class="tdtpp"><div class="tdtpph"><span>${label}</span><b>${f1(v)} s</b></div><div class="tdbee">${dots}<em style="left:${X(v)}%"></em></div><div class="tdtppx"><span>${f1(lo)} s</span><span class="m">${r ? ord(r) + " " + note : ""}</span><span>${f1(hi)} s</span></div></div>`; };
    $("tpp").innerHTML = bar("Their offense", A.tpp, "tpp", -1, "quickest") + bar("Opponents vs their defense", A.dtpp, "dtpp", 1, "longest") + `<div class="cap">Each grey tick is one D-I team; the white mark is them in this window.</div>`;
  }

  // ------------------------------------------------------------ shooting
  function shots(set) {
    const raw = (st.shotSide === "off" ? D.shots.off : D.shots.def).filter((s) => set.has(s[0]));
    const box = $("shots");
    if (raw.length < 30) { box.innerHTML = `<div class="cap">Not enough charted shots in this window (${raw.length}).</div>`; return; }
    renderShotChart(box, { shots: raw, games: [], pron: "team", noAssist: true, source: "play-by-play shot locations", notes: st.shotSide === "def" ? "Shots their opponents took against them. Colors still read from the shooter's side: warm = opponents shot well there." : "" });
  }

  // ------------------------------------------------------------ lineups
  function lineups(set) {
    const Lx = D.lineups, rows = Lx.rows.filter((r) => set.has(r[0]));
    const byL = new Map();
    for (const r of rows) { const a = byL.get(r[1]) || [0, 0, 0, 0, 0]; a[0] += r[2]; a[1] += r[3]; a[2] += r[4]; a[3] += r[5]; a[4] += r[6]; byL.set(r[1], a); }
    const tot = [...byL.values()].reduce((s, a) => s.map((v, i) => v + a[i]), [0, 0, 0, 0, 0]);
    const L = [...byL].map(([li, a]) => ({ li, poss: a[0], ortg: a[0] ? (100 * a[1]) / a[0] : 0, drtg: a[2] ? (100 * a[3]) / a[2] : 0, mins: a[4] })).map((l) => ({ ...l, net: l.ortg - l.drtg }));
    const minPoss = Math.max(10, Math.round(tot[0] * 0.02));
    const top = L.filter((l) => l.poss >= Math.min(minPoss, 10)).sort((a, b) => b.poss - a.poss).slice(0, 8);
    const nameOf = (li) => Lx.defs[li].map((p) => last(Lx.names[p])).join(" · ");
    const maxP = d3.max(top, (l) => l.poss) || 1, maxN = Math.max(15, d3.max(top, (l) => Math.abs(l.net)) || 15);
    const teamNet = tot[0] ? (100 * tot[1]) / tot[0] - (100 * tot[3]) / tot[2] : 0;
    $("lineups").innerHTML = top.length ? top.map((l) => {
      const wPct = (Math.abs(l.net) / maxN) * 50, col = l.net >= 0 ? GOOD : BAD;
      return `<div class="tdlu"><div class="tdlun">${nameOf(l.li)}</div><div class="tdlub"><s></s><i style="${l.net >= 0 ? `left:50%;width:${wPct}%` : `left:${50 - wPct}%;width:${wPct}%`};background:${col};opacity:${(0.35 + 0.65 * (l.poss / maxP)).toFixed(2)}"></i></div>
        <span class="m" style="color:${l.net >= 0 ? GOOD_T : BAD_T}">${l.net >= 0 ? "+" : ""}${f1(l.net)}</span><span class="m">${Math.round(l.poss)} poss</span><span class="m">${f1(l.ortg)} / ${f1(l.drtg)}</span></div>`;
    }).join("") + `<div class="cap">Net = points scored minus allowed per 100 possessions (ORtg / DRtg shown right). Small samples swing a lot: treat lineups under ~50 possessions as a hint, not a verdict. Team overall: ${teamNet >= 0 ? "+" : ""}${f1(teamNet)}.</div>` : `<div class="cap">No lineup data for this window.</div>`;
    const best = L.filter((l) => l.poss >= 40).sort((a, b) => b.net - a.net);
    // on/off per player
    const P = Lx.names.map((nm, pi) => {
      let on = [0, 0, 0, 0];
      for (const [li, a] of byL) if (Lx.defs[li].includes(pi)) on = on.map((v, i) => v + a[i]);
      const off = tot.slice(0, 4).map((v, i) => v - on[i]);
      const onNet = on[0] && on[2] ? (100 * on[1]) / on[0] - (100 * on[3]) / on[2] : null, offNet = off[0] > 20 && off[2] > 20 ? (100 * off[1]) / off[0] - (100 * off[3]) / off[2] : null;
      return { nm, poss: on[0], share: on[0] / (tot[0] || 1), onNet, offNet, diff: onNet != null && offNet != null ? onNet - offNet : null };
    }).filter((p) => p.poss >= Math.max(15, tot[0] * 0.08)).sort((a, b) => b.poss - a.poss).slice(0, 10);
    const maxD = Math.max(10, d3.max(P, (p) => Math.abs(p.diff || 0)) || 10);
    $("onoff").innerHTML = P.map((p) => { const w = p.diff == null ? 0 : (Math.abs(p.diff) / maxD) * 50, col = (p.diff || 0) >= 0 ? GOOD : BAD;
      return `<div class="tdoo"><span class="tdoon">${p.nm}</span><span class="m">${Math.round(p.share * 100)}%</span><div class="tdlub"><s></s><i style="${(p.diff || 0) >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`};background:${col}"></i></div><span class="m" style="color:${p.diff == null ? "var(--muted)" : p.diff >= 0 ? GOOD_T : BAD_T}">${p.diff == null ? "—" : (p.diff >= 0 ? "+" : "") + f1(p.diff)}</span></div>`; }).join("")
      + `<div class="cap">% = share of team possessions he played. Bar = team net rating with him on minus with him off. "—" = he almost never sat.</div>`;
    const starters = top[0];
    const swing = P.filter((p) => p.diff != null).sort((a, b) => b.diff - a.diff);
    $("lustory").innerHTML = starters ? `<b>Their most-used group (${nameOf(starters.li)}) is ${starters.net >= 0 ? "+" : ""}${f1(starters.net)} per 100</b> over ${Math.round(starters.poss)} possessions${best[0] && best[0].li !== starters.li ? `; their best unit with 40+ possessions is ${nameOf(best[0].li)} at ${best[0].net >= 0 ? "+" : ""}${f1(best[0].net)}` : ""}.${swing.length ? ` Biggest on/off swing: <b>${swing[0].nm}</b> (${swing[0].diff >= 0 ? "+" : ""}${f1(swing[0].diff)})${swing.length > 1 ? `; weakest: ${swing[swing.length - 1].nm} (${f1(swing[swing.length - 1].diff)})` : ""}.` : ""}` : "";
  }

  $("win").querySelectorAll("button").forEach((b) => (b.onclick = () => { $("win").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); st.win = b.dataset.w; draw(); }));
  $("shotside").querySelectorAll("button").forEach((b) => (b.onclick = () => { $("shotside").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); st.shotSide = b.dataset.s; draw(); }));
  draw();
}
