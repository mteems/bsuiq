// Skill score helpers shared by the player page and the Rankings page.
// Every skill score uses the same 1-100 scale and tiers as the DEF score.
import { pc, esc } from "/assets/core.js";

export const TIERS = [["Poor", 0, 20], ["Below", 20, 40], ["Average", 40, 60], ["Solid", 60, 80], ["Plus", 80, 95], ["Elite", 95, 100.01]];
export const tierOf = (s) => TIERS.find(([, lo, hi]) => s >= lo && s < hi)?.[0] ?? "—";
const ord = (n) => { const v = n % 100; return n.toLocaleString() + (v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"); };
export { ord };

// Score ring as inline SVG.
export function ring(score) {
  const r = 58, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, score / 100));
  return `<svg viewBox="0 0 140 140" class="sring"><circle cx="70" cy="70" r="${r}" fill="none" stroke="#2a2c30" stroke-width="12"/>
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="${pc(score)}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 70 70)"/>
    <text x="70" y="76" text-anchor="middle" font-size="34" font-weight="750" fill="#fff" font-family="Inter Tight Variable, system-ui">${score.toFixed(1)}</text>
    <text x="70" y="96" text-anchor="middle" font-size="9.5" fill="#8a8e95" font-family="IBM Plex Mono" letter-spacing="1">OF 100</text></svg>`;
}

export const tierStrip = (score) =>
  `<div class="stiers">${TIERS.map(([n, lo, hi]) => `<div style="background:${pc((lo + Math.min(hi, 100)) / 2)};${score >= lo && score < hi ? "outline:2px solid #fff;outline-offset:1px" : "opacity:.55"}">${n.toUpperCase()}<br>${lo}–${Math.round(Math.min(hi, 100))}</div>`).join("")}</div>`;

// One component row: label · weight · z bar (SD vs group average) · his value.
export function compRow({ label, def, weight, z, value }) {
  const good = weight < 0 ? -z : z, w = Math.min(50, (Math.abs(z) / 3) * 50);
  const col = good >= 0 ? pc(50 + Math.min(45, good * 15)) : pc(50 - Math.min(45, -good * 15));
  return `<div class="scomp"><span${def ? ` data-def="${def}"` : ""}>${esc(label)}</span><span class="m">${weight > 0 ? "" : "−"}${Math.abs(weight)}%</span>
    <div class="z"><s></s><i style="${z >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`};background:${col}"></i></div><span class="v">${value}</span></div>`;
}

// Full panel: title, ring, rank line, tier strip, component rows, footnote.
export function scorePanel({ title, def, version, score, rank, pool, groupLabel, comps, note, link }) {
  return `<div class="panel"><div class="label ptitle"><span><span${def ? ` data-def="${def}"` : ""}>${esc(title)}</span> · ${esc(version)}</span>${link ? `<a href="${link}" style="color:var(--soft)">Rankings →</a>` : ""}</div>
    <div class="sscore">${ring(score)}<div><div class="srank">${ord(rank)} of ${pool.toLocaleString()}</div>
      <span class="stag" style="background:${pc(score)}">${tierOf(score).toUpperCase()}</span>
      <div class="cap" style="margin-top:6px">${groupLabel ? `Compared within ${esc(groupLabel)} · ` : ""}D-I rotation players, 2025-26</div></div></div>
    ${tierStrip(score)}
    <div class="cap" style="margin-top:12px">What moves the score. Bars show standard deviations above or below the group average; % = weight.</div>
    <div style="margin-top:4px">${comps.map(compRow).join("")}</div>
    ${note ? `<div class="cap">${note}</div>` : ""}</div>`;
}

// v1.1 skill cards: one small ring per skill, with rank and tier.
export const SKILL_V11 = [["scoring", "Scoring", "scorescore"], ["playmaking", "Playmaking", "playscore"], ["rebounding", "Rebounding", "rebscore"], ["defense", "Defense", "dscore"]];
export function skillCards(sk) {
  const cards = SKILL_V11.filter(([k]) => sk.s[k]).map(([k, label, def]) => {
    const { score, rank } = sk.s[k];
    return `<div class="skcard"><div class="label"><span data-def="${def}">${label}</span></div>${ring(score)}
      <span class="stag" style="background:${pc(score)}">${tierOf(score).toUpperCase()}</span>
      <div class="srank" style="font-size:13px;margin-top:6px">${rank ? `${ord(rank)} of ${sk.pool.toLocaleString()}` : "No rank (under 200 min)"}</div>
      <a class="cap" href="/rankings#nat/${{ scoring: "sc", playmaking: "pl", rebounding: "rb", defense: "df" }[k]}" style="color:var(--soft)">Rankings →</a></div>`;
  });
  return `<div class="panel"><div class="label ptitle"><span>Skill scores · ${esc(sk.version)}</span><span class="m" style="color:var(--muted)">${esc(sk.team)} · ${sk.min.toLocaleString()} min</span></div>
    <div class="skcards">${cards.join("")}</div>
    ${tierStrip(-1)}
    <div class="cap">From the RStudio skill model. Ranked against ${sk.pool.toLocaleString()} D-I players with 200+ minutes in ${esc(sk.season)}.</div></div>`;
}
