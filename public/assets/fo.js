// Front office player pool (Salary Cap + Roster Builder).
//   Returners  = Boise St. 2026-27 roster (/data/roster.json)
//   Transfers  = every other 2025-26 D-I player (Search pool, our pipeline numbers)
//   Freshmen   = International board (/data/intl/board.json); high-school recruits go in Custom slots
// Each player: { id, type, first, last, name, school, pos, ht, cls, photo, logo, cid, rates, sk }
//   rates = last D-I season from the national rankings file (per-40s, TS%, usage, RAPM), when he has one.
import { getJSON, esc } from "/assets/core.js";
import { loadPool } from "/assets/pool.js";

const HS = (espn, w = 220, h = 270) => `https://a.espncdn.com/combiner/i?img=/i/headshots/mens-college-basketball/players/full/${espn}.png&w=${w}&h=${h}&scale=crop`;
const BSU_LOGO = "https://a.espncdn.com/i/teamlogos/ncaa/500-dark/68.png";
let cache = null;

export async function loadFO() {
  if (cache) return cache;
  cache = (async () => {
    const [roster, pool, nat, intl, dist] = await Promise.all([
      getJSON("/data/roster.json").catch(() => ({ players: [] })),
      loadPool().catch(() => ({ P: [] })),
      getJSON("/data/rankings/national-2025-26.json").catch(() => ({ cols: [], rows: [] })),
      getJSON("/data/intl/board.json").catch(() => ({ players: [] })),
      getJSON("/data/teams/_dist.json").catch(() => null),
    ]);
    const C = Object.fromEntries(nat.cols.map((c, i) => [c, i]));
    const RATES = new Map(nat.rows.map((r) => [r[C.id], Object.fromEntries(["gp", "min", "mpg", "ppg", "rpg", "apg", "pts40", "reb40", "ast40", "ts", "usg", "p3", "rapm", "orapm", "drapm", "dbpm", "sc", "pl", "rb", "df", "team", "role"].map((k) => [k, r[C[k]] ?? null]))]));
    const out = [];
    const rosterCids = new Set();
    for (const p of roster.players || []) {
      if (p.cid) rosterCids.add(p.cid);
      out.push({ id: p.id, type: "Returner", first: p.first_name, last: p.last_name, school: "Boise St.", pos: p.position || "", ht: p.height || "", cls: p.class_year || "",
        photo: p.espnId ? HS(p.espnId) : "", logo: BSU_LOGO, cid: p.cid || null, rates: p.cid ? RATES.get(p.cid) || null : null, from: p.last?.school || "" });
    }
    for (const p of pool.P || []) {
      if (rosterCids.has(p.id)) continue;
      out.push({ id: p.id, type: "Transfer", first: p.first_name, last: p.last_name, school: p.school, conf: p.conference, pos: p.position || "", ht: p.height || "", cls: p.class_year || "",
        photo: p.espn ? HS(p.espn) : p.photoUrl || "", logo: p.logo || "", cid: p.id, rates: RATES.get(p.id) || null });
    }
    for (const p of intl.players || []) {
      const [first, ...rest] = String(p.name).split(" ");
      out.push({ id: "intl:" + p.name.toLowerCase().replace(/[^a-z]+/g, "-"), type: "Freshman", first, last: rest.join(" "), school: p.club || p.team || "", pos: p.pos || "", ht: p.ht || "", cls: p.cls ? `Class of ${p.cls}` : "",
        photo: p.headshot || "", logo: "", cid: null, rates: null, nat: p.nat || "" });
    }
    for (const p of out) p.name = `${p.first} ${p.last}`.trim();
    return { players: out, byId: new Map(out.map((p) => [p.id, p])), dist: dist?.dist || null };
  })();
  return cache;
}

// Headshot block: photo, or an empty frame (no initials).
export const shot = (p, cls = "fos") => `<span class="${cls}">${p?.photo ? `<img alt="" loading="lazy" src="${esc(p.photo)}" onerror="this.remove()">` : ""}</span>`;
export const teamMark = (p, s = 18) => (p?.logo ? `<img class="fol" alt="" src="${esc(p.logo)}" style="width:${s}px;height:${s}px" onerror="this.remove()">` : `<span class="fol fb" style="width:${s}px;height:${s}px">${esc(String(p?.school || "").slice(0, 2).toUpperCase())}</span>`);
export const money = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v || 0);
export const moneyNum = (v) => Math.max(0, Number(v || 0)).toLocaleString("en-US");
export const parseMoney = (s) => { const n = Number(String(s).replace(/[^0-9]/g, "")); return Number.isFinite(n) ? n : 0; };
export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

// Shared staff scenarios (KV via the worker).
export async function loadSaved(kind) { try { return (await getJSON(`/api/fo/${kind}`)).scenarios || []; } catch { return []; } }
export async function saveAll(kind, scenarios) {
  const r = await fetch(`/api/fo/${kind}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarios }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Save failed");
}

// Player picker modal (shared). onPick(player) — candidates filtered by type and search text.
export function openPicker({ title, types, players, onPick, exclude = new Set() }) {
  const host = document.createElement("div");
  host.className = "fomodal";
  let q = "", tab = types[0];
  const draw = () => {
    const needle = norm(q);
    const list = players.filter((p) => p.type === tab && !exclude.has(p.id) && (!needle || norm(`${p.name} ${p.school} ${p.pos}`).includes(needle)))
      .sort((a, b) => (b.rates?.min || 0) - (a.rates?.min || 0)).slice(0, 80);
    host.innerHTML = `<div class="fobox" role="dialog" aria-label="${esc(title)}"><div class="fohd"><div><b>${esc(title)}</b><div class="m">${list.length}${list.length === 80 ? "+" : ""} matches</div></div><button class="fox" data-x aria-label="Close">✕</button></div>
      ${types.length > 1 ? `<div class="seg fotabs">${types.map((t) => `<button data-t="${t}" class="${t === tab ? "on" : ""}">${t === "Freshman" ? "Freshmen / Intl" : t + "s"}</button>`).join("")}</div>` : ""}
      <div class="fosrch"><input id="fopq" placeholder="Search player, school or position" value="${esc(q)}" autocomplete="off"></div>
      <div class="folist">${list.map((p) => `<button class="forow" data-id="${esc(p.id)}">${shot(p, "fos sm")}<span class="fon"><b>${esc(p.name)}</b><span>${teamMark(p, 14)}${esc(p.school)}${p.rates ? ` · ${p.rates.ppg?.toFixed?.(1) ?? "—"} ppg` : ""}</span></span><span class="m">${esc(p.pos)}${p.ht ? " · " + esc(p.ht) : ""}</span></button>`).join("") || `<div class="m" style="padding:18px;text-align:center">No players found.</div>`}</div></div>`;
    const inp = host.querySelector("#fopq"); inp.focus(); inp.setSelectionRange(q.length, q.length);
  };
  host.addEventListener("input", (e) => { if (e.target.id === "fopq") { q = e.target.value; draw(); } });
  host.addEventListener("mousedown", (e) => { if (e.target === host) close(); });
  host.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.x !== undefined) return close();
    if (b.dataset.t) { tab = b.dataset.t; draw(); return; }
    if (b.dataset.id) { onPick(players.find((p) => p.id === b.dataset.id)); close(); }
  });
  const esc_ = (e) => { if (e.key === "Escape") close(); };
  function close() { host.remove(); removeEventListener("keydown", esc_); }
  addEventListener("keydown", esc_);
  document.body.appendChild(host);
  draw();
}
