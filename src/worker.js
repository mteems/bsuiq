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
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/${espnId}/gamelog?season=${seasonEndYear(season)}`;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(url);
  let res = cache ? await cache.match(key) : null;
  if (!res) {
    const up = await fetch(url, { headers: { accept: "application/json" } });
    if (!up.ok) throw new Error(`ESPN ${up.status}`);
    res = new Response(await up.text(), { headers: { "content-type": "application/json", "cache-control": "public, max-age=21600" } });
    if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  }
  return parseGameLog(await res.json());
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

const PAGES = [[/^\/$/, "/"], [/^\/player\/[\w.-]+\/?$/, "/player"], [/^\/scouting\/?$/, "/scouting"], [/^\/rankings\/?$/, "/rankings"]];

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
const RANK_SOURCES = ["torvik", "torvik_prev", "evanmiya"];
const seasonYear = (d = new Date()) => (d.getUTCMonth() >= 6 ? d.getUTCFullYear() + 1 : d.getUTCFullYear());
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, x-ranks-token" };
async function putRanks(env, source, season, list) {
  const clean = list.map((x) => String(x).trim()).filter(Boolean).slice(0, 400);
  if (clean.length < 300) throw new Error(`only ${clean.length} teams`);
  await env.STAFF.put("ranks:" + source, JSON.stringify({ season, updated: new Date().toISOString(), list: clean }));
  return clean.length;
}
async function ingestRanks(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (request.method !== "POST") return new Response("method", { status: 405, headers: CORS });
  if (!env.RANKS_TOKEN || !env.STAFF || !safeEqual(request.headers.get("x-ranks-token") || "", env.RANKS_TOKEN)) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
  try {
    const b = await request.json();
    if (!RANK_SOURCES.includes(b.source)) throw new Error("bad source");
    const n = await putRanks(env, b.source, +b.season || seasonYear(), b.list || []);
    return new Response(JSON.stringify({ ok: true, source: b.source, teams: n }), { headers: { ...CORS, "content-type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 400, headers: { ...CORS, "content-type": "application/json" } }); }
}
async function torvikList(year) {
  const r = await fetch(`https://barttorvik.com/${year}_team_results.csv`, { headers: { "user-agent": "Mozilla/5.0 (Bronco IQ nightly)" } });
  if (!r.ok) throw new Error("torvik " + r.status);
  return (await r.text()).trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((c) => +c[0]).sort((a, b) => +a[0] - +b[0]).map((c) => c[1]);
}
async function refreshTorvik(env) {
  const y = seasonYear(), out = {};
  for (const [src, yr] of [["torvik", y], ["torvik_prev", y - 1]]) {
    try { out[src] = await putRanks(env, src, yr, await torvikList(yr)); } catch (e) { out[src] = String(e.message || e); }
  }
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
    if (path === "/api/positions") return positionsApi(request, env);
    if (path === "/api/ranks") {
      if (!env.STAFF) return json({});
      if (url.searchParams.get("refresh") === "torvik") await refreshTorvik(env);
      const o = {}; for (const s2 of [...RANK_SOURCES, "log"]) o[s2] = await env.STAFF.get("ranks:" + s2, "json");
      return json(o);
    }
    if (path.startsWith("/api/")) return json({ error: "not_found" }, 404);

    for (const [re, asset] of PAGES) if (re.test(path)) return secure(await env.ASSETS.fetch(new Request(new URL(asset, url), request)), true);
    const res = await env.ASSETS.fetch(request);
    return secure(res, (res.headers.get("content-type") || "").includes("text/html"));
  },
};
