-- Bronco IQ Playmaking score v0 (box score), 2025-26.
-- One pass over season_stats (~11k rows) + players. Run ONCE per data refresh and
-- save the JSON result to data-src/scores/playmaking-2025-26.json (see
-- scripts/import-playmaking.mjs). Keep it to one query: the source database is
-- on the free D1 plan (5M row reads/day, shared with the Recruiting Hub).
--
-- Pool: 2025-26 D-I rotation players (15+ GP, 15+ MPG), compared within their
-- position group (G / F / B = bigs), like the DEF score compares within role.
-- Components (z-scores within group, clipped to ±3), weights:
--   AST/40            30%   creation volume
--   AST/TO            20%   decision quality
--   TOV%              -20%  ball security (lower is better)
--   Assist share      15%   pass-first lean: AST / (FGA + 0.44 FTA + AST + TO)
--   Plays/40          15%   on-ball load:   (FGA + 0.44 FTA + AST + TO) per 40
-- Weighted sum shrunk for minutes (Min% / (Min% + 15)), then ranked against the
-- whole pool: score = 1 + 99 × percentile, one decimal.
WITH base AS (
  SELECT s.player_id AS id, p.first_name || ' ' || p.last_name AS name, s.school,
    CASE WHEN p.position IN ('B', 'C') THEN 'B' WHEN p.position = 'F' THEN 'F' ELSE 'G' END AS grp,
    s.gp, s.mpg, s.assists AS ast, s.turnovers AS tov, s.fga, s.fta,
    s.mpg * s.gp AS mins, (s.fga + 0.44 * s.fta + s.assists + s.turnovers) AS plays
  FROM season_stats s JOIN players p ON p.id = s.player_id
  WHERE s.season = '2025-26' AND s.gp >= 15 AND s.mpg >= 15
),
m AS (
  SELECT *, ast * 40.0 / mins AS a40, ast * 1.0 / plays AS ash, ast * 1.0 / max(tov, 1) AS ato,
    tov * 100.0 / (fga + 0.44 * fta + tov) AS tovr, plays * 40.0 / mins AS load
  FROM base WHERE plays > 0 AND fga + 0.44 * fta + tov > 0
),
st AS (
  SELECT grp, count(*) AS n,
    avg(a40) AS ma, sqrt(max(avg(a40 * a40) - avg(a40) * avg(a40), 1e-9)) AS sa,
    avg(ash) AS ms, sqrt(max(avg(ash * ash) - avg(ash) * avg(ash), 1e-9)) AS ss,
    avg(ato) AS mt, sqrt(max(avg(ato * ato) - avg(ato) * avg(ato), 1e-9)) AS stt,
    avg(tovr) AS mv, sqrt(max(avg(tovr * tovr) - avg(tovr) * avg(tovr), 1e-9)) AS sv,
    avg(load) AS ml, sqrt(max(avg(load * load) - avg(load) * avg(load), 1e-9)) AS sl
  FROM m GROUP BY grp
),
z AS (
  SELECT m.*,
    max(-3, min(3, (a40 - ma) / sa)) AS za, max(-3, min(3, (ash - ms) / ss)) AS zs,
    max(-3, min(3, (ato - mt) / stt)) AS zt, max(-3, min(3, (tovr - mv) / sv)) AS zv,
    max(-3, min(3, (load - ml) / sl)) AS zl
  FROM m JOIN st USING (grp)
),
r AS (
  SELECT *, (0.30 * za + 0.15 * zs + 0.20 * zt - 0.20 * zv + 0.15 * zl) * ((mpg * 2.5) / (mpg * 2.5 + 15)) AS adj FROM z
),
ranked AS (
  SELECT *, round(1 + 99 * percent_rank() OVER (ORDER BY adj), 1) AS score,
    row_number() OVER (ORDER BY adj DESC) AS rk, count(*) OVER () AS n
  FROM r
)
SELECT
  (SELECT json_group_array(json_array(grp, n, round(ma, 2), round(ms * 100, 1), round(mt, 2), round(mv, 1), round(ml, 1))) FROM st) AS groups,
  max(n) AS n,
  json_group_array(json_array(id, name, school, grp, gp, round(mpg, 1), score, rk,
    round(a40, 2), round(ash * 100, 1), round(ato, 2), round(tovr, 1), round(load, 1),
    round(za, 2), round(zs, 2), round(zt, 2), round(zv, 2), round(zl, 2))) AS rows
FROM ranked
WHERE rk <= 25
   OR school IN ('Air Force', 'Boise State', 'Colorado State', 'Fresno State', 'Nevada', 'New Mexico', 'San Diego State',
                 'San José State', 'San Jose State', 'UNLV', 'Utah State', 'Wyoming', 'Grand Canyon')
   OR id IN ('espn-5185444', 'espn-5191013', 'espn-5241229', 'espn-5313903', 'espn-5240935', 'espn-5117627', 'espn-4873196',
             'espn-5313902', 'espn-5252550', 'espn-5105792', 'espn-5242812', 'espn-5106284', 'espn-5107273');
