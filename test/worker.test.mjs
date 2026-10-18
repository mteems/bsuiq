import { test } from "node:test";
import assert from "node:assert/strict";
import { derive, percentileFromQuantiles, seasonPercentiles } from "../src/stats.js";
import { parseGameLog, seasonEndYear } from "../src/worker.js";

test("derive computes TS% and gates 3P%/FT% on volume", () => {
  // Wheeler-Thomas 2025-26: 463 pts, 355 FGA, 134 FTA, 188 3PA
  const d = derive({ gp: 32, mpg: 30.5, ppg: 14.5, apg: 2.8, topg: 1.5, fga: 355, fta: 134, points: 463, three_pa: 188, three_pct: 38.3, ft_pct: 76.9 });
  assert.equal(d.ts.toFixed(1), "55.9");
  assert.equal(d.p3, 38.3);
  assert.equal(d.tpar.toFixed(1), "53.0");
  assert.equal(d.ato.toFixed(2), "1.87");
  const small = derive({ gp: 8, fga: 9, fta: 0, points: 8, three_pa: 6, three_pct: 33.3, ft_pct: 0 });
  assert.equal(small.p3, null);
  assert.equal(small.ft, null);
});

test("percentileFromQuantiles interpolates, flips and handles flat runs", () => {
  const q = Array.from({ length: 21 }, (_, i) => i * 5); // value == percentile
  assert.equal(percentileFromQuantiles(q, 37, 1), 37);
  assert.equal(percentileFromQuantiles(q, 37, -1), 63);
  assert.equal(percentileFromQuantiles(q, -5, 1), 0);
  assert.equal(percentileFromQuantiles(q, 500, 1), 100);
  assert.equal(percentileFromQuantiles(q, null, 1), null);
  const blocks = [0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5, 0.6, 0.7, 0.9, 1.3, 3.3];
  assert.equal(percentileFromQuantiles(blocks, 0, 1), 5); // middle of the 0th-10th run
});

test("seasonPercentiles falls back to the latest pool and says so", () => {
  const q = Array.from({ length: 21 }, (_, i) => i);
  const pool = { "2025-26": Object.fromEntries(["ppg", "pts40", "mpg", "ts", "efg", "p3", "ft", "tpar", "ftr", "rpg", "apg", "ato", "topg", "spg", "bpg"].map((k) => [k, [500, q]])) };
  const r = seasonPercentiles({ season: "2019-20", gp: 30, mpg: 10, ppg: 10 }, pool);
  assert.equal(r.fallback, true);
  assert.equal(r.poolSeason, "2025-26");
  assert.equal(r.metrics.ppg.pct, 50);
  assert.equal(r.metrics.ppg.med, 10);
});

test("parseGameLog maps ESPN columns and home/away scores", () => {
  const g = parseGameLog({
    names: ["minutes", "fieldGoalsMade-fieldGoalsAttempted", "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "freeThrowsMade-freeThrowsAttempted", "totalRebounds", "assists", "steals", "blocks", "turnovers", "fouls", "points"],
    events: { 1: { atVs: "@", gameDate: "2025-11-04T02:00Z", gameResult: "W", homeTeamId: "9", awayTeamId: "68", homeTeamScore: "60", awayTeamScore: "71", team: { id: "68" }, opponent: { id: "9", displayName: "Somebody" } } },
    seasonTypes: [{ categories: [{ type: "event", events: [{ eventId: "1", stats: ["30", "6-12", "2-5", "3-4", "5", "4", "1", "0", "2", "3", "17"] }] }] }],
  });
  assert.deepEqual([g[0].tm, g[0].op, g[0].fgm, g[0].fga, g[0].tpm, g[0].pts, g[0].pf], [71, 60, 6, 12, 2, 17, 3]);
  assert.equal(seasonEndYear("2025-26"), 2026);
  assert.equal(seasonEndYear("1999-00"), 2000);
});
