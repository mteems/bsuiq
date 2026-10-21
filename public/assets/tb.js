// Targets + Transfer Board: shared data calls and the "Targets & board" popover used on Search,
// player pages, Targets and the Transfer Board. Each person has his own lists (under the name he
// signed in with) and the staff share one set ("staff").
import { getJSON, esc, me } from "/assets/core.js";

import { BOARD_LANES, loadRoles, roleOf } from "/assets/roles.js";
export const LANES = BOARD_LANES;
export const TIERS = ["Max", "Starter", "Role", "Development"];
// Default lane for a player = his role's lane (role model v1; staff role overrides included).
export const laneFor = (pos, id, ht) => roleOf({ key: id, cid: id, pos, ht }).lane;
export const SCOPE_KEY = "biq-tb-scope";
export const getScope = () => { try { return localStorage.getItem(SCOPE_KEY) === "me" ? "me" : "staff"; } catch { return "staff"; } };
export const setScope = (s) => { try { localStorage.setItem(SCOPE_KEY, s); } catch {} dispatchEvent(new CustomEvent("biq-tb-scope", { detail: s })); };

let TB = null;
export async function loadTB(fresh = false) {
  if (TB && !fresh) return TB;
  try { const r = await getJSON("/api/tb"); TB = { user: r.user || "", me: r.me || [], staff: r.staff || [] }; }
  catch { TB = { user: "", me: [], staff: [], error: true }; }
  return TB;
}
addEventListener("biq-me", () => { TB = null; });
export async function tbCall(scope, body) {
  const r = await fetch(`/api/tb/${scope}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Couldn't save");
  if (TB) TB[scope] = d.players || [];
  dispatchEvent(new CustomEvent("biq-tb", { detail: { scope } }));
  return d.players || [];
}
export const entryOf = (scope, id) => (TB?.[scope] || []).find((x) => x.id === id) || null;

// Small icon used on Search rows and buttons: filled when he's on either list.
export const tbIcon = (on) => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${on ? `<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".18"/>` : `<circle cx="12" cy="12" r="9"/>`}<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>`;
export function badge(id) {
  const a = entryOf("me", id), b = entryOf("staff", id), on = (x) => x && (x.target || x.lane);
  return { on: !!(on(a) || on(b)), me: a, staff: b };
}

// players: [{ id, p: { name, school, pos, ht, cls, photo, logo } }] (one or several)
export async function openTB(anchor, players, { onChange } = {}) {
  document.querySelector(".tbpop")?.remove();
  const [T, M] = await Promise.all([loadTB(), me()]);
  let scope = getScope(); if (scope === "me" && !M.user) scope = "staff";
  const one = players.length === 1 ? players[0] : null;
  const pop = document.createElement("div"); pop.className = "tbpop"; pop.setAttribute("role", "dialog");
  let lane = null, tier = null, busy = false, msg = "";
  const cur = () => (one ? entryOf(scope, one.id) : null);
  await loadRoles();
  const pick = () => { const c = cur(); lane = c?.lane || lane || laneFor(one?.p.pos || players[0]?.p.pos, (one || players[0])?.id, (one || players[0])?.p.ht); tier = c?.tier || tier || "Role"; };
  pick();
  const draw = () => {
    const c = cur();
    pop.innerHTML = `<div class="tbh"><div><b>${one ? esc(one.p.name) : `${players.length} players`}</b><div class="m">${one ? esc(one.p.school || "") : "Add the selected players"}</div></div><button class="tbx" data-x aria-label="Close">✕</button></div>
      <div class="tbseg"><button data-scope="me" class="${scope === "me" ? "on" : ""}"${M.user ? "" : " disabled title=\"Choose your name (top right) first\""}>${M.user ? `My lists · ${esc(M.user)}` : "My lists"}</button><button data-scope="staff" class="${scope === "staff" ? "on" : ""}">Staff lists</button></div>
      ${M.user ? "" : `<div class="tbnote">Choose your name (top right of the page) to keep your own lists.</div>`}
      <div class="tbsec"><div class="tbl"><span class="label">Targets</span>${one ? `<span class="tbst">${c?.target ? "On targets" : "Not on targets"}</span>` : ""}</div>
        <div class="tbrow">${one && c?.target ? `<button class="fbtn" data-act="untarget">Remove from targets</button>` : `<button class="fbtn go" data-act="target">Add to targets</button>`}</div></div>
      <div class="tbsec"><div class="tbl"><span class="label">Transfer board</span>${one ? `<span class="tbst">${c?.lane ? `${esc(c.lane)} · ${esc(c.tier)}` : "Not on board"}</span>` : ""}</div>
        <div class="tbch">${LANES.map((l) => `<button data-lane="${esc(l)}" class="${lane === l ? "on" : ""}">${esc(l)}</button>`).join("")}</div>
        <div class="tbch t">${TIERS.map((t) => `<button data-tier="${t}" class="${tier === t ? "on" : ""}">${t}</button>`).join("")}</div>
        <div class="tbrow">${one && c?.lane === lane && c?.tier === tier ? `<button class="fbtn" disabled style="opacity:.6;cursor:default">✓ On the board here</button>` : `<button class="fbtn go" data-act="board">${one && c?.lane ? "Move on board" : "Add to board"}</button>`}${one && c?.lane ? `<button class="fbtn" data-act="unboard">Remove from board</button>` : ""}</div></div>
      <div class="tbf"><span class="m" style="color:${/fail|couldn|choose/i.test(msg) ? "var(--bad)" : "var(--muted)"}">${esc(busy ? "Saving…" : msg)}</span><span><a href="/targets">Targets</a><a href="/board">Board</a></span></div>`;
  };
  const place = () => {
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
    pop.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
  };
  const run = async (fn, done) => { busy = true; draw(); try { await fn(); msg = done; } catch (e) { msg = e.message; } busy = false; draw(); onChange?.(); };
  pop.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.x !== undefined) return close();
    if (b.dataset.scope) { scope = b.dataset.scope; setScope(scope); lane = tier = null; pick(); msg = ""; draw(); return; }
    if (b.dataset.lane) { lane = b.dataset.lane; draw(); return; }
    if (b.dataset.tier) { tier = b.dataset.tier; draw(); return; }
    const a = b.dataset.act, where = scope === "me" ? "your" : "the staff";
    if (a === "target") run(() => Promise.all(players.map((x) => tbCall(scope, { op: "set", id: x.id, p: x.p, target: true }))), `Added to ${where} targets.`);
    if (a === "untarget") run(() => tbCall(scope, { op: "set", id: one.id, target: false }), `Removed from ${where} targets.`);
    if (a === "board") run(async () => { for (const x of players) await tbCall(scope, { op: "set", id: x.id, p: x.p, lane, tier }); }, `On ${where} board: ${lane} · ${tier}.`);
    if (a === "unboard") run(() => tbCall(scope, { op: "set", id: one.id, lane: null }), `Removed from ${where} board.`);
  });
  const off = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const key = (e) => { if (e.key === "Escape") close(); };
  function close() { pop.remove(); removeEventListener("mousedown", off, true); removeEventListener("keydown", key); }
  draw(); document.body.appendChild(pop); place();
  setTimeout(() => addEventListener("mousedown", off, true)); addEventListener("keydown", key);
}

// Snapshot kept with each entry so lists still render if a player drops out of the data.
export const snapPool = (p) => ({ name: `${p.first_name} ${p.last_name}`, school: p.school || "", pos: p.position || "", ht: p.height || "", cls: p.class_year || "", photo: p.photoUrl || "", logo: p.logo || "" });
