// Player roles (role model v1, model/roles_v1) — one position system for the whole site.
//   8 roles → 5 Transfer Board lanes → 4 groups (Prep List, Targets, Recruit Map).
// Where a player's role comes from, in order:
//   1. staff override (KV via /api/roles)
//   2. D-I players: data/roles-2025-26.json (lineup spots + stats; recomputed each season)
//   3. everyone else (high school, international, no D-I minutes): listed position + height,
//      sharpened with FIBA shooting for internationals.
export const ROLES = ["Point guard", "Combo guard", "Sniper", "Wing", "Forward", "Stretch 4", "Center", "Stretch 5"];
export const ROLE_AB = { "Point guard": "PG", "Combo guard": "CG", Sniper: "SNP", Wing: "W", Forward: "F", "Stretch 4": "S4", Center: "C", "Stretch 5": "S5" };
export const GROUPS = [["G", "Guards"], ["W", "Wings"], ["F", "Forwards"], ["B", "Bigs"]];
export const GROUP_OF = { "Point guard": "G", "Combo guard": "G", Sniper: "G", Wing: "W", Forward: "F", "Stretch 4": "F", Center: "B", "Stretch 5": "B" };
export const BOARD_LANES = ["Point Guards", "Combo Guards", "Wings", "Forwards", "Bigs"];
export const LANE_OF = { "Point guard": "Point Guards", "Combo guard": "Combo Guards", Sniper: "Combo Guards", Wing: "Wings", Forward: "Forwards", "Stretch 4": "Forwards", Center: "Bigs", "Stretch 5": "Bigs" };
// Depth-chart spot each role defaults to (staff spot overrides still win).
export const SPOT_OF = { "Point guard": "PG", "Combo guard": "SG", Sniper: "SG", Wing: "SF", Forward: "PF", "Stretch 4": "PF", Center: "C", "Stretch 5": "C" };
export const ROLE_DEF = {
  "Point guard": "Assists come first: 6+ assists per 100 possessions (5+ at 6'4\" and under with assists a big share of his usage). 6'6\" or shorter.",
  "Combo guard": "Under 6'4\" and not a point guard: scoring-first guards (more usage and points, fewer assists than point guards) and small guards in support roles.",
  Sniper: "Most of his shots are threes: 55%+ of attempts and 7+ threes per 100 possessions, few assists. Over 6'6\" only if 75%+ of his shots are threes.",
  Wing: "6'4\" to 6'9\" and usually the middle player in his lineups: two guards smaller than him, two forwards or bigs bigger.",
  Forward: "Plays the 4: one of the two biggest players in his lineups but usually next to someone bigger. Under 38% threes.",
  "Stretch 4": "Plays the 4 and shoots: 38%+ of his shots are threes (5+ per 100 possessions).",
  Center: "Plays the 5: the biggest player on the floor half his minutes or more (height, weight, rebounding, blocks, rim play). Under 30% threes.",
  "Stretch 5": "Plays the 5 and shoots: 30%+ of his shots are threes (4+ per 100 possessions).",
  Unicorn: "Skills far outside his size: a big (6'8\"+) who handles, shoots and creates like a guard, or a small player (6'4\" and under) who rebounds, blocks and finishes like a big. About 2.5 standard deviations beyond what his height and weight predict, at 20%+ usage. 16 D-I players in 2025-26.",
};
let DATA = null, OV = {}, loaded = null;
export function loadRoles() {
  return (loaded ||= Promise.all([
    fetch("/data/roles-2025-26.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("/api/roles").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([d, o]) => { DATA = d; OV = o?.overrides || {}; return { data: DATA, overrides: OV }; }));
}
const inch = (h) => { if (typeof h === "number") return h; const m = String(h || "").match(/(\d+)\D+(\d+)/); return m ? +m[1] * 12 + +m[2] : null; };
// Starting role from listed position + height (no D-I stats yet).
export function roleFromListing(pos, ht, fiba) {
  const p = String(pos || "").toUpperCase(), h = inch(ht) ?? 77;
  let r;
  if (/\bC\b|^C/.test(p) || (/F|PF/.test(p) && h >= 82)) r = "Center";
  else if (/PF/.test(p) || (/^F|\bF\b|SF\/PF/.test(p) && h >= 79)) r = "Forward";
  else if (/PG/.test(p) && h <= 78) r = "Point guard";
  else if (h <= 75) r = "Combo guard";
  else if (h >= 82) r = "Forward";
  else r = "Wing";
  // Internationals: their FIBA youth-event shooting sharpens stretch / sniper calls.
  const ev = Array.isArray(fiba) && fiba.length ? [...fiba].sort((a, b) => b.yr - a.yr)[0] : null;
  if (ev?.tp && ev?.fg && ev.fg[1] > 0) {
    const tpar = ev.tp[1] / ev.fg[1];
    if (r === "Forward" && tpar >= 0.38) r = "Stretch 4";
    else if (r === "Center" && tpar >= 0.3) r = "Stretch 5";
    else if (["Combo guard", "Wing"].includes(r) && tpar >= 0.55 && (ev.ast ?? 0) < 2.5 && (h <= 78 || tpar >= 0.75)) r = "Sniper";
  }
  return r;
}
// key: canonical id for D-I players, "hs:<slug>" / "intl:<slug>" for prep prospects.
export function roleOf({ key, cid, pos, ht, fiba }) {
  const o = OV[key] || (cid ? OV[cid] : null) || {};
  const row = cid && DATA?.roles?.[cid];
  const auto = row ? row[0] : roleFromListing(pos, ht, fiba);
  const autoUni = row ? !!row[1] : false;
  const role = o.role || auto, unicorn = o.unicorn ?? autoUni;
  return { role, ab: ROLE_AB[role], group: GROUP_OF[role], lane: LANE_OF[role], spot: SPOT_OF[role], unicorn, utype: row?.[2] || "",
    source: o.role ? "staff" : row ? "stats" : "listing", auto, shares: row ? { guard: row[3], wing: row[4], front: row[5], five: row[6] } : null, by: o.by || "" };
}
export async function setRole(id, patch) {
  const r = await fetch("/api/roles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Couldn't save the role");
  OV = d.overrides || OV; return OV;
}
// Small grey tag: "Stretch 4" (+ "Unicorn"). Hover shows the definition.
export const roleTag = (R, opts = {}) => R ? `<span class="rtag" title="${(ROLE_DEF[R.role] || "").replace(/"/g, "&quot;")}${R.source === "listing" ? " (from listed position and height until he plays D-I minutes)" : R.source === "staff" ? ` (set by ${R.by || "staff"})` : ""}">${opts.short ? R.ab : R.role}</span>${R.unicorn ? `<span class="rtag uni" title="${ROLE_DEF.Unicorn.replace(/"/g, "&quot;")}">Unicorn</span>` : ""}` : "";
// Picker: 8 role buttons + unicorn toggle + "back to automatic". data-role-pick / data-uni-pick / data-role-auto.
export const rolePicker = (R) => `<div class="rpick">${ROLES.map((r) => `<button type="button" data-role-pick="${r}" class="${R.role === r ? "on" : ""}">${r}</button>`).join("")}
  <button type="button" data-uni-pick="${R.unicorn ? "0" : "1"}" class="${R.unicorn ? "on" : ""}">Unicorn</button>${R.source === "staff" ? `<button type="button" data-role-auto="1" class="auto">Back to automatic (${R.auto})</button>` : ""}</div>`;
export const ROLE_CSS = `.rtag{display:inline-block;font:600 9.5px var(--mono);letter-spacing:.05em;text-transform:uppercase;color:#cfd3d9;border:1px solid #4a4d53;border-radius:4px;padding:1px 5px;margin-right:4px;white-space:nowrap;vertical-align:1px}
.rtag.uni{color:#fff;border-color:#d6d8db;background:rgba(255,255,255,.08)}
.rpick{display:flex;flex-wrap:wrap;gap:4px}.rpick button{background:var(--card);border:1px solid var(--edge);color:var(--dim);border-radius:6px;padding:4px 8px;font:10.5px var(--mono);cursor:pointer}
.rpick button:hover{color:#fff}.rpick button.on{border-color:#d6d8db;color:#fff;background:#2e3034}.rpick button.auto{border-style:dashed}`;
