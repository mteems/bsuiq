// Shot chart module (from the boisestate.ai "Shot Profile" prototype), data-driven.
//   renderShotChart(container, profile)
// profile: { season, team, source, notes, games:[{date,label,conf}], shots:[[g,x,y,p,m,a]], rangeLabels? }
//   shots use ESPN court coordinates: x 0-50 across, y feet from the baseline
//   with the basket at (25, 1); p = 2|3, m = made 0|1, a = assisted 0|1, g = game index.
// Views: FREQUENCY (contour bands), SUCCESS (zone ratings blended across zone
// borders, VS D-I or HIS FG%), SHOTS (every attempt).
// Site colors: red/orange = hot / made, blue = cold / missed, UI selection neutral.
import { d3, tipOn, tipOff } from "/assets/core.js";

const PX = 12, CW = 50, CH = 35, W = CW * PX, H = CH * PX, BX = 25, BY = 5.25, R3 = 22.146, C3 = 21.65;
const CORNER_Y = BY + Math.sqrt(R3 * R3 - C3 * C3);
const P = (v) => v * PX;
const jit = (i, k) => { const s = Math.sin((i + 1) * (k ? 78.233 : 12.9898)) * 43758.5453; return s - Math.floor(s) - 0.5; };
const ARC = `M${P(BX - C3)},0 L${P(BX - C3)},${P(CORNER_Y)} A${P(R3)},${P(R3)} 0 0 0 ${P(BX + C3)},${P(CORNER_Y)} L${P(BX + C3)},0 Z`;
const insideArc = (x, y, pad = 0) => (y <= CORNER_Y ? Math.abs(x - BX) <= C3 + pad : Math.hypot(x - BX, y - BY) <= R3 + pad);

// D-I baselines (Torvik 2025-26 approximations, directional until the full shot archive).
const E_RIM = 2 * 0.593, E_MID = 2 * 0.394, E_3 = 3 * 0.347;
const expected = (x, y, p) => { if (p == 3) return E_3; const d = Math.hypot(x - BX, y - BY), t = Math.min(1, Math.max(0, (d - 3) / 5)); return E_RIM * (1 - t) + E_MID * t; };

const ZONES = {
  rim: { l: "At rim", x: 25, y: 8.4, p: 2 }, short: { l: "Short 2", x: 25, y: 13.2, p: 2 },
  midL: { l: "Mid L", x: 10.5, y: 8, p: 2 }, midT: { l: "Mid top", x: 25, y: 21.7, p: 2 }, midR: { l: "Mid R", x: 39.5, y: 8, p: 2 },
  c3L: { l: "Corner L", x: 1.7, y: 4.2, p: 3 }, w3L: { l: "Wing L", x: 6.5, y: 24.5, p: 3 }, t3: { l: "Top 3", x: 25, y: 31.3, p: 3 }, w3R: { l: "Wing R", x: 43.5, y: 24.5, p: 3 }, c3R: { l: "Corner R", x: 48.3, y: 4.2, p: 3 },
};
const zoneOf = (s) => {
  if (s.p == 2) { if (s.d <= 4) return "rim"; if (s.d <= 10) return "short"; return s.x < 19 ? "midL" : s.x > 31 ? "midR" : "midT"; }
  if (s.y <= CORNER_Y) return s.x < 25 ? "c3L" : "c3R";
  return s.x < 17 ? "w3L" : s.x > 33 ? "w3R" : "t3";
};

const SPECTRUM = ["#1e3a8a", "#2563eb", "#06b6d4", "#34d399", "#facc15", "#fb923c", "#ef4444", "#fff1f2"];
const NEUT = "#62646a", LOW = "#3a3c41";
const DIV_COLORS = ["#24479a", "#3f6fc9", "#7f9fd6", NEUT, NEUT, "#e8875f", "#d9533f", "#b52e2e"];
const VS_DOM = [-0.3, -0.18, -0.06, -0.03, 0.03, 0.06, 0.18, 0.3]; // pts/shot vs D-I
const EFG_MID = 0.5, RAW_DOM = [-0.18, -0.1, -0.03, -0.01, 0.01, 0.03, 0.1, 0.18]; // eFG minus 50%
const scaleFor = (vs) => d3.scaleLinear().domain(vs ? VS_DOM : RAW_DOM).range(DIV_COLORS).interpolate(d3.interpolateLab).clamp(true);
const TINT = { vs: 0.06, raw: 0.03 };
const HOT_TXT = "#ff8a5c", COLD_TXT = "#8db8ff";
const MADE = "#e2622a", MISS = "#4a7fe0";
const MIN_Z = 15, BLEND_PX = 16, EXT = 6;
const RES = 0.5, NX = CW / RES, NY = CH / RES;
const FREQ_BW = { 2: 1.7, 3: 2.3 };

let uid = 0;

export function renderShotChart(el, profile) {
  const id = "sc" + ++uid, I = (s) => `${id}_${s}`;
  el.classList.add("sc");
  const games = profile.games || [];
  // Wording: player pages say "his", team pages pass pron: "team".
  const PR = profile.pron === "team" ? { his: "their", he: "they", His: "Their", HIS: "TEAM", does: "do" } : { his: "his", he: "he", His: "His", HIS: "HIS", does: "does" };
  const rangeLabel = profile.rangeLabels?.conf || "CONF + POST";
  el.innerHTML = `
  <div class="story" id="${I("story")}"></div>
  <div class="sc-controls">
    <div class="seg" data-k="mode"><button class="on" data-v="freq">FREQUENCY</button><button data-v="success">SUCCESS</button><button data-v="shots">SHOTS</button></div>
    <div class="seg" data-k="succ"><button class="on" data-v="vs">VS D-I</button><button data-v="raw">${PR.HIS} FG%</button></div>
    ${games.length ? `<div class="seg" data-k="range"><button class="on" data-v="all">SEASON</button><button data-v="nonconf">NON-CONF</button><button data-v="conf">${rangeLabel}</button><button data-v="l10">LAST 10</button></div>` : ""}
    <div class="seg" data-k="type"><button class="on" data-v="all">ALL FGA</button><button data-v="2">2PT</button><button data-v="3">3PT</button></div>
    <div class="seg" data-k="lbl"><button class="on" data-v="on">LABELS</button><button data-v="off">CLEAN</button></div>
  </div>
  <div class="grid two" style="grid-template-columns:1.35fr 1fr;margin-top:12px">
    <div class="panel"><svg id="${I("court")}" style="width:100%;display:block"></svg><div class="sc-legend" id="${I("legend")}"></div><div class="cap" id="${I("cov")}"></div></div>
    <div>
      <div class="panel"><div class="sc-kpis" id="${I("kpis")}"></div>
        <div class="label" style="margin:14px 0 8px">Shot zones vs D-I average</div>
        <table><thead><tr><th class="l">Zone</th><th>FGA</th><th class="l" style="padding-left:14px"><span data-def="shrate">Share</span></th><th>FG%</th><th><span data-def="pps">Pts/shot</span></th><th><span data-def="vsdi">vs D-I</span></th></tr></thead><tbody id="${I("zones")}"></tbody></table>
        <div class="cap">Pts/shot = points per field-goal attempt (no FTs). D-I averages are approximate, from Torvik 2025-26 (rim 59.3%, other 2s 39.4%, 3s 34.7%). Faded rows are under ${MIN_Z} attempts.</div></div>
      <div class="panel" style="margin-top:16px"><div class="label" style="margin-bottom:8px">How to read it</div><div class="cap" style="margin-top:0" id="${I("howto")}"></div></div>
    </div>
  </div>
  <div class="cap" style="margin-top:12px">Source: ${profile.source || "play-by-play"}. ${profile.notes || ""} Points are jittered ±0.5 ft for display only; zones use raw coordinates.</div>`;
  const $ = (s) => el.querySelector("#" + I(s));
  const tip = tipOn, untip = tipOff;

  const shots = profile.shots.map(([g, x, y, p, m, a], i) => {
    const fy = y + 4.25;
    const s = { i, g, x, y: fy, p, m, a, jx: Math.min(CW - 0.2, Math.max(0.2, x + jit(i, 0))), jy: Math.max(0.2, fy + jit(i, 1)), d: Math.hypot(x - BX, fy - BY) };
    s.z = zoneOf(s); s.exp = expected(s.x, s.y, s.p); s.pts = s.m * s.p;
    return s;
  });
  const st = { mode: "freq", succ: "vs", range: "all", type: "all", lbl: "on" };
  const played = [...new Set(shots.map((s) => s.g))].sort((a, b) => a - b);
  const inRange = (s) => st.range == "all" || (st.range == "nonconf" && !games[s.g]?.conf) || (st.range == "conf" && games[s.g]?.conf) || (st.range == "l10" && played.slice(-10).includes(s.g));
  const filtered = () => shots.filter((s) => inRange(s) && (st.type == "all" || s.p == +st.type));

  function zoneStats(data) {
    const out = {};
    for (const k in ZONES) {
      const a = data.filter((s) => s.z == k), m = a.filter((s) => s.m);
      const pts = m.reduce((t, s) => t + s.p, 0), exp = a.reduce((t, s) => t + s.exp, 0);
      out[k] = { n: a.length, m: m.length, share: a.length / (data.length || 1), fg: a.length ? m.length / a.length : NaN, pps: a.length ? pts / a.length : NaN, diff: a.length ? (pts - exp) / a.length : NaN, efg: a.length ? pts / a.length / 2 : NaN };
    }
    return out;
  }
  function zoneRating(z, vs, scale) {
    if (z.n < MIN_Z) return { sign: 0, col: LOW, low: true };
    const v = vs ? z.diff : z.efg - EFG_MID, t = vs ? TINT.vs : TINT.raw;
    return { v, sign: v >= t - 1e-9 ? 1 : v <= -t + 1e-9 ? -1 : 0, col: scale(v) };
  }

  const keepCell = (p, x, y) => (p == 2 ? insideArc(x, y, 0.75) : !insideArc(x, y, -0.75));
  function kde(sub, bw, nTot, p) {
    const g = new Float64Array(NX * NY), r = 3 * bw, b2 = 2 * bw * bw, norm = 1 / (nTot * Math.PI * b2);
    for (const s of sub) {
      const i0 = Math.max(0, Math.floor((s.jx - r) / RES)), i1 = Math.min(NX - 1, Math.ceil((s.jx + r) / RES));
      const j0 = Math.max(0, Math.floor((s.jy - r) / RES)), j1 = Math.min(NY - 1, Math.ceil((s.jy + r) / RES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = (i + 0.5) * RES - s.jx, dy = (j + 0.5) * RES - s.jy; g[j * NX + i] += Math.exp(-(dx * dx + dy * dy) / b2) * norm; }
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (!keepCell(p, (i + 0.5) * RES, (j + 0.5) * RES)) g[j * NX + i] = 0;
    return g;
  }
  const at = (g, s) => g[Math.min(NY - 1, Math.floor(s.jy / RES)) * NX + Math.min(NX - 1, Math.floor(s.jx / RES))];
  function freqModel(data) {
    const n = data.length, grids = {}, vals = [];
    [2, 3].forEach((p) => { const sub = data.filter((s) => s.p == p); if (!sub.length) return; grids[p] = kde(sub, FREQ_BW[p], n, p); sub.forEach((s) => vals.push(at(grids[p], s))); });
    vals.sort((a, b) => a - b);
    let levels = [0.03, 0.12, 0.25, 0.4, 0.55, 0.7, 0.83, 0.93].map((q) => vals[Math.floor(q * (vals.length - 1))]).filter((v) => v > 0);
    levels = levels.filter((v, i) => i == 0 || v > levels[i - 1] * 1.02);
    const shareIn = levels.map((l) => vals.filter((v) => v >= l).length / vals.length);
    return { grids, levels, shareIn };
  }
  const proj = d3.geoTransform({ point(x, y) { this.stream.point(x * RES * PX, y * RES * PX); } });
  const gpath = d3.geoPath(proj);

  function courtLines(svg, soft) {
    const L = svg.append("g").attr("fill", "none").attr("stroke", soft ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.38)").attr("stroke-width", 1.3).style("pointer-events", "none");
    L.append("rect").attr("x", 0.7).attr("y", 0.7).attr("width", W - 1.4).attr("height", H - 1.4);
    L.append("rect").attr("x", P(19)).attr("y", 0).attr("width", P(12)).attr("height", P(19));
    L.append("circle").attr("cx", P(25)).attr("cy", P(19)).attr("r", P(6));
    L.append("path").attr("d", ARC).attr("stroke-width", soft ? 1.4 : 1.8);
    if (!soft) L.append("path").attr("d", `M${P(BX - 4)},${P(BY)} A${P(4)},${P(4)} 0 0 0 ${P(BX + 4)},${P(BY)}`);
    L.append("line").attr("x1", P(22)).attr("x2", P(28)).attr("y1", P(4)).attr("y2", P(4)).attr("stroke-width", 2.6).attr("stroke", "rgba(255,255,255,.6)");
    L.append("circle").attr("cx", P(BX)).attr("cy", P(BY)).attr("r", P(0.75)).attr("stroke", "rgba(255,255,255,.7)").attr("stroke-width", 1.6);
  }

  function labels(svg, zs, kind, rate) {
    if (st.lbl == "off") return;
    const g = svg.append("g").style("pointer-events", "none");
    for (const k in ZONES) {
      const z = zs[k]; if (!z.n) continue; const Z = ZONES[k];
      const big = kind == "freq" ? Math.round(z.share * 100) + "%" : (z.fg * 100).toFixed(0) + "%";
      const small = kind == "freq" ? `${z.n} FGA` : `${z.m}/${z.n}`;
      let col = "#fff";
      if (kind != "freq") { const r = rate[k]; col = r.low ? "#9aa0a8" : r.sign > 0 ? HOT_TXT : r.sign < 0 ? COLD_TXT : "#fff"; }
      const narrow = k == "c3L" || k == "c3R";
      const gg = g.append("g").attr("transform", `translate(${P(Z.x)},${P(Z.y)})`).attr("opacity", z.n < MIN_Z ? 0.8 : 1);
      gg.append("rect").attr("x", narrow ? -19 : -27).attr("y", -15).attr("width", narrow ? 38 : 54).attr("height", 29).attr("rx", 5).attr("fill", "rgba(10,11,13,.85)");
      gg.append("text").attr("text-anchor", "middle").attr("fill", col).attr("font-size", narrow ? 11 : 13).attr("font-weight", 600).attr("font-family", "IBM Plex Mono").text(big);
      gg.append("text").attr("text-anchor", "middle").attr("y", 10).attr("fill", "#9aa0a8").attr("font-size", 8).attr("font-family", "IBM Plex Mono").text(small);
    }
  }

  const sw = (list) => `<div class="sc-sw">${list.map(([c, t]) => `<div><i style="background:${c}"></i><span>${t}</span></div>`).join("")}</div>`;
  function zoneMasks(defs) {
    const mk = (mid, inc, exc) => { const m = defs.append("mask").attr("id", I(mid)).attr("maskUnits", "userSpaceOnUse").attr("x", -P(EXT)).attr("y", -P(EXT)).attr("width", W + 2 * P(EXT)).attr("height", H + 2 * P(EXT)); inc(m.append("g").attr("fill", "#fff")); if (exc) exc(m.append("g").attr("fill", "#000")); };
    const circ = (g, r) => g.append("circle").attr("cx", P(BX)).attr("cy", P(BY)).attr("r", P(r));
    const rect = (g, x0, x1, y0, y1) => g.append("rect").attr("x", P(x0)).attr("y", P(y0)).attr("width", P(x1 - x0)).attr("height", P(y1 - y0));
    const L = -EXT, R = CW + EXT, T = -EXT, B = CH + EXT;
    mk("z_rim", (g) => circ(g, 4));
    mk("z_short", (g) => circ(g, 10), (g) => circ(g, 4));
    mk("z_midL", (g) => rect(g, L, 19, T, B), (g) => circ(g, 10));
    mk("z_midT", (g) => rect(g, 19, 31, T, B), (g) => circ(g, 10));
    mk("z_midR", (g) => rect(g, 31, R, T, B), (g) => circ(g, 10));
    mk("z_c3L", (g) => rect(g, L, 25, T, CORNER_Y));
    mk("z_c3R", (g) => rect(g, 25, R, T, CORNER_Y));
    mk("z_w3L", (g) => rect(g, L, 17, CORNER_Y, B));
    mk("z_t3", (g) => rect(g, 17, 33, CORNER_Y, B));
    mk("z_w3R", (g) => rect(g, 33, R, CORNER_Y, B));
  }
  const gradCSS = (sc) => { const d = sc.domain(), lo = d[0], hi = d[d.length - 1]; return `linear-gradient(90deg,${d3.range(0, 1.0001, 0.05).map((t) => sc(lo + (hi - lo) * t)).join(",")})`; };

  function draw() {
    const data = filtered(), n = data.length, zs = zoneStats(data);
    const svg = d3.select($("court")).attr("viewBox", `0 0 ${W} ${H}`); svg.selectAll("*").remove();
    const defs = svg.append("defs");
    defs.append("clipPath").attr("id", I("c2")).append("path").attr("d", ARC);
    defs.append("clipPath").attr("id", I("c3")).append("path").attr("d", `M0,0H${W}V${H}H0Z ${ARC}`).attr("clip-rule", "evenodd");
    const f = defs.append("filter").attr("id", I("edge")).attr("x", "-5%").attr("y", "-5%").attr("width", "110%").attr("height", "110%");
    f.append("feDropShadow").attr("dx", -1.5).attr("dy", -1.5).attr("stdDeviation", 1.2).attr("flood-color", "#000").attr("flood-opacity", 0.7);
    const f2 = defs.append("filter").attr("id", I("soft")).attr("x", "-5%").attr("y", "-5%").attr("width", "110%").attr("height", "110%");
    f2.append("feDropShadow").attr("dx", 0).attr("dy", 1.5).attr("stdDeviation", 2).attr("flood-color", "#000").attr("flood-opacity", 0.5);
    defs.append("filter").attr("id", I("blend")).attr("filterUnits", "userSpaceOnUse").attr("x", -P(EXT)).attr("y", -P(EXT)).attr("width", W + 2 * P(EXT)).attr("height", H + 2 * P(EXT)).append("feGaussianBlur").attr("stdDeviation", BLEND_PX);
    const succ = st.mode == "success";
    svg.append("rect").attr("width", W).attr("height", H).attr("fill", succ ? "#202124" : "#141518");
    const how = $("howto"), leg = $("legend");

    if (!n) {
      courtLines(svg);
      leg.innerHTML = ""; how.innerHTML = "No attempts match these filters.";
    } else if (st.mode == "freq") {
      const M = freqModel(data);
      const colorFor = (i) => SPECTRUM[Math.round((i * (SPECTRUM.length - 1)) / Math.max(1, M.levels.length - 1))];
      [[2, "c2"], [3, "c3"]].forEach(([p, clip]) => {
        if (!M.grids[p]) return;
        svg.append("g").attr("clip-path", `url(#${I(clip)})`).attr("filter", `url(#${I("edge")})`)
          .selectAll("path").data(d3.contours().size([NX, NY]).thresholds(M.levels)(M.grids[p])).join("path")
          .attr("d", gpath).attr("fill", (d, i) => colorFor(i)).attr("fill-opacity", 0.95).attr("stroke", "rgba(8,9,11,.65)").attr("stroke-width", 1).attr("stroke-linejoin", "round")
          .on("mousemove", (e, d) => { const i = M.levels.indexOf(d.value); tip(e, `Band ${i + 1} of ${M.levels.length}<br>Densest ${Math.round(M.shareIn[i] * 100)}% of ${PR.his} attempts sit inside this line`); })
          .on("mouseleave", untip);
      });
      courtLines(svg); labels(svg, zs, "freq");
      leg.innerHTML = `<div class="sc-lrow"><span class="label">Share of attempts inside band</span>${sw(M.levels.map((l, i) => [colorFor(i), Math.round(M.shareIn[i] * 100) + "%"]))}<span class="label">→ hottest spots</span></div>`;
      how.innerHTML = `<b style="color:var(--text)">Frequency</b> answers "where ${PR.does} ${PR.he} get ${PR.his} shots?" Each color band is a contour line. The number under each color is the share of ${PR.his} attempts inside that line, so the warm core shows ${PR.his} go-to spots and the outer band shows ${PR.his} full range. Twos and threes are smoothed separately and clipped at the arc. Zone labels add up to 100%.`;
    } else if (succ) {
      const M = freqModel(data), vs = st.succ == "vs", sc = scaleFor(vs);
      const rate = {}; for (const k in ZONES) rate[k] = zoneRating(zs[k], vs, sc);
      zoneMasks(defs);
      [[2, "c2"], [3, "c3"]].forEach(([p, clip]) => {
        if (!M.grids[p]) return;
        const foot = d3.contours().size([NX, NY]).thresholds([M.levels[0]])(M.grids[p])[0];
        defs.append("clipPath").attr("id", I("fp" + p)).append("path").attr("d", gpath(foot));
        const color = svg.append("g").attr("filter", `url(#${I("soft")})`).append("g").attr("clip-path", `url(#${I(clip)})`).append("g").attr("clip-path", `url(#${I("fp" + p)})`).append("g").attr("filter", `url(#${I("blend")})`);
        Object.keys(ZONES).filter((k) => ZONES[k].p == p).forEach((k) => {
          color.append("rect").attr("x", -P(EXT)).attr("y", -P(EXT)).attr("width", W + 2 * P(EXT)).attr("height", H + 2 * P(EXT)).attr("mask", `url(#${I("z_" + k)})`).attr("fill", rate[k].col);
        });
        svg.append("g").attr("clip-path", `url(#${I(clip)})`).style("pointer-events", "none")
          .selectAll("path").data(d3.contours().size([NX, NY]).thresholds(M.levels)(M.grids[p])).join("path")
          .attr("d", gpath).attr("fill", "none").attr("stroke", "rgba(10,10,12,.5)").attr("stroke-width", (d, i) => (i == 0 ? 1.4 : 0.9)).attr("stroke-linejoin", "round");
      });
      svg.append("rect").attr("width", W).attr("height", H).attr("fill", "transparent")
        .on("mousemove", (e) => {
          const [mx, my] = d3.pointer(e), x = mx / PX, y = my / PX, p = insideArc(x, y) ? 2 : 3;
          const k = zoneOf({ p, x, y, d: Math.hypot(x - BX, y - BY) }), z = zs[k];
          if (!z.n) { tip(e, `${ZONES[k].l}<br>No attempts`); return; }
          const head = `<b>${ZONES[k].l}</b> · ${z.m}/${z.n} (${(z.fg * 100).toFixed(0)}%)`;
          const body = vs ? `${z.diff >= 0 ? "+" : ""}${z.diff.toFixed(2)} pts/shot vs D-I` : `${(z.efg * 100).toFixed(0)}% eFG${p == 3 ? " (3s count 1.5×)" : ""}`;
          tip(e, `${head}<br>${body}${rate[k].low ? `<br>Under ${MIN_Z} FGA · not rated` : ""}`);
        })
        .on("mouseleave", untip);
      courtLines(svg, true); labels(svg, zs, vs ? "vs" : "raw", rate);
      const dom = sc.domain(), lo = dom[0], hi = dom[dom.length - 1], pos = (v) => (((v - lo) / (hi - lo)) * 100).toFixed(1) + "%";
      const ticks = vs ? [[-0.3, "−.30"], [-0.15, "−.15"], [0, "avg"], [0.15, "+.15"], [0.3, "+.30"]] : [[-0.18, "32"], [-0.09, "41"], [0, "50"], [0.09, "59"], [0.18, "68"]];
      leg.innerHTML = `<div class="sc-lrow"><span class="label">Colder</span><div class="sc-grad"><i style="background:${gradCSS(sc)}"></i>${ticks.map(([v, t]) => `<span style="left:${pos(v)}">${t}</span>`).join("")}</div><span class="label">Hotter${vs ? "" : " · eFG%"}</span><span style="width:10px"></span>${sw([[LOW, "<15"]])}<span class="label">low sample</span></div>
        <div class="cap">Color = ${vs ? "points per shot vs the D-I average for that zone" : PR.his + " eFG% in that zone (a made 3 counts 1.5×; labels show plain FG%)"}, the same numbers as the labels and table. Colors blend over about a foot at zone borders but never across the arc. Lines = how often ${PR.he} shoots there: tighter rings = more shots.</div>`;
      how.innerHTML = vs
        ? `<b style="color:var(--text)">Success · vs D-I</b>: color shows how good, lines show how often. Each zone's color comes from its pts/shot vs the D-I average for that zone, on a smooth scale: deeper red = further above average, deeper blue = further below, grey = within ±0.03, dark grey = under ${MIN_Z} attempts. Colors fade into each other at zone borders so the court reads as one surface.`
        : `<b style="color:var(--text)">Success · ${PR.His} FG%</b>: only ${PR.his} own makes and misses, with no D-I comparison. Each zone sits on one fixed shot-value scale (eFG%) so threes and twos compare fairly: 48% on corner 3s = 72% eFG (deep red), 52% at the rim = 52% (near grey), 25% on long 2s = 25% (deep blue). Lines show how often ${PR.he} shoots there.`;
    } else {
      courtLines(svg);
      svg.append("g").selectAll("circle").data(data).join("circle")
        .attr("cx", (s) => P(s.jx)).attr("cy", (s) => P(s.jy)).attr("r", 4.2)
        .attr("fill", (s) => (s.m ? MADE : "none")).attr("stroke", (s) => (s.m ? (s.a ? "#ffe2d3" : MADE) : MISS)).attr("stroke-width", (s) => (s.m && s.a ? 1.8 : 1.4)).attr("opacity", 0.92)
        .on("mousemove", (e, s) => tip(e, `${games[s.g] ? games[s.g].date.slice(5) + " · " + games[s.g].label : ""}<br>${s.p}PT ${s.m ? "make" : "miss"}${s.m && s.a ? " · assisted" : ""} · ${s.d.toFixed(0)} ft`))
        .on("mouseleave", untip);
      leg.innerHTML = `<div class="sc-lrow"><span class="label"><span style="color:${MADE}">●</span> make &nbsp; <span style="color:${MISS}">○</span> miss &nbsp; <span style="color:#ffe2d3">◉</span> assisted make</span></div>`;
      how.innerHTML = `<b style="color:var(--text)">Shots</b> shows every attempt. Hover for date, opponent and distance.`;
    }
    el.querySelector('[data-k="lbl"]').style.display = st.mode == "shots" ? "none" : "flex";
    el.querySelector('[data-k="succ"]').style.display = succ ? "flex" : "none";
    const gms = new Set(data.map((s) => s.g)).size;
    $("cov").innerHTML = `Located <b style="color:var(--text)">${n}</b> attempts · ${gms} games${n < 60 ? ' · <span style="color:var(--soft)">small sample, read with caution</span>' : ""}`;
    side(data, zs); story(data, zs);
  }

  function side(data, zs) {
    const made = data.filter((s) => s.m), t3 = data.filter((s) => s.p == 3), m3 = t3.filter((s) => s.m).length;
    const efg = (made.length + 0.5 * m3) / (data.length || 1), ast = made.filter((s) => s.a).length / (made.length || 1);
    const k = [["FGA", data.length, ""], ["FG%", ((made.length / (data.length || 1)) * 100).toFixed(1), "fg"], ["3P%", t3.length ? ((m3 / t3.length) * 100).toFixed(1) : "–", "p3"], ["eFG%", (efg * 100).toFixed(1), "efg"], ["Ast'd makes", Math.round(ast * 100) + "%", "astd"]].filter((x) => !(profile.noAssist && x[2] === "astd"));
    $("kpis").innerHTML = k.map(([l, v, d]) => `<div class="k"><span class="label"${d ? ` data-def="${d}"` : ""}>${l}</span><b>${v}</b></div>`).join("");
    $("zones").innerHTML = Object.keys(ZONES).filter((k) => zs[k].n).map((k) => {
      const z = zs[k], c = z.n < MIN_Z ? "" : z.diff >= 0.06 ? HOT_TXT : z.diff <= -0.06 ? COLD_TXT : "";
      return `<tr${z.n < MIN_Z ? ' style="opacity:.5"' : ""}><td class="l">${ZONES[k].l}</td><td>${z.n}</td><td class="l" style="padding-left:14px"><span class="sc-bar" style="width:${Math.round(z.share * 140)}px"></span>${Math.round(z.share * 100)}%</td><td>${(z.fg * 100).toFixed(1)}</td><td>${z.pps.toFixed(2)}</td><td style="color:${c}">${z.diff >= 0 ? "+" : ""}${z.diff.toFixed(2)}</td></tr>`;
    }).join("");
  }

  function story(data, zs) {
    if (data.length < 30) { $("story").innerHTML = "Sample too small for a summary."; return; }
    const t = data.filter((s) => s.p == 3).length / data.length, rim = zs.rim.share, mids = zs.midL.n + zs.midR.n + zs.midT.n;
    const left = data.filter((s) => s.p == 3 && s.x < 25).length, right = data.filter((s) => s.p == 3 && s.x > 25).length;
    const best = Object.keys(ZONES).filter((k) => zs[k].n >= MIN_Z).sort((a, b) => zs[b].diff - zs[a].diff);
    const sd = right > left * 1.25 ? "favors the right side" : left > right * 1.25 ? "favors the left side" : "balanced side to side";
    let s = `<b>${Math.round(t * 100)}% of ${PR.his} shots are threes</b> (${sd} of the arc), ${Math.round(rim * 100)}% come at the rim and ${Math.round((mids / data.length) * 100)}% are long 2s. `;
    if (best.length >= 2) { const hot = best[0], cold = best[best.length - 1]; s += `Best zone: <b style="color:${HOT_TXT}">${ZONES[hot].l}</b> (${zs[hot].pps.toFixed(2)} pts/shot, ${zs[hot].diff >= 0 ? "+" : ""}${zs[hot].diff.toFixed(2)} vs D-I). Weakest: <b style="color:${COLD_TXT}">${ZONES[cold].l}</b> (${zs[cold].pps.toFixed(2)}, ${zs[cold].diff >= 0 ? "+" : ""}${zs[cold].diff.toFixed(2)}).`; }
    $("story").innerHTML = s;
  }

  el.querySelectorAll(".sc-controls .seg").forEach((seg) => seg.querySelectorAll("button").forEach((b) => (b.onclick = () => {
    seg.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); st[seg.dataset.k] = b.dataset.v; draw();
  })));
  draw();
}
