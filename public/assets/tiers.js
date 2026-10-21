// Staff board colors (green / yellow / red) for prep prospects, shared by the Prep List,
// Recruit Map and High School pages. The board files carry the starting color; staff changes
// are stored in KV through /api/prep-tiers and win over the file.
//   ids: "hs:<name-slug>" or "intl:<name-slug>"
export const TIERS = [["green", "Green", "#34a853"], ["yellow", "Yellow", "#fbbc04"], ["red", "Red", "#ea4335"], ["", "Not colored", "#8a8e95"]];
export const TIERC = { green: "#34a853", yellow: "#fbbc04", red: "#ea4335" }, NOC = "#8a8e95";
export const tierColor = (t) => TIERC[t] || NOC;
export const tierSlug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
let OV = {};
export async function loadTiers() {
  try { const r = await fetch("/api/prep-tiers"); if (r.ok) OV = (await r.json()).tiers || {}; } catch {}
  return OV;
}
// Apply saved colors to a list of players (each needs .id). Returns the same list.
export function applyTiers(list) { for (const p of list) if (p.id in OV) p.tier = OV[p.id].tier || ""; return list; }
export async function setTier(id, tier) {
  const r = await fetch("/api/prep-tiers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, tier: tier || null }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Couldn't save the color");
  OV = d.tiers || OV; return OV;
}
// Four small buttons to pick a color. data-tier-pick="<color>" on each; caller wires the click.
export const tierPicker = (cur) => `<div class="tpick">${TIERS.map(([k, l, c]) => `<button type="button" data-tier-pick="${k}" class="${(cur || "") === k ? "on" : ""}" title="${l}"><s style="background:${c}"></s>${l}</button>`).join("")}</div>`;
export const TIER_CSS = `.tpick{display:flex;gap:4px;flex-wrap:wrap}.tpick button{display:flex;align-items:center;gap:5px;background:var(--card);border:1px solid var(--edge);color:var(--dim);border-radius:6px;padding:4px 8px;font:10.5px var(--mono);cursor:pointer}
.tpick button s{width:9px;height:9px;border-radius:50%;display:inline-block}.tpick button:hover{color:#fff}.tpick button.on{border-color:#d6d8db;color:#fff;background:#2e3034}`;
