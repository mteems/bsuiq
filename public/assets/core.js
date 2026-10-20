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
  winscore: ["Win score (v0.4)", "How much a player moves the needle on winning, 2025-26. His impact per 100 possessions comes from the measures that best predicted next-season results over 10 seasons of D-I play-by-play: his box-score profile (compared with players at his position), BPM-type ratings, his own on-court plus-minus, his recruiting rank and, to the extent it carries over, his team's level. Turned into wins added over a replacement-level player at his position (guard, forward or big) across his minutes, then put on the skill-score scale: 50 = D-I average, 70 = top ~7%, 80+ = top ~1%. Needs 200+ minutes."],
  wins: ["Wins added", "Wins his play added over a replacement-level D-I player at his position (15th percentile impact among guards, forwards or bigs) across his 2025-26 possessions. Points over replacement ÷ points per win (40, measured from the 2025-26 D-I schedule)."],
  wpts: ["Points added", "Scoring margin added over a replacement-level player across his 2025-26 possessions."],
  imp: ["Impact / 100", "Points per 100 possessions his team gains with him on the floor vs. an average D-I player (offense + defense). Win model v0.3: the parts below, weighted by how well each predicted the next season over 10 seasons."],
  oimp: ["Offense / 100", "The offensive half of Impact."],
  dimp: ["Defense / 100", "The defensive half of Impact: points per 100 possessions saved. Positive = better."],
  wind: ["On-court", "Part of Impact from his own on-court plus-minus: how his lineups did beyond his team's level, adjusted for the other nine players (this season and last)."],
  wprk: ["Position rank", "Rank in Impact / 100 among D-I guards, forwards or bigs (his position group) with 200+ minutes."],
  wrec: ["Recruit", "Part of Impact from his high-school recruiting rank (RSCI / 247Sports Composite top 100). Matters most for freshmen and sophomores and fades after that."],
  wbox: ["Box", "Part of Impact from his box-score profile: scoring, shooting, playmaking, turnovers, rebounding, steals, blocks, fouls, minutes share."],
  wbpm: ["BPM", "Part of Impact from Barttorvik's opponent-adjusted box plus-minus (overall, offense, defense; this season and last)."],
  wteam: ["Team", "Part of Impact credited from his team's level (adjusted margin and Barttorvik adjusted ratings). Only as much as team level has predicted a player's next season; for players who change teams the defensive part of it doesn't carry over."],
  pimp: ["Projected 2026-27", "Projected Impact / 100 next season: Impact plus a year of growth for his class (seniors and grads hold steady; nobody is projected to decline), plus a small adjustment if he changed teams (moving to a stronger program has historically helped a little). This is the number the Roster Builder uses."],
  pdev: ["Growth", "How much the model expects him to improve next season for his class and age (young, productive players grow most). Never negative: experience is treated as neutral or better."],
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
// Conference logos, one table for the whole site. ESPN's dark-background versions where they
// exist; logos that are dark on a dark page (Pac-12, WCC, Horizon, ...) are shown solid white.
const EC = (v, n) => `https://a.espncdn.com/i/teamlogos/ncaa_conf/${v}/${n}.png`;
const CONF_LOGO = {
  "Pac-12": [EC("500-dark", 9)], SEC: [EC("500-dark", 8)], "Big 12": [EC("500-dark", 4)], "Big Ten": [EC("500-dark", 5)], ACC: [EC("500-dark", 1)],
  "Big East": ["https://sportslogohistory.com/wp-content/uploads/2017/12/big_east_conference_2005-pres.png"], American: [EC("500-dark", 151)], "Mountain West": [EC("500-dark", 17)],
  WCC: ["https://commons.wikimedia.org/wiki/Special:Redirect/file/West_Coast_Conference_logo_2019_with_name.svg", 1], MVC: [EC(500, 21)], CUSA: [EC(500, 12), 1],
  "Atlantic 10": ["https://sportslogohistory.com/wp-content/uploads/2018/03/atlantic__10_conference_2014-pres.png", 1], MAC: [EC("500-dark", 15)],
  "America East": ["https://commons.wikimedia.org/wiki/Special:Redirect/file/America_East_Conference_logo_2024.svg"], ASUN: ["https://sportslogohistory.com/wp-content/uploads/2019/10/atlantic_sun_conference_2016-pres.png"],
  "Big Sky": [EC(500, 20)], "Big South": [EC("500-dark", 40)], "Big West": ["https://commons.wikimedia.org/wiki/Special:Redirect/file/Big_West_Conference_logo_2021.svg", 1], CAA: [EC("500-dark", 48)],
  Horizon: ["https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Hl-logo-large-dark.png/250px-Hl-logo-large-dark.png", 1], "Ivy League": [EC(500, 22)],
  MAAC: ["https://commons.wikimedia.org/wiki/Special:Redirect/file/Metro_Atlantic_Athletic_Conference_logo.svg"], MEAC: [EC(500, 24)], NEC: [EC("500-dark", 25)], OVC: [EC(500, 26)], Patriot: [EC("500-dark", 27)],
  SoCon: [EC(500, 29), 1], Southland: [EC("500-dark", 30)], Summit: ["https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Summit_League_logo.svg/250px-Summit_League_logo.svg.png"],
  "Sun Belt": [EC(500, 37)], SWAC: [EC("500-dark", 31)],
};
const CONF_ALIAS = { "Horizon League": "Horizon", "Missouri Valley": "MVC", "Conference USA": "CUSA", "C-USA": "CUSA", "Summit League": "Summit", MWC: "Mountain West", "Mountain West Conference": "Mountain West", AAC: "American", "Atlantic Sun": "ASUN", "Southern": "SoCon", "Pac 12": "Pac-12" };
export const confLogo = (name) => { const c = CONF_LOGO[CONF_ALIAS[name] || name]; return c ? { src: c[0], white: !!c[1] } : null; };
// <img> for a conference, or a small text badge when there is no logo.
export const confImg = (name, size = 24, cls = "clogo") => { const c = confLogo(name), ab = esc(String(name || "").replace(/^The /, "").slice(0, 3).toUpperCase());
  return c ? `<img class="${cls}" alt="" src="${esc(c.src)}" style="width:${size}px;height:${size}px;object-fit:contain${c.white ? ";filter:brightness(0) invert(1)" : ""}" onerror="this.outerHTML='<span class=cfb style=width:${size}px;height:${size}px>${ab}</span>'">` : `<span class="cfb" style="width:${size}px;height:${size}px">${ab}</span>`; };

export const LG = (id, s, ab) =>
  `<span class="lg${id ? "" : " fb"}" style="width:${s}px;height:${s}px">${id ? `<img alt="" src="${typeof id === "string" && !/^\d+$/.test(id) ? id : `https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500-dark/${id}.png&w=${s * 2}&h=${s * 2}`}" onerror="this.parentNode.classList.add('fb');this.remove()">` : ""}<b>${esc(ab || "")}</b></span>`;

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
const NAV = [
  [["home", "/", "Roster"], ["scouting", "/scouting", "Scouting"], ["rankings", "/rankings", "Rankings"]],
  [["search", "/search", "Search"], ["targets", "/targets", "Targets"], ["board", "/board", "Transfer Board"], ["international", "/international", "International"]],
  [["cap", "/cap", "Salary Cap"], ["builder", "/builder", "Roster Builder"]],
];
// ---------- who is signed in (staff name; keeps saved scenarios and boards per person) ----------
let meP = null;
export const me = (fresh = false) => (meP && !fresh ? meP : (meP = getJSON("/api/me").catch(() => ({ user: "", staff: [] }))));
export async function setMe(user) {
  const r = await fetch("/api/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't switch profile");
  meP = null; dispatchEvent(new CustomEvent("biq-me", { detail: { user } }));
  return user;
}
async function profileMenu(box) {
  const draw = (M, open) => {
    box.innerHTML = `<div class="pmenu"><button class="pbtn${M.user ? "" : " none"}" id="pbtn" aria-expanded="${open}">${M.user ? `<span class="av">${esc(M.user[0])}</span>${esc(M.user)}` : "Choose your name"}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m6 9 6 6 6-6"/></svg></button>
      ${open ? `<div class="pdrop"><div class="label" style="padding:6px 10px 4px">Signed in as</div>${M.staff.map((n) => `<button data-u="${esc(n)}" class="${n === M.user ? "on" : ""}">${esc(n)}${n === M.user ? `<span>✓</span>` : ""}</button>`).join("")}<a href="/logout">Sign out</a></div>` : ""}</div>`;
  };
  let M = await me(), open = false;
  draw(M, open);
  box.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "pbtn") { open = !open; draw(M, open); return; }
    if (b.dataset.u) { try { await setMe(b.dataset.u); M = await me(true); } catch {} open = false; draw(M, open); }
  });
  document.addEventListener("click", (e) => { if (open && e.target.isConnected && !box.contains(e.target)) { open = false; draw(M, open); } });
  addEventListener("biq-me", async () => { M = await me(); draw(M, open); });
}
export function topBar(active) {
  const el = document.createElement("header");
  el.className = "top";
  el.innerHTML = `<div class="bar">
    <a class="brand" href="/"><img alt="" src="https://a.espncdn.com/i/teamlogos/ncaa/500-dark/68.png"><b>BRONCO IQ</b></a>
    <nav class="nav">${NAV.map((g, i) => (i ? `<span class="navsep" aria-hidden="true"></span>` : "") + g.map(([k, href, l]) => `<a href="${href}" class="${active === k ? "on" : ""}">${l}</a>`).join("")).join("")}</nav>
    <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="q" placeholder="Search players or schools" autocomplete="off" aria-label="Search players"><div class="results" id="qr"></div></div>
    <div class="user" id="who"></div></div>`;
  document.body.prepend(el);
  profileMenu(document.getElementById("who"));

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
