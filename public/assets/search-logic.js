// Player Search logic, carried over from the Recruiting Hub (lib/player-filter-utils.ts and
// app/personnel-board.tsx) so Bronco IQ's Search tab filters, parses and sorts exactly like
// the hub. Only TypeScript types were removed; behavior is unchanged.
export const PLAYER_CLASSES = [
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "Graduate",
];

const TOTAL_STAT_KEYS= {
  ppg: "points",
  rpg: "rebounds",
  apg: "assists",
  spg: "steals",
  bpg: "blocks",
  topg: "turnovers",
};

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchesSearchQuery(
  query,
  fields,
) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!tokens.length) return true;
  const haystack = normalizeSearchText(fields.join(" "));
  return tokens.every((token) => haystack.includes(token));
}

export function heightInches(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;

  const cm = text.match(/(\d{3}(?:\.\d+)?)\s*cm/i);
  if (cm) {
    const centimeters = Number(cm[1]);
    if (centimeters >= 140 && centimeters <= 240) {
      return Math.round(centimeters / 2.54);
    }
  }

  const feetInches = text.match(
    /(\d+)\s*(?:['’′]|-|ft\.?|feet)\s*(\d{1,2})?/i,
  );
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inches = Number(feetInches[2] ?? 0);
    if (feet >= 4 && feet <= 8 && inches >= 0 && inches < 12) {
      return feet * 12 + inches;
    }
  }

  const inchesOnly = text.match(/^(\d{2,3})\s*(?:in|inches|")?$/i);
  if (inchesOnly) {
    const inches = Number(inchesOnly[1]);
    if (inches >= 48 && inches <= 96) return inches;
  }

  return 0;
}

export function classRank(value) {
  const text = normalizeSearchText(value);
  if (!text) return -1;
  if (/\bgrad(?:uate)?\b/.test(text) || /\b5(?:th)? year\b/.test(text) || /\bfifth year\b/.test(text)) return 4;
  if (/\bsenior\b/.test(text) || /\bsr\b/.test(text)) return 3;
  if (/\bjunior\b/.test(text) || /\bjr\b/.test(text)) return 2;
  if (/\bsophomore\b/.test(text) || /\bsoph\b/.test(text)) return 1;
  if (/\bfreshman\b/.test(text) || /\bfresh\b/.test(text)) return 0;
  return -1;
}

export function statFilterValue(
  stats,
  filter,
) {
  if (!stats) return null;
  const key =
    filter.basis === "total"
      ? TOTAL_STAT_KEYS[filter.key] ?? filter.key
      : filter.key;
  const raw = stats[key];
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function passesStatFilter(
  stats,
  filter,
) {
  if (filter.value === null || !Number.isFinite(filter.value)) return true;
  const value = statFilterValue(stats, filter);
  if (value === null) return false;
  return filter.bound === "min" ? value >= filter.value : value <= filter.value;
}

export function createdAtMs(value) {
  const text = String(value ?? "").trim();
  if (!text) return Number.NaN;
  const normalized =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
      ? `${text.replace(" ", "T")}Z`
      : text;
  return Date.parse(normalized);
}

export function isRecentlyAdded(value, now = Date.now(), days = 7) {
  const timestamp = createdAtMs(value);
  return Number.isFinite(timestamp) && timestamp >= now - days * 86400000;
}

export function passesPlayerFilters(
  player,
  stats,
  filters,
  now = Date.now(),
) {
  const height = heightInches(player.height);
  const playerClass = classRank(player.class_year);
  const minClass =
    filters.minClass === "All" ? -1 : classRank(filters.minClass);
  const maxClass =
    filters.maxClass === "All"
      ? Number.POSITIVE_INFINITY
      : classRank(filters.maxClass);

  const selectedTeams = filters.teams ?? [];
  const passesTeam =
    selectedTeams.length > 0
      ? selectedTeams.includes(String(player.school ?? ""))
      : !filters.team ||
        filters.team === "All" ||
        player.school === filters.team;

  return (
    matchesSearchQuery(filters.query, [
      player.first_name,
      player.last_name,
      player.school,
      player.conference,
    ]) &&
    (filters.position === "All" || player.position === filters.position) &&
    (filters.minClass === "All" ||
      (playerClass >= 0 && playerClass >= minClass)) &&
    (filters.maxClass === "All" ||
      (playerClass >= 0 && playerClass <= maxClass)) &&
    (filters.conference === "All" ||
      player.conference === filters.conference) &&
    passesTeam &&
    (!filters.minHeight ||
      (height > 0 && height >= Number(filters.minHeight))) &&
    (!filters.maxHeight ||
      (height > 0 && height <= Number(filters.maxHeight))) &&
    (!filters.recentOnly || isRecentlyAdded(player.created_at, now)) &&
    filters.statFilters.every((filter) => passesStatFilter(stats, filter))
  );
}

export const positions = ["G", "W", "F", "B"],
  classes = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"];
export const positionNames= {
  G: "Guards",
  W: "Wings",
  F: "Forwards",
  B: "Bigs",
};
export const statOptions

   = [
  { key: "gp", label: "Games Played", abbr: "GP", basis: "total" },
  { key: "gs", label: "Games Started", abbr: "GS", basis: "total" },
  { key: "ppg", label: "Points", abbr: "PTS", basis: "total" },
  { key: "rpg", label: "Rebounds", abbr: "REB", basis: "total" },
  { key: "apg", label: "Assists", abbr: "AST", basis: "total" },
  { key: "spg", label: "Steals", abbr: "STL", basis: "total" },
  { key: "bpg", label: "Blocks", abbr: "BLK", basis: "total" },
  { key: "topg", label: "Turnovers", abbr: "TO", basis: "total" },
  { key: "fgm", label: "Field Goals Made", abbr: "FGM", basis: "total" },
  { key: "fga", label: "Field Goals Attempted", abbr: "FGA", basis: "total" },
  { key: "three_pm", label: "3-Pointers Made", abbr: "3PM", basis: "total" },
  {
    key: "three_pa",
    label: "3-Pointers Attempted",
    abbr: "3PA",
    basis: "total",
  },
  { key: "ftm", label: "Free Throws Made", abbr: "FTM", basis: "total" },
  { key: "fta", label: "Free Throws Attempted", abbr: "FTA", basis: "total" },
  { key: "mpg", label: "Minutes", abbr: "MIN", basis: "average" },
  { key: "three_pa_pg", label: "3-Point Attempts", abbr: "3PA", basis: "average" },
  { key: "ppg", label: "Points", abbr: "PTS", basis: "average" },
  { key: "rpg", label: "Rebounds", abbr: "REB", basis: "average" },
  { key: "apg", label: "Assists", abbr: "AST", basis: "average" },
  { key: "spg", label: "Steals", abbr: "STL", basis: "average" },
  { key: "bpg", label: "Blocks", abbr: "BLK", basis: "average" },
  { key: "topg", label: "Turnovers", abbr: "TO", basis: "average" },
  {
    key: "fg_pct",
    label: "Field Goal Percentage",
    abbr: "FG%",
    basis: "average",
  },
  {
    key: "two_pct",
    label: "2-Point Percentage",
    abbr: "2P%",
    basis: "average",
  },
  {
    key: "three_pct",
    label: "3-Point Percentage",
    abbr: "3P%",
    basis: "average",
  },
  {
    key: "ft_pct",
    label: "Free Throw Percentage",
    abbr: "FT%",
    basis: "average",
  },
  {
    key: "efg_pct",
    label: "Effective FG Percentage",
    abbr: "eFG%",
    basis: "average",
  },
  {
    key: "usage_pct",
    label: "Usage Percentage",
    abbr: "USG%",
    basis: "average",
  },
];
export function cleanSchoolName(value) {
  return String(value ?? "")
    .replace(/(?:\s|\n|\r)+0(?:\.0+)?\s*$/g, "")
    .trim();
}
export function heightLabel(n) {
  return `${Math.floor(n / 12)}'${n % 12}\"`;
}
export function twoPointPct(stats) {
  const made = Number(stats.fgm ?? 0) - Number(stats.three_pm ?? 0);
  const attempts = Number(stats.fga ?? 0) - Number(stats.three_pa ?? 0);
  return attempts > 0 ? Math.round((made / attempts) * 1000) / 10 : undefined;
}

export const powerFourConferences = ["ACC", "Big Ten", "Big 12", "SEC"];
export const highMajorConferences = ["Pac-12", "SEC", "Big 12", "Big Ten", "ACC", "Big East"];
export const midMajorConferences = ["American", "Mountain West", "WCC", "MVC", "CUSA", "Atlantic 10", "MAC"];
export const lowMajorConferences = [
  "America East",
  "ASUN",
  "Big Sky",
  "Big South",
  "Big West",
  "CAA",
  "Horizon",
  "Ivy League",
  "MAAC",
  "MEAC",
  "NEC",
  "OVC",
  "Patriot",
  "SoCon",
  "Southland",
  "Summit",
  "Sun Belt",
  "SWAC",
  "United Athletic",
];
export const conferenceOptions = [
  ...highMajorConferences,
  ...midMajorConferences,
  ...lowMajorConferences,
];

function parseHeightToken(feet, inches) {
  const f = Number(feet);
  const i = Number(inches);
  return f >= 4 && f <= 8 && i >= 0 && i < 12 ? f * 12 + i : undefined;
}

export function parseNaturalSearch(input)                {
  const text = input.toLowerCase().replace(/[’′]/g, "'");
  const result= {
    excludedClasses: [],
    excludedConferences: [],
    includedConferences: [],
    interpretation: [],
  };

  if (/\b(point guards?|combo guards?|guards?|pgs?|ball handlers?)\b/.test(text)) {
    result.position = "G";
    result.interpretation.push("Position: G");
  } else if (/\b(wings?)\b/.test(text)) {
    result.position = "W";
    result.interpretation.push("Position: W");
  } else if (/\b(forwards?|stretch 4s?|power forwards?)\b/.test(text)) {
    result.position = "F";
    result.interpretation.push("Position: F");
  } else if (/\b(bigs?|centers?|5s|five men|5 men|post players?|stretch bigs?)\b/.test(text)) {
    result.position = "B";
    result.interpretation.push("Position: B");
  }

  const rangeHeight = text.match(/(\d)\s*['-]\s*(\d{1,2})\s*(?:to|through|-)\s*(\d)\s*['-]\s*(\d{1,2})/);
  if (rangeHeight) {
    result.minHeight = parseHeightToken(rangeHeight[1], rangeHeight[2]);
    result.maxHeight = parseHeightToken(rangeHeight[3], rangeHeight[4]);
  } else {
    const overHeight = text.match(/(?:over|above|at least|min(?:imum)?|>=?)\s*(\d)\s*['-]\s*(\d{1,2})/);
    const underHeight = text.match(/(?:under|below|at most|max(?:imum)?|<=?)\s*(\d)\s*['-]\s*(\d{1,2})/);
    if (overHeight) result.minHeight = parseHeightToken(overHeight[1], overHeight[2]);
    if (underHeight) result.maxHeight = parseHeightToken(underHeight[1], underHeight[2]);
  }
  if (result.minHeight) result.interpretation.push(`Min height: ${heightLabel(result.minHeight)}`);
  if (result.maxHeight) result.interpretation.push(`Max height: ${heightLabel(result.maxHeight)}`);

  const statPatterns

     = [
    { regex: /(?:shot|shoot(?:ing)?|3p%|three[- ]point(?: percentage)?)\s*(?:of|at|over|above|>=?)?\s*(\d+(?:\.\d+)?)\s*%/, key: "minThreePct", label: "3P%" },
    { regex: /(?:more than|over|above|at least|>=?)\s*(\d+(?:\.\d+)?)\s*(?:3pa|three[- ]point attempts?)(?:\s*\/\s*game|\s*per game)?/, key: "minThreePaPg", label: "3PA/G" },
    { regex: /(?:averag(?:e|ing)|scor(?:e|ed|ing)|over|above|at least|>=?)\s*(\d+(?:\.\d+)?)\+?\s*(?:ppg|points?(?:\s*\/\s*game|\s*per game)?)/, key: "minPpg", label: "PPG" },
    { regex: /(?:averag(?:e|ing)|grab(?:s|bed|bing)?|over|above|at least|>=?)\s*(\d+(?:\.\d+)?)\+?\s*(?:rpg|rebounds?(?:\s*\/\s*game|\s*per game)?)/, key: "minRpg", label: "RPG" },
    { regex: /(?:averag(?:e|ing)|dish(?:es|ed|ing)?|over|above|at least|>=?)\s*(\d+(?:\.\d+)?)\+?\s*(?:apg|assists?(?:\s*\/\s*game|\s*per game)?)/, key: "minApg", label: "APG" },
    { regex: /(?:averag(?:e|ing)|play(?:s|ed|ing)?|over|above|at least|>=?)\s*(\d+(?:\.\d+)?)\+?\s*(?:mpg|minutes?(?:\s*\/\s*game|\s*per game)?)/, key: "minMpg", label: "MPG" },
    { regex: /(?:averag(?:e|ing)|over|above|at least|>=?)?\s*(\d+(?:\.\d+)?)?\s*(?:bpg|blocks?(?:\s*\/\s*game|\s*per game|\s+a game))/, key: "minBpg", label: "BPG" },
    { regex: /(?:over|above|at least|>=?)\s*(\d+(?:\.\d+)?)\s*%?\s*(?:usage|usg)/, key: "minUsage", label: "USG%" },
    { regex: /(?:under|below|at most|<=?)\s*(\d+(?:\.\d+)?)\s*%?\s*(?:usage|usg)/, key: "maxUsage", label: "USG%" },
  ];

  for (const pattern of statPatterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const value =
        pattern.key === "minBpg" && !match[1]
          ? 1
          : Number(match[1]);
      if (!Number.isFinite(value)) continue;
      (result)[pattern.key] = value;
      result.interpretation.push(
        `${pattern.label} ${pattern.key === "maxUsage" ? "≤" : "≥"} ${value}`,
      );
    }
  }

  const usageRange = text.match(/(\d+(?:\.\d+)?)\s*(?:-|to|through)\s*(\d+(?:\.\d+)?)\s*%?\s*(?:usage|usg)/);
  if (usageRange) {
    result.minUsage = Number(usageRange[1]);
    result.maxUsage = Number(usageRange[2]);
    result.interpretation.push(`USG% ${result.minUsage}-${result.maxUsage}`);
  }

  const maxTurnovers = text.match(/(?:under|below|at most|less than)\s*(\d+(?:\.\d+)?)\s*(?:turnovers?|topg|to\/g)/);
  if (maxTurnovers) {
    result.maxTopg = Number(maxTurnovers[1]);
    result.interpretation.push(`TO/G ≤ ${result.maxTopg}`);
  } else if (/\blow turnovers?\b|\blow turnover\b/.test(text)) {
    result.maxTopg = 2;
    result.interpretation.push("TO/G ≤ 2");
  }

  const minTurnovers = text.match(/(?:over|above|at least|more than)\s*(\d+(?:\.\d+)?)\s*(?:turnovers?|topg|to\/g)/);
  if (minTurnovers) {
    result.minTopg = Number(minTurnovers[1]);
    result.interpretation.push(`TO/G ≥ ${result.minTopg}`);
  }

  if (/\bgood shooter\b|\bshooter\b/.test(text) && result.minThreePct === undefined) {
    result.minThreePct = 37;
    result.minThreePaPg = result.minThreePaPg ?? 3;
    result.interpretation.push("Shooter profile: 3P% ≥ 37");
    result.interpretation.push("Shooter volume: 3PA/G ≥ 3");
  }

  if (/outside(?: of)? (?:the )?(?:power ?4|p4)|non[- ](?:power ?4|p4)|exclude (?:the )?(?:power ?4|p4)/.test(text)) {
    result.excludedConferences = powerFourConferences;
    result.interpretation.push("Exclude: ACC, Big Ten, Big 12, SEC");
  }
  if (/\bhigh[- ]major\b|\bhigh major\b/.test(text)) {
    result.includedConferences = highMajorConferences;
    result.interpretation.push("Level: High Major");
  } else if (/\bmid[- ]major\b|\bmidmajor\b/.test(text)) {
    result.includedConferences = midMajorConferences;
    result.interpretation.push("Level: Mid-Major");
  } else if (/\blow[- ]major\b|\blow major\b/.test(text)) {
    result.excludedConferences = [...highMajorConferences, ...midMajorConferences];
    result.interpretation.push("Level: Low Major");
  }

  const conferenceAliases= [
    [/\bbig ten\b|\bb1g\b/, "Big Ten"],
    [/\bbig 12\b|\bb12\b/, "Big 12"],
    [/\bsec\b/, "SEC"],
    [/\bacc\b/, "ACC"],
    [/\bpac[- ]?12\b/, "Pac-12"],
    [/\bmountain west\b|\bmw\b/, "Mountain West"],
    [/\bwcc\b|\bwest coast\b/, "WCC"],
    [/\bbig east\b/, "Big East"],
  ];
  if (!result.excludedConferences.length) {
    const found = conferenceAliases.find(([regex]) => regex.test(text));
    if (found && /\b(in|from|conference|league)\b/.test(text)) {
      result.conference = found[1];
      result.interpretation.push(`Conference: ${found[1]}`);
    }
  }

  const excludedConference = conferenceAliases.find(
    ([regex]) =>
      regex.test(text) &&
      /(?:exclude|not|outside|without|no)\s+(?:the\s+)?/.test(
        text.slice(Math.max(0, text.search(regex) - 18), text.search(regex) + 28),
      ),
  );
  if (excludedConference && !result.excludedConferences.includes(excludedConference[1])) {
    result.excludedConferences.push(excludedConference[1]);
    result.interpretation.push(`Exclude: ${excludedConference[1]}`);
    if (result.conference === excludedConference[1]) result.conference = undefined;
  }

  if (/\bwestern schools?\b|\bwest coast schools?\b|\bwestern leagues?\b/.test(text)) {
    result.includedConferences = [
      "Pac-12",
      "Mountain West",
      "WCC",
      "Big West",
      "United Athletic",
    ];
    result.interpretation.push("Region: Western conferences");
  }

  const classMatch = [
    ["Freshman", /\bfreshmen|freshman\b/],
    ["Sophomore", /\bsophomores?|sophs?\b/],
    ["Junior", /\bjuniors?|jrs?\b/],
    ["Senior", /\bseniors?|srs?\b/],
    ["Graduate", /\bgraduates?|grad students?|grad transfers?\b/],
  ].find(([, regex]) => (regex).test(text));
  if (classMatch) {
    result.minClass = classMatch[0];
    result.maxClass = classMatch[0];
    result.interpretation.push(`Class: ${classMatch[0]}`);
  }

  const excludedClassMatch = [
    ["Freshman", /(?:exclude|not|no)\s+freshmen?|without\s+freshmen?/],
    ["Sophomore", /(?:exclude|not|no)\s+sophomores?|without\s+sophomores?/],
    ["Junior", /(?:exclude|not|no)\s+juniors?|without\s+juniors?/],
    ["Senior", /(?:exclude|not|no)\s+seniors?|without\s+seniors?/],
    ["Graduate", /(?:exclude|not|no)\s+(?:graduates?|grad players?)/],
  ].find(([, regex]) => (regex).test(text));
  if (excludedClassMatch) {
    result.excludedClasses = [excludedClassMatch[0]];
    result.interpretation.push(`Exclude class: ${excludedClassMatch[0]}`);
  }

  const sortPhrases= [
    [/best shooters? first|highest 3p|sort by 3/, "three_pct", "desc", "Sort: 3P% ↓"],
    [/highest scoring|most points|sort by points|sort by ppg/, "ppg", "desc", "Sort: PPG ↓"],
    [/most assists|sort by assists|highest assists/, "apg", "desc", "Sort: APG ↓"],
    [/most rebounds|sort by rebounds|highest rebounds/, "rpg", "desc", "Sort: RPG ↓"],
    [/highest usage|sort by usage/, "usage_pct", "desc", "Sort: USG% ↓"],
    [/lowest turnovers|fewest turnovers/, "topg", "asc", "Sort: TO/G ↑"],
  ];
  const sortPhrase = sortPhrases.find(([regex]) => regex.test(text));
  if (sortPhrase) {
    result.sortKey = sortPhrase[1];
    result.sortDirection = sortPhrase[2];
    result.interpretation.push(sortPhrase[3]);
  }

  if (/\blast year|last season|previous season|2025[-–]26\b/.test(text)) {
    result.interpretation.push("Season: latest completed season");
  }

  return result;
}

export function current(p) {
  return p.seasons[0];
}
export function career(seasons)                     {
  if (!seasons.length) return;
  const gp = seasons.reduce((a, s) => a + s.gp, 0),
    avg = (k) =>
      gp
        ? Math.round(
            (seasons.reduce((a, s) => a + Number(s[k] ?? 0) * s.gp, 0) / gp) *
              10,
          ) / 10
        : 0,
    total = (k) =>
      seasons.reduce((a, s) => a + Number(s[k] ?? 0), 0),
    perGame = (k) =>
      gp ? Math.round((total(k) / gp) * 10) / 10 : 0,
    pct = (m, a) =>
      total(a) ? Math.round((total(m) / total(a)) * 1000) / 10 : 0;
  return {
    player_id: "career",
    season: "Career",
    school: "Career Average",
    gp,
    gs: total("gs"),
    mpg: avg("mpg"),
    ppg: perGame("points"),
    rpg: perGame("rebounds"),
    apg: perGame("assists"),
    spg: perGame("steals"),
    bpg: perGame("blocks"),
    topg: perGame("turnovers"),
    points: total("points"),
    rebounds: total("rebounds"),
    assists: total("assists"),
    steals: total("steals"),
    blocks: total("blocks"),
    turnovers: total("turnovers"),
    fg_pct: pct("fgm", "fga"),
    three_pct: pct("three_pm", "three_pa"),
    two_pct:
      total("fga") - total("three_pa") > 0
        ? Math.round(
            ((total("fgm") - total("three_pm")) /
              (total("fga") - total("three_pa"))) *
              1000,
          ) / 10
        : undefined,
    ft_pct: pct("ftm", "fta"),
    fgm: total("fgm"),
    fga: total("fga"),
    three_pm: total("three_pm"),
    three_pa: total("three_pa"),
    ftm: total("ftm"),
    fta: total("fta"),
    usage_pct: avg("usage_pct"),
    efg_pct: total("fga")
      ? Math.round(
          ((total("fgm") + 0.5 * total("three_pm")) / total("fga")) * 1000,
        ) / 10
      : 0,
  };
}

export const baseSearchColumns = new Set         ([
  "name",
  "position",
  "height",
  "class",
  "season",
  "objective",
  "daor",
]);
export const defaultSearchColumnOrder= [
  "name",
  "position",
  "height",
  "class",
  "season",
  "objective",
  "daor",
  "gp",
  "mpg",
  "ppg",
  "rpg",
  "apg",
  "spg",
  "topg",
  "fg_pct",
  "two_pct",
  "three_pct",
  "ft_pct",
  "efg_pct",
  "usage_pct",
  "sk_sc",
  "sk_pl",
  "sk_rb",
  "sk_df",
];
export const searchColumnWidths= {
  name: "minmax(275px,1.85fr)",
  position: "42px",
  height: "56px",
  class: "72px",
  season: "72px",
  objective: "64px",
  daor: "64px",
  gp: "minmax(43px,.46fr)",
  mpg: "minmax(43px,.46fr)",
  ppg: "minmax(43px,.46fr)",
  rpg: "minmax(43px,.46fr)",
  apg: "minmax(43px,.46fr)",
  spg: "minmax(43px,.46fr)",
  topg: "minmax(43px,.46fr)",
  fg_pct: "minmax(43px,.46fr)",
  two_pct: "minmax(43px,.46fr)",
  three_pct: "minmax(43px,.46fr)",
  ft_pct: "minmax(43px,.46fr)",
  efg_pct: "minmax(43px,.46fr)",
  usage_pct: "minmax(43px,.46fr)",
  sk_sc: "minmax(48px,.5fr)",
  sk_pl: "minmax(48px,.5fr)",
  sk_rb: "minmax(48px,.5fr)",
  sk_df: "minmax(48px,.5fr)",
};
export function loadColumnOrder(
  storageKey,
  defaults,
)      {
  if (typeof window === "undefined") return defaults;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(saved)) return defaults;
    const valid = saved.filter(
      (key)=>
        typeof key === "string" &&
        defaults.includes(key),
    );
    const missing = defaults.filter((key) => !valid.includes(key));
    return [...valid, ...missing];
  } catch {
    return defaults;
  }
}
export function reordered(order, source, target) {
  if (source === target) return order;
  const next = order.filter((key) => key !== source);
  const index = next.indexOf(target);
  if (index < 0) return order;
  next.splice(index, 0, source);
  return next;
}
function resultGridStyle(columnOrder) {
  return {
    gridTemplateColumns: `${columnOrder
      .map((key) => searchColumnWidths[key])
      .join(" ")} 188px`,
  };
}
export const defaultStatColumns= [
  "gp", "mpg", "ppg", "rpg", "apg", "spg", "topg", "fg_pct", "two_pct", "three_pct", "ft_pct", "efg_pct", "sk_sc", "sk_pl", "sk_rb", "sk_df",
];
export const cols= [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "height", label: "Height" },
  { key: "class", label: "Class" },
  { key: "season", label: "Season" },
  { key: "gp", label: "GP" },
  { key: "mpg", label: "MIN" },
  { key: "ppg", label: "PTS" },
  { key: "rpg", label: "REB" },
  { key: "apg", label: "AST" },
  { key: "spg", label: "STL" },
  { key: "topg", label: "TO" },
  { key: "fg_pct", label: "FG%" },
  { key: "two_pct", label: "2P%" },
  { key: "three_pct", label: "3P%" },
  { key: "ft_pct", label: "FT%" },
  { key: "efg_pct", label: "eFG%" },
  { key: "usage_pct", label: "USG%" },
  { key: "sk_sc", label: "SCOR" },
  { key: "sk_pl", label: "PLAY" },
  { key: "sk_rb", label: "RBND" },
  { key: "sk_df", label: "DEF" },
  { label: "" },
];

