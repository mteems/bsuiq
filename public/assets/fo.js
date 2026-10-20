// Front office player pool (Salary Cap + Roster Builder).
//   Returners  = Boise St. 2026-27 roster (/data/roster.json)
//   Transfers  = every other 2025-26 D-I player (Search pool, our pipeline numbers)
//   Freshmen   = International board (/data/intl/board.json) + High School board (/data/hs/board.json)
//   fr = freshman projection (Win model's freshman terms: 247 Composite rank + height) for players
//        with no D-I season: { po, pd, basis }
// Each player: { id, type, first, last, name, school, pos, ht, cls, photo, logo, cid, rates, sk }
//   rates = last D-I season from the national rankings file (per-40s, TS%, usage, RAPM), when he has one.
import { getJSON, esc } from "/assets/core.js";
import { loadPool } from "/assets/pool.js";

const HS = (espn, w = 220, h = 270) => `https://a.espncdn.com/combiner/i?img=/i/headshots/mens-college-basketball/players/full/${espn}.png&w=${w}&h=${h}&scale=crop`;
const BSU_LOGO = "https://a.espncdn.com/i/teamlogos/ncaa/500-dark/68.png";
let cache = null;
const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
const nkey = (s) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");

export async function loadFO() {
  if (cache) return cache;
  cache = (async () => {
    const [roster, pool, nat, intl, dist, hs, FR] = await Promise.all([
      getJSON("/data/roster.json").catch(() => ({ players: [] })),
      loadPool().catch(() => ({ P: [] })),
      getJSON("/data/rankings/national-2025-26.json").catch(() => ({ cols: [], rows: [] })),
      getJSON("/data/intl/board.json").catch(() => ({ players: [] })),
      getJSON("/data/teams/_dist.json").catch(() => null),
      getJSON("/data/hs/board.json").catch(() => ({ players: [] })),
      getJSON("/data/rankings/freshmen-2026-27.json").catch(() => null),
    ]);
    const C = Object.fromEntries(nat.cols.map((c, i) => [c, i]));
    const RATES = new Map(nat.rows.map((r) => [r[C.id], Object.fromEntries(["gp", "min", "mpg", "ppg", "rpg", "apg", "pts40", "reb40", "ast40", "ts", "usg", "p3", "rapm", "orapm", "drapm", "dbpm", "sc", "pl", "rb", "df", "team", "role", "imp", "pimp", "pimpo", "pimpd", "wn"].map((k) => [k, r[C[k]] ?? null]))]));
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
        photo: p.headshot || "", logo: "", cid: null, rates: null, nat: p.nat || "", href: "/international#" + slug(p.name) });
    }
    for (const p of hs.players || []) {
      const [first, ...rest] = String(p.name).split(" ");
      out.push({ id: "hs:" + slug(p.name), type: "Freshman", first, last: rest.join(" "), school: p.school || "", pos: p.pos || "", ht: p.ht || "", cls: p.cls ? `Class of ${p.cls}` : "",
        photo: p.headshot || "", logo: "", cid: null, rates: null, rank247: p.r247 || p.rInd || null, tier: p.tier || null, href: "/highschool#" + slug(p.name) });
    }
    // Freshman projections: this year's 247 top 100 by name; otherwise a known 247 rank + height.
    const FRN = new Map((FR?.rows || []).map((r) => [nkey(r.name), r]));
    const inch = (h) => { const m = String(h || "").match(/(\d+)\D+(\d+)/); return m ? +m[1] * 12 + +m[2] : null; };
    for (const p of out) {
      if (p.rates && p.rates.min >= 100) continue;
      const r = FRN.get(nkey(`${p.first} ${p.last}`));
      if (r) { p.fr = { po: r.proj_o, pd: r.proj_d, basis: `247 #${r.rank} freshman projection` }; continue; }
      const rk = p.rank247, h = inch(p.ht);
      if (FR?.map && rk && h) { const t = FR.map.intercept + FR.map.log_rank * Math.log(rk) + FR.map.height_in * h; const share = (FR.rows[0].proj_o / (FR.rows[0].proj_o + FR.rows[0].proj_d)) || 0.55; p.fr = { po: t * share, pd: t * (1 - share), basis: `247 #${rk} freshman projection` }; }
    }
    for (const p of out) { p.name = `${p.first} ${p.last}`.trim(); if (!p.href) p.href = "/player/" + encodeURIComponent(p.id); }
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

// ---------------------------------------------------------------- saved scenarios
// Each person has his own scenarios ("mine", under the name he signed in with) and the staff share
// a common list ("staff"). The server saves one scenario at a time, so two people saving at once
// don't overwrite each other.
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
export async function loadScenarios(kind) { try { const r = await getJSON(`/api/fo/${kind}`); return { user: r.user || "", mine: r.mine || [], staff: r.staff || [] }; } catch { return { user: "", mine: [], staff: [] }; } }
async function foCall(kind, scope, id, method, body) {
  const r = await fetch(`/api/fo/${kind}/${scope}/${encodeURIComponent(id)}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Save failed");
  return d.scenarios || [];
}
export const putScenario = (kind, scope, scenario) => foCall(kind, scope, scenario.id, "PUT", { scenario });
export const delScenario = (kind, scope, id) => foCall(kind, scope, id, "DELETE");
// Saved-scenario strip: "My scenarios" and "Staff scenarios" chips. loaded = { scope, id } or null.
export function scenarioBarHTML(S, loaded) {
  const chip = (x, scope) => `<span class="scn${loaded?.scope === scope && loaded?.id === x.id ? " on" : ""}" title="${esc(`Saved by ${x.savedBy || "staff"}${x.savedAt ? " · " + fmtDay(x.savedAt) : ""}`)}"><button data-load="${scope}:${esc(x.id)}">${esc(x.name)}</button><button data-del="${scope}:${esc(x.id)}" aria-label="Delete ${esc(x.name)}">×</button></span>`;
  const group = (label, list, scope, empty) => `<div class="scg"><span class="label">${label}</span>${list.length ? list.map((x) => chip(x, scope)).join("") : `<span class="scemp">${empty}</span>`}</div>`;
  return `<div class="scbar noprint">${group(S.user ? `My scenarios · ${esc(S.user)}` : "My scenarios", S.mine, "me", S.user ? "None saved yet" : "Choose your name (top right) to keep your own")}${group("Staff scenarios", S.staff, "staff", "None saved yet")}</div>`;
}
// Save menu under the Save button: update the loaded one, or save to my list / the staff list.
export function saveMenu(anchor, { S, loaded, name, onPick }) {
  document.querySelector(".fomenu")?.remove();
  const m = document.createElement("div"); m.className = "fomenu"; m.style.minWidth = "250px";
  const cur = loaded ? (loaded.scope === "me" ? S.mine : S.staff).find((x) => x.id === loaded.id) : null;
  const items = [
    ...(cur ? [[`Update “${cur.name}”`, loaded.scope === "me" ? "in my scenarios" : "in staff scenarios", () => onPick(loaded.scope, false)]] : []),
    [cur ? "Save a copy to my scenarios" : "Save to my scenarios", S.user ? `under ${S.user}` : "choose your name first (top right)", () => onPick("me", true), !S.user],
    [cur ? "Save a copy as a staff scenario" : "Save as a staff scenario", "shared with the whole staff", () => onPick("staff", true)],
  ];
  m.innerHTML = `<div class="label" style="padding:6px 10px 4px">Save “${esc(name)}”</div>` + items.map(([l, sub, , dis], i) => `<button data-i="${i}"${dis ? " disabled" : ""} style="display:block;text-align:left"><span style="display:block;font:600 13px var(--ui);letter-spacing:0;text-transform:none;color:#fff">${esc(l)}</span><span style="display:block;font:500 9.5px var(--mono);letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-top:2px">${esc(sub)}</span></button>`).join("");
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.right - 250, innerWidth - 260)) + "px"; m.style.top = r.bottom + 6 + "px";
  document.body.appendChild(m);
  const off = (ev) => { if (!m.contains(ev.target)) { m.remove(); removeEventListener("mousedown", off, true); } };
  setTimeout(() => addEventListener("mousedown", off, true));
  m.onclick = (ev) => { const b = ev.target.closest("button"); if (!b || b.disabled) return; m.remove(); removeEventListener("mousedown", off, true); items[+b.dataset.i][2](); };
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
      ${types.length > 1 ? `<div class="seg fotabs">${types.map((t) => `<button data-t="${t}" class="${t === tab ? "on" : ""}">${t === "Freshman" ? "Freshmen · Intl · HS" : t + "s"}</button>`).join("")}</div>` : ""}
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
