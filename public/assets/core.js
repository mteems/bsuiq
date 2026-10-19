// Bronco IQ shared front-end helpers: color scale, chips, tooltips (data-def),
// top bar, search, and fetch with sign-in redirect.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
export { d3 };

// SITE CONVENTION: orange = good / high percentile, blue = bad / low percentile.
export const GOOD = "#e2622a", BAD = "#4a7fe0", NEU = "#5d6168";
export const pc = (p) =>
  p == null ? NEU
  : p >= 50 ? d3.interpolateLab(NEU, "#d4561f")(Math.min(1, (p - 50) / 45))
  : d3.interpolateLab(NEU, "#2f63d6")(Math.min(1, (50 - p) / 45));
export const chip = (p, text) =>
  p == null ? `<span class="chip na">${text ?? "—"}</span>`
  : `<span class="chip" style="background:${pc(p)}" title="${p}th percentile">${text ?? p}</span>`;
// Text color for a value given its percentile: neutral near the middle.
export const tc = (p) => (p == null || Math.abs(p - 50) < 8 ? "var(--text)" : pc(p));

export const f1 = (v) => (v == null ? "—" : (+v).toFixed(1));
export const f0 = (v) => (v == null ? "—" : Math.round(+v).toString());
export const sg = (v) => (v == null ? "—" : (v > 0 ? "+" : "") + (+v).toFixed(1));
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- stat definitions: every stat label on the site gets one ----------
export const DEF = {
  gp: ["Games played", "Games with at least one minute."],
  gs: ["Games started", ""],
  mpg: ["Minutes per game", "Average minutes played."],
  ppg: ["Points per game", ""],
  pts40: ["Points per 40", "Points scaled to 40 minutes. Separates scoring rate from playing time."],
  rpg: ["Rebounds per game", ""],
  apg: ["Assists per game", "Raw assists per game. Depends on minutes and pace."],
  spg: ["Steals per game", ""],
  bpg: ["Blocks per game", ""],
  topg: ["Turnovers per game", "Lower is better."],
  ts: ["True shooting %", "Points ÷ (2 × (FGA + 0.44 × FTA)). Scoring efficiency that counts threes and free throws."],
  efg: ["Effective FG %", "Field-goal % with threes worth 1.5×."],
  fg: ["Field goal %", ""],
  p3: ["3-point %", "Shown with a percentile only at 40+ attempts."],
  ft: ["Free throw %", "Shown with a percentile only at 30+ attempts."],
  tpar: ["3PA rate", "Share of field-goal attempts that are threes. Style stat: no good or bad."],
  ftr: ["Free-throw rate", "FTA ÷ FGA. How often he gets to the line."],
  ato: ["Assist-to-turnover", "Assists ÷ turnovers."],
  pool: ["Percentile pool", "D-I rotation players in the Bronco IQ database for the same season: 15+ games and 15+ minutes per game. 100 = best; lower-is-better stats are already flipped."],
  freq: ["Shot frequency", "Share of his field-goal attempts from each spot, smoothed across neighboring spots."],
  vsdi: ["vs D-I", "Points per shot in that zone minus the D-I average for that kind of shot (rim 59.3%, other 2s 39.4%, threes 34.7%)."],
  hisfg: ["His FG%", "His raw make rate at each spot, smoothed across neighboring spots. Low-volume spots are faded."],
  rim: ["Rim", "Shots within about 4 feet of the basket."],
  oth2: ["Other 2s", "Two-point shots outside the rim area: paint floaters, short and long mid-range."],
  c3: ["Corner 3", "Threes from the corners, the shortest three on the floor."],
  ab3: ["Above-the-break 3", "Threes from the wings and top of the key."],
  pps: ["Points per shot", "Points per field-goal attempt (no free throws). D-I average is about 1.05."],
  astd: ["Assisted makes", "Share of his made field goals with an assist logged. Assisted makes are mostly catch-and-shoot; unassisted are mostly off the dribble."],
  shrate: ["Share of attempts", "Share of all his field-goal attempts from that zone."],
  pts: ["Points", ""], reb: ["Rebounds", ""], ast: ["Assists", ""], stl: ["Steals", ""], blk: ["Blocks", ""], to: ["Turnovers", "Lower is better."],
  min: ["Minutes", ""], fgma: ["Field goals made-attempted", ""], tpma: ["Threes made-attempted", ""], ftma: ["Free throws made-attempted", ""],
  playscore: ["Playmaking score (v1.1)", "Creating offense for others, from the RStudio skill model (the Creation component). Bell-curve scale: 50 = D-I average, 70 = top ~7%, 80+ = top ~1%. Ranked against D-I players with 200+ minutes that season."],
  scorescore: ["Scoring score (v1.1)", "Scoring volume and efficiency, from the RStudio skill model. Bell-curve scale: 50 = D-I average, 70 = top ~7%, 80+ = top ~1%. Ranked against D-I players with 200+ minutes that season."],
  rebscore: ["Rebounding score (v1.1)", "Rebounding, from the RStudio skill model. Bell-curve scale: 50 = D-I average, 70 = top ~7%, 80+ = top ~1%. Ranked against D-I players with 200+ minutes that season."],
  defscore: ["DEF score (v2)", "Defense among D-I rotation players (40%+ of team minutes). Bell-curve scale: 50 = average, 70 = top ~7%, 80+ = top ~1%. Weights: DBPM 25%, defensive RAPM 20%, Adj DRtg 15% (DBPM and Adj DRtg have half the team-defense credit removed), STL% 13%, BLK% 10%, DRB% 10%, fouls -7%. Each stat is compared within the player's role, then shrunk for minutes."],
  dbpm: ["DBPM", "Defensive box plus-minus (Barttorvik): estimated defensive points per 100 possessions vs an average D-I player. 0 = average, +2 = good, +4 = elite."],
  adrtg: ["Adj DRtg", "Adjusted defensive rating (Barttorvik): points allowed per 100 possessions while he defends, adjusted for opponents. Lower is better."],
  role: ["Role", "Barttorvik role (Pure PG, Combo G, Wing G, Wing F, Stretch 4, PF/C, C). The DEF score compares players within role."],
  a40: ["Assists per 40", "Assists scaled to 40 minutes."],
  ash: ["Assist share", "Assists as a share of all his plays: AST ÷ (FGA + 0.44 × FTA + AST + TO). Higher = more pass-first."],
  tovr: ["Turnover rate (TOV%)", "Turnovers per 100 of his own plays: TO ÷ (FGA + 0.44 × FTA + TO). Lower is better."],
  load: ["Plays per 40", "On-ball load: (FGA + 0.44 × FTA + AST + TO) per 40 minutes. A box-score stand-in for usage."],
  drapm: ["Defensive RAPM", "Points per 100 opponent possessions a player saves vs an average D-I player, after accounting for all teammates and opponents on the floor. Positive = good."],
  gmsc: ["Game score", "John Hollinger's one-number box score summary: PTS + 0.4·FGM − 0.7·FGA − 0.4·(FTA − FTM) + 0.7·ORB + 0.3·DRB + STL + 0.7·AST + 0.7·BLK − 0.4·PF − TOV. ESPN logs don't split rebounds, so this uses 0.5·REB. ~10 is a solid game."],
};
export const addDefs = (more) => Object.assign(DEF, more);

const tip = document.createElement("div");
tip.id = "tip";
document.addEventListener("DOMContentLoaded", () => document.body.appendChild(tip));
if (document.body) document.body.appendChild(tip);
let custom = false;
const show = (e, h) => {
  tip.style.display = "block";
  tip.style.left = Math.min(e.clientX + 14, innerWidth - 320) + "px";
  tip.style.top = Math.min(e.clientY + 14, innerHeight - 120) + "px";
  tip.innerHTML = h;
};
document.addEventListener("mousemove", (e) => {
  if (custom) return;
  const el = e.target.closest && e.target.closest("[data-def]");
  if (el && DEF[el.dataset.def]) {
    const [d, t] = DEF[el.dataset.def];
    show(e, `<b>${d}</b>${t ? "<br>" + t : ""}`);
  } else tip.style.display = "none";
});
export const tipOn = (e, h) => { custom = true; show(e, h); };
export const tipOff = () => { custom = false; tip.style.display = "none"; };

// ---------- logos ----------
export const LG = (id, s, ab) =>
  `<span class="lg${id ? "" : " fb"}" style="width:${s}px;height:${s}px">${id ? `<img alt="" src="${typeof id === "string" ? id : `https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500-dark/${id}.png&w=${s * 2}&h=${s * 2}`}" onerror="this.parentNode.classList.add('fb');this.remove()">` : ""}<b>${esc(ab || "")}</b></span>`;

// ---------- fetch ----------
export async function getJSON(url) {
  const r = await fetch(url, { credentials: "same-origin" });
  if (r.status === 401) { location.href = "/login?next=" + encodeURIComponent(location.pathname + location.search); throw new Error("signed out"); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText || String(r.status));
  return r.json();
}

export const playerName = (p) => `${p.first_name} ${p.last_name}`;
export const shortSchool = (s) => String(s || "").replace(/\s+(Broncos|Bison|Huskies|Bulldogs|Wildcats|Tigers|Eagles|Bears|Cougars|Aggies|Rams|Lobos|Aztecs|Rebels|Falcons|Cowboys|Spartans|Bulls|Owls|Mustangs|Gaels|Dons|Broncs|Hornets)$/, "");

// ---------- search (client-side over data/index.json) ----------
let indexCache = null;
export async function searchPlayers(q) {
  indexCache ||= (await getJSON("/data/index.json")).players;
  const n = q.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const key = (p) => `${p.first_name} ${p.last_name} ${p.school} ${p.last?.school || ""}`.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return indexCache.filter((p) => key(p).includes(n)).slice(0, 25);
}

// ---------- top bar ----------
export function topBar(active) {
  const el = document.createElement("header");
  el.className = "top";
  el.innerHTML = `<div class="bar">
    <a class="brand" href="/"><img alt="" src="https://a.espncdn.com/i/teamlogos/ncaa/500-dark/68.png"><b>BRONCO IQ</b></a>
    <nav class="nav"><a href="/" class="${active === "home" ? "on" : ""}">Roster</a><a href="/scouting" class="${active === "scouting" ? "on" : ""}">Scouting</a><a href="/rankings" class="${active === "rankings" ? "on" : ""}">Rankings</a><a href="/international" class="${active === "international" ? "on" : ""}">International</a></nav>
    <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="q" placeholder="Search players or schools" autocomplete="off" aria-label="Search players"><div class="results" id="qr"></div></div>
    <div class="user" id="who"></div></div>`;
  document.body.prepend(el);
  document.getElementById("who").innerHTML = `<a href="/logout">Sign out</a>`;

  const q = el.querySelector("#q"), box = el.querySelector("#qr");
  let t = 0, sel = -1, items = [];
  const render = () => {
    box.innerHTML = items.length
      ? items.map((p, i) => `<a href="/player/${encodeURIComponent(p.id)}" class="${i === sel ? "sel" : ""}"><b style="font-weight:600">${esc(playerName(p))}</b><span>${esc(shortSchool(p.school))}${p.last ? ` · ${p.last.season.slice(2)} ${f1(p.last.ppg)} ppg` : ""}</span></a>`).join("")
      : `<div class="empty">No players found</div>`;
    box.classList.add("on");
  };
  q.addEventListener("input", () => {
    clearTimeout(t);
    const v = q.value.trim();
    if (v.length < 2) { box.classList.remove("on"); return; }
    t = setTimeout(async () => { items = await searchPlayers(v); sel = -1; render(); }, 120);
  });
  q.addEventListener("keydown", (e) => {
    if (!items.length) return;
    if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault(); }
    if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    if (e.key === "Enter") location.href = "/player/" + encodeURIComponent(items[Math.max(0, sel)].id);
    if (e.key === "Escape") box.classList.remove("on");
  });
  document.addEventListener("click", (e) => { if (!el.querySelector(".search").contains(e.target)) box.classList.remove("on"); });
}

// ---------- sortable tables ----------
// Click any header in the table's last header row to sort by that column
// (numbers high→low first, text A→Z first; click again to flip). Rows whose
// cell for that column is missing or spans other columns ("no D-I history")
// always stay at the bottom.
const cellAt = (tr, col) => { let c = 0; for (const td of tr.cells) { const span = td.colSpan || 1; if (col < c + span) return span > 1 ? null : td; c += span; } return null; };
const sortVal = (td) => {
  if (!td) return null;
  if (td.dataset.v != null) return td.dataset.v === "" ? null : isNaN(+td.dataset.v) ? td.dataset.v.toLowerCase() : +td.dataset.v;
  const t = td.textContent.replace(/[▾▲▼]/g, "").trim();
  if (!t || t === "—" || t === "–") return null;
  const ht = t.match(/^(\d)['’-](\d{1,2})/); if (ht) return +ht[1] * 12 + +ht[2];
  const num = t.match(/^[+−-]?\d+(\.\d+)?/); if (num) return parseFloat(num[0].replace("−", "-"));
  return t.toLowerCase();
};
export function sortableTable(table) {
  if (!table || table.dataset.sortable) return;
  table.dataset.sortable = "1";
  const head = table.tHead?.rows[table.tHead.rows.length - 1], body = table.tBodies[0];
  if (!head || !body) return;
  let colIdx = 0;
  [...head.cells].forEach((th) => {
    const col = colIdx; colIdx += th.colSpan || 1;
    if (th.dataset.nosort != null || !th.textContent.trim()) return;
    th.classList.add("sortable");
    th.addEventListener("click", (e) => {
      if (e.target.closest("[data-def]") && e.detail === 0) return;
      const dir = th.dataset.dir === "desc" ? "asc" : th.dataset.dir === "asc" ? "desc" : null;
      head.querySelectorAll("th").forEach((x) => { delete x.dataset.dir; });
      const rows = [...body.rows], vals = rows.map((r) => sortVal(cellAt(r, col)));
      const isText = vals.some((v) => typeof v === "string");
      const d = dir || (isText ? "asc" : "desc");
      th.dataset.dir = d;
      const idx = rows.map((r, i) => i).sort((a, b) => {
        const x = vals[a], y = vals[b];
        if (x == null && y == null) return a - b; if (x == null) return 1; if (y == null) return -1;
        const c = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y)) : x - y;
        return (d === "asc" ? c : -c) || a - b;
      });
      idx.forEach((i) => body.appendChild(rows[i]));
    });
  });
}
