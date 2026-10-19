#!/usr/bin/env python3
"""Box-score PDF (play-by-play pages) -> the event CSVs scripts/build-pbp-teams.mjs reads.

    python3 scripts/pdf-pbp.py <out dir> <team> <season> <pdf>:<date>:<away>:<home>:<away pts>:<home pts> ...

Handles the two common PDF formats:
  * Sidearm ("1st Half Play By Play", VISITORS left | time | HOME right, "GOOD 3PTR by LAST,FIRST")
  * StatCrew ("Official Basketball Play by Play", time | home | score | away, "13 JONES D 3pt FG ... made")
StatCrew lines are rewritten in Sidearm's grammar so one parser builds every team page.
Writes all_play_by_play.csv, games.csv and scoring_validation.csv into <out dir>.
"""
import csv, json, os, re, subprocess, sys

TIME = re.compile(r"(?<!\S)(\d{1,2}:\d\d|--)(?!\S)")
SIDEARM_START = re.compile(r"^(GOOD|MISS|REBOUND|TURNOVER|STEAL|ASSIST|BLOCK|FOUL|SUB|TIMEOUT|JUMP|TECH)")


def text(pdf):
    return subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout


def segments(line):
    """[(start column, text)] split on runs of 3+ spaces."""
    return [(m.start(), m.group(0).strip()) for m in re.finditer(r"\S(?:.*?\S)?(?=\s{3,}|$)", line)]


# ---------------------------------------------------------------- Sidearm
def sidearm(raw):
    out, period, pend = [], 0, {"away": None, "home": None}
    for line in raw.splitlines():
        if re.search(r"(1st|2nd) Half Play By Play|(\d)(st|nd|rd|th) (Period|OT|Overtime) Play By Play|OT\d? Play By Play", line):
            period += 1; pend = {"away": None, "home": None}; continue
        if period == 0 or not line.strip() or "VISITORS:" in line:
            continue
        t = TIME.search(line)
        if not t:
            for col, s in segments(line):
                side = "away" if col < 40 else "home"
                if SIDEARM_START.match(s): pend[side] = s
                elif out and out[-1]["event_side"] == side: out[-1]["description"] += " " + s
            continue
        left, right = line[: t.start()].strip(), line[t.end():].strip()
        right = re.sub(r"^\d+-\d+\s+(?:[VH]\s*\d+|T)?\s*", "", right).strip()
        score = re.search(r"(\d+)-(\d+)", line[t.end(): t.end() + 20])
        for side, s in (("away", left), ("home", right)):
            if not s and not pend[side]: continue
            if pend[side] and (not s or not SIDEARM_START.match(s)): s = (pend[side] + " " + s).strip(); pend[side] = None
            elif pend[side]: out.append(dict(period=period, clock="--", event_side=side, description=pend[side])); pend[side] = None
            if s: out.append(dict(period=period, clock=t.group(1), event_side=side, description=s, score=score.group(0) if score else ""))
    return out


# ---------------------------------------------------------------- StatCrew
SC = re.compile(r"^(\d+)\s+(.+?)\s+([A-Z])\s+(jumpball|2pt FG|3pt FG|(?:1&1 )?free throw|defensive rebound|offensive rebound|turnover|steal|assist|block|foul|substitution)(.*)$")


def statcrew_desc(s):
    s = re.sub(r"\s+", " ", s).strip()
    if re.match(r"^(offensive|defensive) (dead ball )?rebound", s) or re.match(r"^team ", s, re.I):
        return "REBOUND DEADB by TEAM" if "rebound" in s else None
    m = SC.match(s)
    if not m: return None
    name = f"{m.group(2).strip().upper()},{m.group(3)}"
    act, rest = m.group(4), m.group(5)
    made = " made" in rest or rest.strip().endswith("made") or re.search(r"made\b", rest)
    if act in ("2pt FG", "3pt FG"):
        if act == "3pt FG": typ = "3PTR"
        elif re.search(r"dunk", rest): typ = "DUNK"
        elif re.search(r"tip", rest): typ = "TIPIN"
        elif re.search(r"layup|alleyoop|alley-oop", rest): typ = "LAYUP"
        else: typ = "JUMPER"
        return f"{'GOOD' if made else 'MISS'} {typ} by {name}"
    if act.endswith("free throw"): return f"{'GOOD' if made else 'MISS'} FT by {name}"
    if act == "defensive rebound": return f"REBOUND DEF by {name}"
    if act == "offensive rebound": return f"REBOUND OFF by {name}"
    if act == "turnover": return f"TURNOVER by {name}"
    if act == "steal": return f"STEAL by {name}"
    if act == "assist": return f"ASSIST by {name}"
    if act == "block": return f"BLOCK by {name}"
    if act == "foul":
        if rest.strip().startswith("drawn"): return None
        return f"FOUL{' TECH' if 'technical' in rest else ''} by {name}"
    if act == "substitution": return f"SUB {'IN' if rest.strip().startswith('in') else 'OUT'} by {name}"
    return None


def statcrew(raw, home_left=True):
    out, period, starters_next, pend = [], 0, False, {"away": [], "home": []}
    lines = raw.splitlines()
    for i, line in enumerate(lines):
        pm = re.match(r"^\s*Period (\d+)\s*$", line) or re.match(r"^\s*(OT\d?)\s*$", line)
        if pm: period += 1; continue
        if "Period Starters" in line: starters_next = True; continue
        if period == 0 or not line.strip(): continue
        if starters_next and re.match(r"^\s*Game Time", line): starters_next = False; continue
        if starters_next and not TIME.match(line.strip()):
            segs = segments(line)
            if segs and not re.match(r"^\d", segs[0][1]) and len(segs) >= 5:
                team_label = segs[0][1]
                side = "home" if (home_left and segs is not None and team_label == START_LABEL[0]) else "away"
                for _, s in segs[1:]:
                    m = re.match(r"^(\d+)\s+(.+?)\s+([A-Z])$", s)
                    if m: out.append(dict(period=period, clock="20:00" if period <= 2 else "5:00", event_side=side, description=f"SUB STARTER by {m.group(2).upper()},{m.group(3)}"))
                continue
            if re.match(r"^\s*Game Time", line): starters_next = False
            continue
        if re.match(r"^\s*(Game Time|Official Basketball|Indiana|Butler\s{5,}M/A|\d+/\d+/\d+|20\d\d-\d\d|Officials|Attendance|Game Duration)", line) and not TIME.match(line.strip()):
            continue
        tm = re.match(r"^\s{0,8}(\d{1,2}:\d\d)\s", line + " ")
        body = line[tm.end(1):] if tm else line
        offs = tm.end(1) if tm else 0
        segs = [(c + offs, s) for c, s in segments(body)]
        score = None
        texts = {"home": [], "away": []}
        for col, s in segs:
            if 70 <= col < 105 and re.match(r"^\d+-\d+(\s+\d+)?$|^\d+$", s): score = s; continue
            side = "home" if col < 75 else "away"
            if not home_left: side = "away" if side == "home" else "home"
            texts[side].append(s)
        for side in ("home", "away"):
            s = " ".join(texts[side]).strip()
            if not tm:
                if not s: continue
                if SC.match(s) or re.match(r"^(offensive|defensive) (dead ball )?rebound", s): pend[side].append(s)
                elif pend[side]: pend[side][-1] += " " + s
                elif out and out[-1]["event_side"] == side and out[-1].get("_raw"): out[-1]["_raw"] += " " + s; out[-1]["description"] = statcrew_desc(out[-1]["_raw"]) or out[-1]["description"]
                continue
            items = pend[side] + ([s] if s else [])
            if pend[side] and s and not SC.match(s): items = pend[side][:-1] + [pend[side][-1] + " " + s]
            pend[side] = []
            for it in items:
                d = statcrew_desc(it)
                if d: out.append(dict(period=period, clock=tm.group(1), event_side=side, description=d, _raw=it))
    for e in out: e.pop("_raw", None)
    return out


START_LABEL = [""]


def main():
    out_dir, team, season = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out_dir, exist_ok=True)
    events, games, valid = [], [], []
    for spec in sys.argv[4:]:
        pdf, date, away, home, ap, hp = spec.rsplit(":", 5)
        raw = text(pdf)
        if "Official Basketball Play by Play" in raw:
            START_LABEL[0] = home if home in raw else home.split()[0]
            # StatCrew prints the home team in the left column.
            ev = statcrew(raw, home_left=True)
        else:
            ev = sidearm(raw)
        gid = f"{team.lower().replace(' ', '_')}_{date}"
        pts = {"away": 0, "home": 0}
        for i, e in enumerate(ev):
            d = e["description"]
            m = re.match(r"^GOOD (3PTR|JUMPER|LAYUP|DUNK|TIPIN|2PTR|FT)", d)
            if m: pts[e["event_side"]] += 1 if m.group(1) == "FT" else 3 if m.group(1) == "3PTR" else 2
            events.append(dict(team=team, season=season, game_id=gid, date=date, period=e["period"], sequence=i + 1, clock=e["clock"], event_side=e["event_side"], description=d, away_score_raw="", home_score_raw="", source_url=os.path.basename(pdf), raw_event_json=""))
        ok = pts["away"] == int(ap) and pts["home"] == int(hp)
        games.append(dict(team=team, date=date, game_id=gid, event_count=len(ev), periods=max([e["period"] for e in ev] or [0]), title=f"{away} at {home} (exhibition)", score_summary="", score_rows_json=json.dumps([[away, "", "", ap], [home, "", "", hp]]), source_url=os.path.basename(pdf), raw_file=os.path.basename(pdf)))
        valid.append(dict(game_id=gid, team=team, date=date, pbp_away_points=pts["away"], pbp_home_points=pts["home"], official_away_points=ap, official_home_points=hp, score_reconciles=str(ok)))
        print(f"{date} {away} {ap} at {home} {hp}: {len(ev)} events, play-by-play points {pts['away']}-{pts['home']} {'OK' if ok else 'MISMATCH'}")
    def w(name, rows):
        with open(os.path.join(out_dir, name), "w", newline="") as f:
            wr = csv.DictWriter(f, fieldnames=list(rows[0].keys())); wr.writeheader(); wr.writerows(rows)
    w("all_play_by_play.csv", events); w("games.csv", games); w("scoring_validation.csv", valid)


if __name__ == "__main__":
    main()
