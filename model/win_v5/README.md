# Win model v0.5: Win as an individual skill, plus an Overall score

Same model as v0.4 (../win_v4); only the export changed (`export.py`).

- **Win score** measures what a player created himself:
  - **Individual impact.** It drops the model's team term and half of his team's shared BPM level.
  - **Volume.** Playing time is scaled to a standard 31-game schedule, so a long tournament run doesn't add volume.
  - **Effect.** Final Four players (UConn, Illinois, Arizona, Michigan) in the Win top 50 went from 11 to 5. The average team net rating of the top 100 went from +21.6 to +15.1.
- **Overall score.** Half his individual impact per possession compared with players at his position (shrunk toward average for low minutes), half Win. The top-100 position mix is 52% guards, 30% forwards and 18% bigs, against a D-I pool of 57/30/13.
- **Impact / 100** (predictive, includes team context because it carries over) is unchanged and still drives projections and the Roster Builder.
