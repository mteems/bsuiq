// Bronco IQ stat math, shared by the data build script and tests.
// Percentages are 0-100. Percentile pools come from data-src/pool.json as
// 21-point quantile tables (0th, 5th, ... 100th) per season and metric.

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// Derived per-season metrics from season box-score totals and averages.
export function derive(s) {
  const fga = num(s.fga), fta = num(s.fta), pts = num(s.points), tpa = num(s.three_pa);
  const tsDen = fga !== null && fta !== null ? 2 * (fga + 0.44 * fta) : 0;
  return {
    gp: num(s.gp) || 0,
    mpg: num(s.mpg),
    ppg: num(s.ppg),
    rpg: num(s.rpg),
    apg: num(s.apg),
    spg: num(s.spg),
    bpg: num(s.bpg),
    topg: num(s.topg),
    ts: tsDen > 0 && pts !== null ? (pts / tsDen) * 100 : null,
    efg: num(s.efg_pct),
    fg: num(s.fg_pct),
    p3: tpa >= 40 ? num(s.three_pct) : null,
    ft: fta >= 30 ? num(s.ft_pct) : null,
    tpar: fga > 0 && tpa !== null ? (tpa / fga) * 100 : null,
    ftr: fga > 0 && fta !== null ? (fta / fga) * 100 : null,
    ato: num(s.topg) > 0 && num(s.apg) !== null ? num(s.apg) / num(s.topg) : null,
    pts40: num(s.mpg) > 0 && num(s.ppg) !== null ? (num(s.ppg) / num(s.mpg)) * 40 : null,
  };
}

// dir: 1 = higher is better, -1 = lower is better, 0 = style stat (no good/bad).
export const METRICS = [
  ["ppg", 1], ["pts40", 1], ["mpg", 1], ["ts", 1], ["efg", 1], ["p3", 1], ["ft", 1],
  ["tpar", 0], ["ftr", 1], ["rpg", 1], ["apg", 1], ["ato", 1], ["topg", -1], ["spg", 1], ["bpg", 1],
];

// Percentile of v against a 21-point quantile table q (q[i] = value at the
// 5*i-th percentile). Runs of equal quantiles (e.g. lots of 0.0 blocks) map to
// the middle of the run.
export function percentileFromQuantiles(q, v, dir = 1) {
  if (v === null || v === undefined || !q || q.length !== 21) return null;
  let a = -1, b = q.length;
  for (let i = 0; i < q.length; i++) { if (q[i] < v) a = i; }
  for (let i = q.length - 1; i >= 0; i--) { if (q[i] > v) b = i; }
  let p;
  if (a === -1 && b === 0) p = 0;
  else if (b === q.length && a === q.length - 1) p = 100;
  else if (b - a > 1) p = 5 * ((a + 1) + (b - 1)) / 2;
  else p = 5 * (a + (v - q[a]) / (q[b] - q[a]));
  p = Math.max(0, Math.min(100, p));
  return Math.round(dir === -1 ? 100 - p : p);
}

// Percentiles for one season row. Seasons without a pool use the latest pool
// and say so (fallback: true).
export function seasonPercentiles(stat, pool, latest = "2025-26") {
  let poolSeason = stat.season, fallback = false;
  if (!pool[poolSeason]) { poolSeason = latest; fallback = true; }
  const P = pool[poolSeason], d = derive(stat), metrics = {};
  for (const [k, dir] of METRICS) {
    const [n, q] = P[k] || [0, null];
    metrics[k] = { v: d[k], pct: percentileFromQuantiles(q, d[k], dir), med: q ? q[10] : null, n, dir };
  }
  return { season: stat.season, poolSeason, poolN: P.ppg?.[0] ?? 0, fallback, metrics };
}
