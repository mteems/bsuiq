# Bismarck State and West Coast Baptist, 2025-26 men's basketball

Retrieved October 19, 2026.

## Coverage
- Bismarck State: PBP for all 28 games on its official 2025-26 schedule. 12,619 event rows.
- West Coast Baptist: PBP for 21 of 27 identified games. 10,686 event rows. This is not a certified complete season schedule; the NCCAA listing omits games found on opponent schedules.
- Total: 49 games, 23,305 event rows. Both teams' events are included for every game.
- Six unresolved West Coast Baptist games appear in coverage.csv. No games or events were fabricated.

## Files
- all_play_by_play.csv: combined events.
- bismarck_state_play_by_play.csv/.json and west_coast_baptist_play_by_play.csv/.json: separate team datasets.
- shots.csv: made/missed field goals AND free throws extracted from PBP, with source shot-type labels. Filter shot_type=free_throw to exclude FTs. No spatial coordinates are available in this extraction.
- games.csv: game identities, source URLs, score tables, period/event counts.
- coverage.csv: retrieved games and unresolved games.
- scoring_validation.csv: event scoring sums versus official final scores.
- raw/: original HTML pages or archived text transcriptions for the retrieved games.
- scripts/: extraction and validation scripts used in this request. These reference intermediate source files in the working session; raw source records are retained here for auditing.

## Validation and limitations
48 of 49 games reconcile by away/home scoring totals. All 28 Bismarck State games reconcile.
West Coast Baptist vs Justice College, January 23: source places BOTH teams' descriptions in its home-play column. Total event points equal 175, matching the official combined score (Justice 94, WCBC 81), but event-side attribution fails. The original side values are preserved. QUARANTINE this game's team attribution, player/team shot splits and lineup analytics until repaired. The game is retained rather than silently dropped.

Scoring reconciliation establishes that scoring events reproduce the finals, not that every substitution, rebound, clock or player identity is correct. Those fields have not undergone a full audit. Do not treat these rows as validated possession or lineup data.

clock='--' is preserved from source for events without timestamps. No invented clock was assigned. sequence preserves source order within each period/game. away_score_raw/home_score_raw preserve source display text and may be blank or contain lead annotations; Weber's structured source uses zero placeholders for many non-scoring events. These are not forward-filled running scores.

Names and descriptions retain source spelling. Shot types are labels, not measured coordinates or exact distance. No corner/wing or catch-and-shoot/off-dribble classification is inferred.
