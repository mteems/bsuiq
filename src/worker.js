import { hubTeams } from "./hub/teams.js";
// Bronco IQ 2.0 Worker: staff sign-in, ESPN game-log proxy, and the static site
// in ./public (pages + data/*.json). No database yet: during the formatting
// phase the data ships as static JSON built by scripts/build-data.mjs.
//
// Secrets (Cloudflare dashboard → Settings → Variables and secrets):
//   STAFF_PASSWORD   shared staff password (phase 1; per-user accounts come
//                    with Bronco IQ's own database)
//   SESSION_SECRET   long random string used to sign session cookies
// Without both, every page shows a setup notice instead of the site.

const COOKIE = "bsuiq_session";
const SESSION_DAYS = 14;
const enc = new TextEncoder();

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(value))));
}

function cookieValue(request, name) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const t = part.trim();
    if (t.startsWith(name + "=")) return t.slice(name.length + 1);
  }
  return "";
}

const safeNext = (v) => (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/login") ? "/" : v);

async function validSession(request, env) {
  const [exp, sig] = cookieValue(request, COOKIE).split(".");
  if (!exp || !sig || !Number.isFinite(Number(exp)) || Date.now() > Number(exp)) return false;
  return safeEqual(sig, await hmac(`staff.${exp}`, env.SESSION_SECRET));
}

async function sessionCookie(request, env) {
  const exp = String(Date.now() + SESSION_DAYS * 86400000);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${exp}.${await hmac(`staff.${exp}`, env.SESSION_SECRET)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

const PAGE_HEAD = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/inter-tight@5/index.css"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5/500.css">
<style>*{box-sizing:border-box;margin:0}body{min-height:100vh;display:grid;place-items:center;background:#16171a;color:#f2f3f4;font-family:'Inter Tight Variable',system-ui,sans-serif;padding:16px}
.w{width:min(380px,100%)}.b{display:flex;align-items:center;gap:12px;margin-bottom:18px}.b img{width:40px;height:40px}.b strong{font-size:17px;font-weight:750;letter-spacing:.02em}
.l{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#8a8e95}.c{background:#1e1f22;border:1px solid #2e3034;border-radius:10px;padding:22px}
h1{font-size:20px;font-weight:700;margin-bottom:4px}p{font-size:13px;color:#8a8e95;margin-bottom:16px;line-height:1.5}code{font-family:'IBM Plex Mono',monospace;color:#d6d8db}label{display:block;margin:12px 0 6px}
input{width:100%;height:42px;background:#26282c;border:1px solid #3a3d42;border-radius:7px;color:#f2f3f4;padding:0 12px;font:inherit;font-size:15px;outline:none}input:focus{border-color:#8a8e95}
button{width:100%;height:42px;margin-top:18px;border:0;border-radius:7px;background:#f2f3f4;color:#16171a;font:inherit;font-weight:700;font-size:14px;cursor:pointer}
.e{background:#2a2226;border:1px solid #4a3036;color:#f0b4bd;border-radius:7px;padding:9px 11px;font-size:12.5px;margin-bottom:12px}</style>`;
const BRAND = `<div class="b"><img alt="" src="https://a.espncdn.com/i/teamlogos/ncaa/500-dark/68.png"><div><strong>BRONCO IQ</strong><div class="l">Boise State MBB · staff only</div></div></div>`;
const html = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

function loginPage(message = "", next = "/") {
  return html(`${PAGE_HEAD}<title>Sign in · Bronco IQ</title></head><body><main class="w">${BRAND}<section class="c"><h1>Sign in</h1><p>Enter the Bronco IQ staff password.</p>${message ? `<div class="e">${esc(message)}</div>` : ""}
<form method="post" action="/login"><input type="hidden" name="next" value="${esc(next)}"><label class="l" for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" autofocus required><button type="submit">Sign in</button></form></section></main></body></html>`);
}

function setupPage() {
  return html(`${PAGE_HEAD}<title>Setup · Bronco IQ</title></head><body><main class="w">${BRAND}<section class="c"><h1>Almost there</h1><p>This deployment needs two secrets before it will serve the site. In the Cloudflare dashboard open the <code>bronco-iq</code> Worker → Settings → Variables and secrets, and add:</p><p><code>STAFF_PASSWORD</code>: the shared staff password<br><code>SESSION_SECRET</code>: any long random string</p><p>Then redeploy (or wait a few seconds) and reload.</p></section></main></body></html>`, 503);
}

// ---------------------------------------------------------------- ESPN game log
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const madeAtt = (v) => { const [m, a] = String(v ?? "").split("-").map((x) => Number.parseFloat(x) || 0); return [m || 0, a || 0]; };

export function seasonEndYear(season) {
  const m = String(season).match(/(\d{4})\s*-\s*(\d{2,4})/);
  if (!m) return Number(season) || 0;
  if (m[2].length === 4) return Number(m[2]);
  const start = Number(m[1]);
  let end = Math.floor(start / 100) * 100 + Number(m[2]);
  if (end < start) end += 100; // e.g. 1999-00
  return end;
}

export function parseGameLog(payload) {
  const names = payload.names || [], events = payload.events || {}, rows = new Map();
  for (const st of payload.seasonTypes || []) for (const cat of st.categories || []) {
    if (cat.type && cat.type !== "event") continue;
    for (const e of cat.events || []) {
      const ev = events[e.eventId];
      if (!ev) continue;
      const s = Object.fromEntries(names.map((n, i) => [n, e.stats?.[i]]));
      const [fgm, fga] = madeAtt(s["fieldGoalsMade-fieldGoalsAttempted"]);
      const [tpm, tpa] = madeAtt(s["threePointFieldGoalsMade-threePointFieldGoalsAttempted"]);
      const [ftm, fta] = madeAtt(s["freeThrowsMade-freeThrowsAttempted"]);
      const home = String(ev.team?.id ?? "") === String(ev.homeTeamId ?? "");
      const f = (k) => Number.parseFloat(s[k]) || 0;
      rows.set(e.eventId, {
        id: e.eventId, date: ev.gameDate || "", opp: ev.opponent?.displayName || ev.opponent?.abbreviation || "Opponent", oppId: ev.opponent?.id || null,
        atVs: ev.atVs || "", result: ev.gameResult || "", tm: num(home ? ev.homeTeamScore : ev.awayTeamScore), op: num(home ? ev.awayTeamScore : ev.homeTeamScore),
        min: f("minutes"), pts: f("points"), reb: f("totalRebounds"), ast: f("assists"), stl: f("steals"), blk: f("blocks"), to: f("turnovers"), pf: f("fouls"),
        fgm, fga, tpm, tpa, ftm, fta,
      });
    }
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function gameLog(espnId, season, ctx) {
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/${espnId}/gamelog?region=us&lang=en&contentorigin=espn&season=${seasonEndYear(season)}`;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(url);
  let res = cache ? await cache.match(key) : null;
  if (!res) {
    const up = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", referer: "https://www.espn.com/" } });
    if (!up.ok) throw new Error(`ESPN ${up.status}`);
    res = new Response(await up.text(), { headers: { "content-type": "application/json", "cache-control": "public, max-age=21600" } });
    if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  }
  return parseGameLog(await res.json());
}

// ---------- ESPN team data (any team, any game incl. non-D-I and exhibitions) ----------
const ESPN_MBB = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";
async function espnCached(url, ctx, ttl) {
  const cache = typeof caches !== "undefined" ? caches.default : null, key = new Request(url);
  let res = cache ? await cache.match(key) : null;
  if (!res) {
    const up = await fetch(url, { headers: { accept: "application/json" } });
    if (!up.ok) throw new Error(`ESPN ${up.status}`);
    res = new Response(await up.text(), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl}` } });
    if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  }
  return res.json();
}
// Schedule: every game with score and opponent (ESPN id, name), completed or not.
export function parseSchedule(j, teamId) {
  return (j.events || []).map((e) => {
    const c = e.competitions?.[0] || {}, me = (c.competitors || []).find((x) => String(x.id) === String(teamId)), op = (c.competitors || []).find((x) => String(x.id) !== String(teamId));
    const sc = (x) => (x?.score == null ? null : +(x.score.value ?? x.score.displayValue ?? x.score));
    return { id: e.id, d: e.date ? new Date(Date.parse(e.date) - 7 * 3600e3).toISOString().slice(0, 10) : "", per: c.status?.period || 2, done: !!c.status?.type?.completed, loc: c.neutralSite ? "N" : me?.homeAway === "home" ? "H" : "A",
      opp: op?.team?.shortDisplayName || op?.team?.displayName || "", oid: +op?.id || 0, pts: sc(me), op: sc(op), type: e.seasonType?.name || "" };
  });
}
// Team box score totals for one game, for both teams.
export function parseBox(j) {
  const out = {};
  for (const t of j.boxscore?.teams || []) {
    const s = {}; for (const x of t.statistics || []) s[x.name] = x.displayValue;
    const pair = (k) => String(s[k] || "").split("-").map(Number);
    const [fgm, fga] = pair("fieldGoalsMade-fieldGoalsAttempted"), [tpm, tpa] = pair("threePointFieldGoalsMade-threePointFieldGoalsAttempted"), [ftm, fta] = pair("freeThrowsMade-freeThrowsAttempted");
    out[t.team?.id] = { fgm, fga, tpm, tpa, ftm, fta, orb: +s.offensiveRebounds || 0, drb: +s.defensiveRebounds || 0, ast: +s.assists || 0, stl: +s.steals || 0, blk: +s.blocks || 0, to: +(s.totalTurnovers ?? s.turnovers) || 0 };
  }
  return out;
}
export function parseRoster(j) {
  const ht = (s) => { const m = String(s || "").match(/(\d+)'\s*(\d+)/); return m ? `${m[1]}-${m[2]}` : ""; };
  return (j.athletes || []).map((a) => ({ id: a.id, name: a.displayName, jersey: a.jersey ?? "", pos: a.position?.abbreviation || "", ht: ht(a.displayHeight), wt: a.weight || null,
    cls: a.experience?.abbreviation || "", home: a.birthPlace?.displayText || [a.birthPlace?.city, a.birthPlace?.state || a.birthPlace?.country].filter(Boolean).join(", ") }));
}
async function espnApi(path, url, ctx) {
  let m;
  if ((m = path.match(/^\/api\/espn\/schedule\/(\d+)$/))) {
    const season = url.searchParams.get("season") || seasonYear();
    const j = await espnCached(`${ESPN_MBB}/teams/${m[1]}/schedule?season=${season}&seasontype=2`, ctx, 3 * 3600);
    return json({ team: j.team?.displayName, season: +season, games: parseSchedule(j, m[1]) });
  }
  if ((m = path.match(/^\/api\/espn\/box\/(\d+)$/))) {
    const j = await espnCached(`${ESPN_MBB}/summary?event=${m[1]}`, ctx, 30 * 86400);
    return json({ teams: parseBox(j), conf: !!j.header?.competitions?.[0]?.conferenceCompetition });
  }
  if ((m = path.match(/^\/api\/espn\/team\/(\d+)$/))) {
    const j = await espnCached(`${ESPN_MBB}/teams/${m[1]}`, ctx, 7 * 86400);
    return json({ name: j.team?.displayName, links: (j.team?.links || []).map((l) => ({ text: l.text, href: l.href, rel: l.rel })) });
  }
  if ((m = path.match(/^\/api\/espn\/roster\/(\d+)$/))) {
    const season = url.searchParams.get("season") || seasonYear();
    const j = await espnCached(`${ESPN_MBB}/teams/${m[1]}/roster?season=${season}`, ctx, 12 * 3600);
    return json({ team: j.team?.displayName, season: +season, players: parseRoster(j) });
  }
  return null;
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } });

// ---------------------------------------------------------------- router
function secure(res, isHtml) {
  const r = new Response(res.body, res);
  r.headers.set("x-robots-tag", "noindex, nofollow");
  r.headers.set("x-frame-options", "SAMEORIGIN");
  r.headers.set("referrer-policy", "same-origin");
  r.headers.set("x-content-type-options", "nosniff");
  if (isHtml) r.headers.set("cache-control", "private, no-store");
  return r;
}

const PAGES = [[/^\/$/, "/"], [/^\/search\/?$/, "/search"], [/^\/player\/(?:p[0-9a-f]{12}|collision_\d{4}_\d+)\/hub\/?$/, "/college"], [/^\/player\/[\w.-]+\/?$/, "/player"], [/^\/scouting\/?$/, "/scouting"], [/^\/rankings\/?$/, "/rankings"], [/^\/international\/?$/, "/international"]];


// ---------- Player Search: links to the Recruiting Hub (read-only) ----------
// Search numbers are ours (public/data/search/players.json). From the hub's D1 (env.HUB,
// read-only, staff-approved) we only take what our pipeline doesn't have: each player's
// ESPN id (headshot, game logs) and the hub's team logos + 2026-27 conferences.
// Bronco IQ only ever runs SELECTs against it. Cached at the edge for 15 minutes.
const HUB_SELECT = (sql) => { if (!/^\s*select\b/i.test(sql)) throw new Error("read-only"); return sql; };
async function hubAll(env, sql, ...binds) {
  const r = await env.HUB.prepare(HUB_SELECT(sql)).bind(...binds).all();
  return r.results || [];
}
async function hubLinkData(env) {
  const [tj, players] = await Promise.all([
    hubTeams(env).then((r) => r.json()),
    hubAll(env, `SELECT id, first_name, last_name, school, jersey_number, headshot_key FROM players WHERE id LIKE 'espn-%'`),
  ]);
  return {
    built: new Date().toISOString(),
    teams: (tj.teams || []).map((t) => [t.name, t.conference || "", t.logo || "", t.aliases || []]),
    confs: (tj.conferences || []).map((c) => [c.name, c.logo || ""]),
    players: players.map((p) => [p.id.slice(5), p.first_name, p.last_name, String(p.school || "").replace(/(?:\s|\n|\r)+0(?:\.0+)?\s*$/g, "").trim(), p.jersey_number || "", p.headshot_key && /^https?:/.test(p.headshot_key) ? 1 : 0]),
  };
}
async function hubLink(request, env, ctx) {
  if (!env.HUB) return json({ error: "hub_not_connected" }, 503);
  const url = new URL(request.url), cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request("https://bsuiq.internal/hub/link?v=1");
  if (cache && url.searchParams.get("refresh") !== "1") { const hit = await cache.match(key); if (hit) return new Response(hit.body, { headers: { "content-type": "application/json", "cache-control": "private, no-store" } }); }
  const body = JSON.stringify(await hubLinkData(env));
  if (cache) ctx.waitUntil(cache.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=900" } })));
  return new Response(body, { headers: { "content-type": "application/json", "cache-control": "private, no-store" } });
}
// Career game logs from ESPN for every season the hub has for this player (max 6).
async function hubGames(espnId, url, ctx) {
  const seasons = (url.searchParams.get("seasons") || "2025-26").split(",").filter((s) => /^\d{4}-\d{2}$/.test(s)).slice(0, 6);
  const out = [], errors = [];
  await Promise.all(seasons.map(async (s) => {
    try { for (const g of await gameLog(espnId, s, ctx)) out.push({ ...g, season: s }); } catch (e) { errors.push(`${s}: ${e.message || e}`); }
  }));
  const seen = new Set();
  const games = out.filter((g) => (seen.has(g.id) ? false : seen.add(g.id))).sort((a, b) => b.date.localeCompare(a.date));
  return json({ games, errors });
}

// Player Search links that ESPN/hub matching can't make on its own, kept in KV ("search:links"):
//   { espn: { <canonical id>: <ESPN athlete id> }, photo: { <canonical id>: <image URL> } }
// Filled by staff tools (the headshot check); GET returns it, POST merges into it.
async function searchLinks(request, env) {
  if (!env.STAFF) return json({ espn: {}, photo: {} });
  const cur = (await env.STAFF.get("search:links", "json")) || { espn: {}, photo: {} };
  if (request.method === "GET") return json(cur);
  if (request.method !== "POST") return json({ error: "method" }, 405);
  let b; try { b = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const ok = (k) => /^[\w-]{3,40}$/.test(k);
  for (const [k, v] of Object.entries(b.espn || {})) if (ok(k) && /^\d{3,12}$/.test(String(v))) cur.espn[k] = String(v);
  for (const [k, v] of Object.entries(b.photo || {})) if (ok(k) && /^https:\/\/[^\s"'<>]{8,400}$/.test(String(v))) cur.photo[k] = String(v);
  for (const k of b.remove || []) { delete cur.espn[k]; delete cur.photo[k]; }
  await env.STAFF.put("search:links", JSON.stringify(cur));
  return json({ espn: Object.keys(cur.espn).length, photo: Object.keys(cur.photo).length });
}
// School roster pages (for players ESPN has no headshot for): returns each roster photo with its
// alt text. Only https pages whose path is a roster page; only image names/URLs come back.
async function scrapeRoster(url) {
  const target = url.searchParams.get("url") || "";
  let u; try { u = new URL(target); } catch { return json({ error: "bad_url" }, 400); }
  if (u.protocol !== "https:" || !/roster/i.test(u.pathname)) return json({ error: "not_a_roster_page" }, 400);
  const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", accept: "text/html" }, redirect: "follow" });
  const html = await r.text(), out = [], seen = new Set();
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0], alt = (tag.match(/\balt="([^"]*)"/i) || [])[1] || "";
    const src = (tag.match(/\b(?:data-src|src)="([^"]+)"/i) || [])[1] || "";
    if (!alt || !src || src.startsWith("data:")) continue;
    let abs; try { abs = new URL(src.replace(/&amp;/g, "&"), r.url).href; } catch { continue; }
    if (seen.has(abs)) continue; seen.add(abs);
    out.push({ alt: alt.replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").trim(), src: abs });
  }
  return json({ status: r.status, final: r.url, images: out.slice(0, 400) });
}


// Shot locations for one player-season from the hub's NCAA shot archive (read-only). The profiles
// are keyed by the NCAA player id that our own pipeline uses (seasons[].src), so no name matching.
async function hubShots(env, url, ctx) {
  if (!env.HUB) return json({ available: false, reason: "hub_not_connected" });
  const season = url.searchParams.get("season") || "", src = url.searchParams.get("src") || "";
  if (!/^\d{4}-\d{2}$/.test(season) || !/^\d{3,12}$/.test(src)) return json({ error: "bad_request" }, 400);
  const cache = typeof caches !== "undefined" ? caches.default : null, key = new Request(`https://bsuiq.internal/hub/shots/${season}/${src}`);
  if (cache) { const hit = await cache.match(key); if (hit) return new Response(hit.body, { headers: { "content-type": "application/json", "cache-control": "private, no-store" } }); }
  const rows = await hubAll(env, `SELECT profile_json FROM ncaa_shot_profiles WHERE dataset_id = (SELECT dataset_id FROM ncaa_shot_datasets WHERE season = ?) AND season = ? AND source_player_id = ? LIMIT 1`, season, season, src);
  let profile = null; try { profile = rows[0] ? JSON.parse(rows[0].profile_json) : null; } catch { profile = null; }
  const body = JSON.stringify(profile ? { available: true, season, profile, coverage: { sourceGames: Object.keys(profile.games || {}).length, recordedAttempts: profile.attempts } } : { available: false, season, reason: "no_source_profile" });
  if (cache) ctx.waitUntil(cache.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" } })));
  return new Response(body, { headers: { "content-type": "application/json", "cache-control": "private, no-store" } });
}
// Staff notes on a player page, shared across the staff. KV "notes:<player id>" = [{ id, author, body, at }].
async function playerNotes(request, env, id) {
  if (!/^[\w-]{3,40}$/.test(id)) return json({ error: "bad_id" }, 400);
  if (!env.STAFF) return json({ notes: [] });
  const key = "notes:" + id, cur = (await env.STAFF.get(key, "json")) || [];
  if (request.method === "GET") return json({ notes: cur });
  if (request.method !== "POST") return json({ error: "method" }, 405);
  let b; try { b = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (b.remove) { const next = cur.filter((n) => n.id !== String(b.remove)); await env.STAFF.put(key, JSON.stringify(next)); return json({ notes: next }); }
  const body = String(b.body || "").trim().slice(0, 4000), author = String(b.author || "Staff").trim().slice(0, 60) || "Staff";
  if (!body) return json({ error: "Write a note first." }, 400);
  const next = [{ id: crypto.randomUUID(), author, body, at: new Date().toISOString() }, ...cur].slice(0, 200);
  await env.STAFF.put(key, JSON.stringify(next));
  return json({ notes: next });
}

// Staff position overrides for depth charts. Stored as one JSON object in KV:
//   { "<teamKey>|<player name>": { slot: "PF", by: "staff", at: "<iso>" } }
// GET returns all overrides; POST { key, slot } sets one (slot null clears it).
export const SLOTS = ["PG", "SG", "SF", "PF", "C"];
async function positionsApi(request, env) {
  if (!env.STAFF) return json({ overrides: {}, note: "storage not configured" });
  const cur = (await env.STAFF.get("positions", "json")) || {};
  if (request.method === "GET") return json({ overrides: cur });
  if (request.method !== "POST") return json({ error: "method" }, 405);
  let body; try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const key = String(body.key || "").slice(0, 120);
  if (!key.includes("|")) return json({ error: "bad_key" }, 400);
  if (body.slot == null || body.slot === "") delete cur[key];
  else if (SLOTS.includes(body.slot)) cur[key] = { slot: body.slot, at: new Date().toISOString() };
  else return json({ error: "bad_slot" }, 400);
  await env.STAFF.put("positions", JSON.stringify(cur));
  return json({ overrides: cur });
}

// ---------- team rankings (T-Rank, EvanMiya), refreshed nightly ----------
// Stored in KV as "ranks:<source>" = { season, updated, list: [team names in rank order] }.
//  - Cron (wrangler.jsonc "triggers") fetches Barttorvik's CSV directly.
//  - EvanMiya has no file to download, so a nightly scheduled task reads its
//    ratings table in a browser and POSTs it here with the RANKS_TOKEN secret.
const RANK_SOURCES = ["torvik", "torvik_prev", "evanmiya", "kenpom"];
const seasonYear = (d = new Date()) => (d.getUTCMonth() >= 6 ? d.getUTCFullYear() + 1 : d.getUTCFullYear());
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, x-ranks-token" };
async function putRanks(env, source, season, list, conf) {
  const clean = list.map((x) => String(x).trim()).filter(Boolean).slice(0, 400);
  if (clean.length < 300) throw new Error(`only ${clean.length} teams`);
  const rec = { season, updated: new Date().toISOString(), list: clean };
  if (Array.isArray(conf) && conf.length === clean.length) rec.conf = conf.map((c) => String(c).slice(0, 12));
  await env.STAFF.put("ranks:" + source, JSON.stringify(rec));
  return clean.length;
}
async function ingestRanks(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  // GET form for sites whose security policy blocks sending data out (EvanMiya):
  // the browser just navigates to ?source=&season=&token=&list=a|b|c
  if (request.method === "GET") {
    const q = new URL(request.url).searchParams;
    if (!env.RANKS_TOKEN || !env.STAFF || !safeEqual(q.get("token") || "", env.RANKS_TOKEN)) return new Response("unauthorized", { status: 401 });
    try {
      if (!RANK_SOURCES.includes(q.get("source"))) throw new Error("bad source");
      const n = await putRanks(env, q.get("source"), +q.get("season") || seasonYear(), (q.get("list") || "").split("|"), q.get("conf") ? q.get("conf").split("|") : null);
      return new Response(`<!doctype html><title>saved</title><body style="font:16px system-ui;background:#16171a;color:#fff;padding:40px">Saved ${n} teams for ${q.get("source")}.</body>`, { headers: { "content-type": "text/html" } });
    } catch (e) { return new Response("error: " + (e.message || e), { status: 400 }); }
  }
  if (request.method !== "POST") return new Response("method", { status: 405, headers: CORS });
  if (!env.RANKS_TOKEN || !env.STAFF || !safeEqual(request.headers.get("x-ranks-token") || "", env.RANKS_TOKEN)) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
  try {
    const b = await request.json();
    if (!RANK_SOURCES.includes(b.source)) throw new Error("bad source");
    const n = await putRanks(env, b.source, +b.season || seasonYear(), b.list || [], b.conf);
    return new Response(JSON.stringify({ ok: true, source: b.source, teams: n }), { headers: { ...CORS, "content-type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 400, headers: { ...CORS, "content-type": "application/json" } }); }
}
async function torvikList(year) {
  const r = await fetch(`https://barttorvik.com/${year}_team_results.csv`, { headers: { "user-agent": "Mozilla/5.0 (Bronco IQ nightly)" } });
  if (!r.ok) throw new Error("torvik " + r.status);
  const rows = (await r.text()).trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((c) => +c[0]).sort((a, b) => +a[0] - +b[0]);
  return { list: rows.map((c) => c[1]), conf: rows.map((c) => c[2]) };
}
// AP Top 25 from ESPN (stored by ESPN team id). Only kept when the poll is for the current season.
async function refreshAP(env) {
  const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings");
  if (!r.ok) throw new Error("espn " + r.status);
  const j = await r.json(), ap = (j.rankings || []).find((x) => /^AP/i.test(x.name || x.shortName || ""));
  if (!ap) throw new Error("no AP poll");
  const season = ap.season?.year || +String(ap.date || "").slice(0, 4);
  if (season !== seasonYear()) { await env.STAFF.delete("ranks:ap"); return "no poll yet for " + seasonYear(); }
  const ids = {}; for (const t of ap.ranks || []) if (t.team?.id) ids[t.team.id] = t.current;
  const others = {}; for (const t of ap.others || []) if (t.team?.id) others[t.team.id] = t.points;
  await env.STAFF.put("ranks:ap", JSON.stringify({ season, updated: new Date().toISOString(), week: ap.headline || ap.shortHeadline || "", ids, others }));
  return Object.keys(ids).length;
}
async function refreshTorvik(env) {
  const y = seasonYear(), out = {};
  for (const [src, yr] of [["torvik", y], ["torvik_prev", y - 1]]) {
    try { const t = await torvikList(yr); out[src] = await putRanks(env, src, yr, t.list, t.conf); } catch (e) { out[src] = String(e.message || e); }
  }
  try { out.ap = await refreshAP(env); } catch (e) { out.ap = String(e.message || e); }
  await env.STAFF.put("ranks:log", JSON.stringify({ at: new Date().toISOString(), out }));
  return out;
}

export default {
  async scheduled(event, env, ctx) { if (env.STAFF) ctx.waitUntil(refreshTorvik(env)); },
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    if (path === "/api/ranks/ingest") return ingestRanks(request, env);
    if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } });
    if (!env.STAFF_PASSWORD || !env.SESSION_SECRET) return setupPage();

    if (path === "/login") {
      if (request.method === "POST") {
        const form = await request.formData();
        const next = safeNext(String(form.get("next") || "/"));
        if (!safeEqual(String(form.get("password") || ""), env.STAFF_PASSWORD)) {
          await new Promise((r) => setTimeout(r, 700));
          return loginPage("That password didn't match.", next);
        }
        return new Response(null, { status: 302, headers: { location: next, "set-cookie": await sessionCookie(request, env) } });
      }
      if (await validSession(request, env)) return Response.redirect(new URL("/", url), 302);
      return loginPage("", safeNext(url.searchParams.get("next") || "/"));
    }
    if (path === "/logout") return new Response(null, { status: 302, headers: { location: "/login", "set-cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } });

    if (!(await validSession(request, env))) {
      if (path.startsWith("/api/") || path.startsWith("/data/")) return json({ error: "unauthorized" }, 401);
      return new Response(null, { status: 302, headers: { location: `/login?next=${encodeURIComponent(path + url.search)}` } });
    }

    const m = path.match(/^\/api\/gamelog\/espn-(\d+)$/);
    if (m) {
      try { return json({ games: await gameLog(m[1], url.searchParams.get("season") || "2025-26", ctx) }); }
      catch (e) { return json({ error: "gamelog_unavailable", detail: String(e.message || e) }, 502); }
    }
    if (path === "/api/hub/link") {
      try { return await hubLink(request, env, ctx); } catch (e) { return json({ error: "hub_unavailable", detail: String(e.message || e) }, 502); }
    }
    const hg = path.match(/^\/api\/hub\/games\/espn-(\d+)$/);
    if (hg) return hubGames(hg[1], url, ctx);
    if (path === "/api/hub/shots") {
      try { return await hubShots(env, url, ctx); } catch (e) { return json({ available: false, reason: "error", detail: String(e.message || e) }, 502); }
    }
    const nt = path.match(/^\/api\/notes\/([\w-]+)$/);
    if (nt) return playerNotes(request, env, nt[1]);
    if (path === "/api/positions") return positionsApi(request, env);
    if (path === "/api/search/links") return searchLinks(request, env);
    if (path === "/api/scrape/roster") return scrapeRoster(url);
    // Raw Torvik team CSVs (barttorvik blocks browsers on this network; the worker can reach it).
    if (path === "/api/torvik/csv") {
      const f = url.searchParams.get("f") || "";
      if (!/^20\d\d_team_results\.csv$/.test(f)) return json({ error: "bad_file" }, 400);
      const r = await fetch(`https://barttorvik.com/${f}`, { headers: { "user-agent": "Mozilla/5.0 (Bronco IQ)" } });
      return new Response(await r.text(), { status: r.status, headers: { "content-type": "text/csv; charset=utf-8" } });
    }
    if (path.startsWith("/api/espn/")) {
      try { const r = await espnApi(path, url, ctx); if (r) return r; } catch (e) { return json({ error: "espn_unavailable", detail: String(e.message || e) }, 502); }
    }
    if (path === "/api/ranks") {
      if (!env.STAFF) return json({});
      if (url.searchParams.get("refresh") === "torvik") await refreshTorvik(env);
      const o = {}; for (const s2 of [...RANK_SOURCES, "ap", "log"]) o[s2] = await env.STAFF.get("ranks:" + s2, "json");
      return json(o);
    }
    if (path.startsWith("/api/")) return json({ error: "not_found" }, 404);

    for (const [re, asset] of PAGES) if (re.test(path)) return secure(await env.ASSETS.fetch(new Request(new URL(asset, url), request)), true);
    const res = await env.ASSETS.fetch(request);
    return secure(res, (res.headers.get("content-type") || "").includes("text/html"));
  },
};
