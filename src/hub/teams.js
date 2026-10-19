// Recruiting Hub team branding (app/api/teams/route.ts), types stripped. Same logos and
// 2026-27 conference alignment as the hub. hubTeams(env) reads env.HUB.
import {
  TEAM_BRAND_BY_ALIAS,
  CONFERENCE_LOGO_BY_NAME,
} from "./ncaa-branding-map.js";
import { BASKETBALL_BRANDS } from "./ncaa-basketball-branding.js";

                                          
                                                    

                
                      
                
                     
  

const espnLogo = (id        ) =>
  `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`;

// Stable Commons file redirects for conference marks whose previous hotlinks
// were stale or blocked when rendered in the filter dropdown.
const CONFERENCE_LOGO_FIXES                         = {
  "America East":
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/America_East_Conference_logo_2024.svg",
  "Big West":
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Big_West_Conference_logo_2021.svg",
  MAAC:
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Metro_Atlantic_Athletic_Conference_logo.svg",
  WCC:
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/West_Coast_Conference_logo_2019_with_name.svg",
};

// 2026-27 basketball alignment plus deterministic fixes for schools whose
// current DB/source aliases are stale or collide with a similarly named school.
const TEAM_FIXES                          = {
  // Pac-12
  "boise state": { conference: "Pac-12" },
  "colorado state": { conference: "Pac-12" },
  "fresno state": { conference: "Pac-12" },
  gonzaga: { conference: "Pac-12" },
  "oregon state": { conference: "Pac-12" },
  "san diego state": { conference: "Pac-12" },
  "texas state": { conference: "Pac-12" },
  "utah state": { conference: "Pac-12" },
  "washington state": { conference: "Pac-12" },

  // Mountain West
  "air force": { conference: "Mountain West" },
  "grand canyon": { conference: "Mountain West" },
  hawaii: { conference: "Mountain West" },
  "hawai i": { conference: "Mountain West" },
  nevada: { conference: "Mountain West" },
  "new mexico": { conference: "Mountain West" },
  "san jose state": { conference: "Mountain West" },
  "uc davis": { conference: "Mountain West" },
  unlv: { conference: "Mountain West" },
  utep: { conference: "Mountain West" },
  wyoming: { conference: "Mountain West" },

  // 2026-27 changes
  "abilene christian": { conference: "United Athletic" },
  "austin peay": { conference: "United Athletic" },
  "central arkansas": { conference: "United Athletic" },
  "eastern kentucky": { conference: "United Athletic" },
  "little rock": { conference: "United Athletic" },
  "north alabama": { conference: "United Athletic" },
  "tarleton state": { conference: "United Athletic" },
  "ut arlington": { conference: "United Athletic" },
  "texas arlington": { conference: "United Athletic" },
  "west georgia": { conference: "United Athletic" },
  "california baptist": { conference: "Big West" },
  denver: { conference: "WCC" },
  "louisiana tech": { conference: "Sun Belt" },
  "northern illinois": { conference: "Horizon" },
  "sacramento state": { conference: "Big West" },
  "southern utah": { conference: "Big Sky" },
  "tennessee tech": { conference: "SoCon" },
  "utah tech": { conference: "Big Sky", logo: espnLogo(3101) },
  "utah valley": { conference: "Big West" },
  "west florida": { conference: "ASUN", logo: espnLogo(2697) },

  // Recent realignment that older branding sources commonly miss
  california: { conference: "ACC" },
  stanford: { conference: "ACC" },
  smu: { conference: "ACC" },
  oregon: { conference: "Big Ten" },
  ucla: { conference: "Big Ten" },
  usc: { conference: "Big Ten" },
  "southern california": { conference: "Big Ten" },
  washington: { conference: "Big Ten" },
  arizona: { conference: "Big 12" },
  "arizona state": { conference: "Big 12" },
  colorado: { conference: "Big 12" },
  utah: { conference: "Big 12" },
  byu: { conference: "Big 12" },
  cincinnati: { conference: "Big 12" },
  houston: { conference: "Big 12" },
  ucf: { conference: "Big 12" },
  oklahoma: { conference: "SEC" },
  texas: { conference: "SEC" },
  uic: { conference: "MVC" },
  "illinois chicago": { conference: "MVC" },
  belmont: { conference: "MVC" },
  "murray state": { conference: "MVC" },
  "sam houston": { conference: "CUSA" },
  "sam houston state": { conference: "CUSA" },
  "jacksonville state": { conference: "CUSA" },
  liberty: { conference: "CUSA" },
  "new mexico state": { conference: "CUSA" },
  "kennesaw state": { conference: "CUSA" },
  "middle tennessee": { conference: "CUSA" },
  "western kentucky": { conference: "CUSA" },
  "florida international": { conference: "CUSA" },
  fiu: { conference: "CUSA" },
  delaware: { conference: "CUSA" },
  "missouri state": { conference: "CUSA" },
  "loyola chicago": { conference: "Atlantic 10" },
  "st thomas": { conference: "Summit" },
  "st thomas mn": { conference: "Summit" },
  "st thomas minnesota": { conference: "Summit" },
  omaha: { conference: "Summit" },
  "nebraska omaha": { conference: "Summit" },
  "kansas city": { conference: "Summit" },
  "massachusetts": { conference: "MAC" },
  umass: { conference: "MAC" },
  "new haven": { conference: "NEC" },
  "seattle": { conference: "WCC" },
  "seattle u": { conference: "WCC" },
  "ut rio grande valley": { conference: "Southland" },
  utrgv: { conference: "Southland" },
  "stephen f austin": { conference: "Southland" },
  merrimack: { conference: "MAAC" },
  "sacred heart": { conference: "MAAC" },

  // Schools exposed as wrong in deployed /api/teams audits
  "boston university": { conference: "Patriot", logo: espnLogo(104) },
  bryant: { conference: "America East" },
  charleston: { conference: "CAA", logo: espnLogo(232) },
  "charleston southern": { conference: "Big South", logo: espnLogo(2127) },
  charlotte: { conference: "American" },
  "chicago state": { conference: "NEC" },
  "central connecticut": { conference: "NEC" },
  "delaware state": { conference: "MEAC" },
  "east texas a and m": { conference: "Southland" },
  "florida atlantic": { conference: "American" },
  "florida gulf coast": { conference: "ASUN", logo: espnLogo(526) },
  "houston christian": { conference: "Southland" },
  "james madison": { conference: "Sun Belt" },
  "le moyne": { conference: "NEC", logo: espnLogo(2330) },
  "lsu new orleans": { conference: "Southland" },
  lsu: { conference: "SEC" },
  marshall: { conference: "Sun Belt" },
  "maryland eastern shore": { conference: "MEAC", logo: espnLogo(2379) },
  mercyhurst: { conference: "NEC" },
  "miami oh": { conference: "MAC", logo: espnLogo(193) },
  miami: { conference: "ACC" },
  missouri: { conference: "SEC" },
  monmouth: { conference: "CAA" },
  "north texas": { conference: "American" },
  "saint mary s": { conference: "WCC", logo: espnLogo(2608) },
  "st john s": { conference: "Big East", logo: espnLogo(2599) },
  stonehill: { conference: "NEC" },
  tcu: { conference: "Big 12" },
  uab: { conference: "American" },
  ualbany: { conference: "America East" },
  "unc wilmington": { conference: "CAA", logo: espnLogo(350) },
  vcu: { conference: "Atlantic 10", logo: espnLogo(2670) },
  vmi: { conference: "SoCon" },
  "western illinois": { conference: "OVC" },
};

const CONFERENCE_NAME_ALIASES                         = {
  "Atlantic Coast": "ACC",
  ACC: "ACC",
  "Big Ten": "Big Ten",
  "Big 12": "Big 12",
  SEC: "SEC",
  "Big East": "Big East",
  "American Athletic": "American",
  AAC: "American",
  American: "American",
  "Mountain West": "Mountain West",
  MWC: "Mountain West",
  WCC: "WCC",
  "West Coast": "WCC",
  "Missouri Valley": "MVC",
  MVC: "MVC",
  "Conference USA": "CUSA",
  "C-USA": "CUSA",
  CUSA: "CUSA",
  "Atlantic 10": "Atlantic 10",
  "A-10": "Atlantic 10",
  MAC: "MAC",
  "Mid-American": "MAC",
  Ivy: "Ivy League",
  "Ivy League": "Ivy League",
  "Summit League": "Summit",
  Summit: "Summit",
  Sunbelt: "Sun Belt",
  "Sun Belt": "Sun Belt",
  "A-Sun": "ASUN",
  ASUN: "ASUN",
  Colonial: "CAA",
  CAA: "CAA",
  WAC: "United Athletic",
  "Western Athletic": "United Athletic",
  UAC: "United Athletic",
  "United Athletic": "United Athletic",
};

const CONFERENCE_OPTIONS = [
  "Pac-12","SEC","Big 12","Big Ten","ACC","Big East",
  "American","Mountain West","WCC","MVC","CUSA","Atlantic 10","MAC",
  "America East","ASUN","Big Sky","Big South","Big West","CAA","Horizon",
  "Ivy League","MAAC","MEAC","NEC","OVC","Patriot","SoCon","Southland",
  "Summit","Sun Belt","SWAC","United Athletic",
];

function normalize(value         ) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(university|college|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIdentity(value         ) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedConference(value        ) {
  const raw = String(value ?? "").trim();
  return CONFERENCE_NAME_ALIASES[raw] ?? raw;
}

const NORMALIZED_TEAM_BRANDS = (() => {
  const index = new Map                          ();
  const add = (key        , brand           ) => {
    const normalized = normalize(key);
    if (!normalized) return;
    const existing = index.get(normalized);
    if (existing === undefined) index.set(normalized, brand);
    else if (existing && (existing.n !== brand.n || existing.l !== brand.l)) {
      index.set(normalized, null);
    }
  };
  for (const [alias, brand] of Object.entries(TEAM_BRAND_BY_ALIAS)) {
    add(alias, brand);
    add(brand.n, brand);
  }
  return index;
})();

const LEGACY_PREFIX_ENTRIES = [...NORMALIZED_TEAM_BRANDS.entries()]
  .filter((entry)                               => Boolean(entry[1]?.l) && entry[0].length >= 4)
  .sort((a, b) => b[0].length - a[0].length);

const RICH_BRAND_ENTRIES = (() => {
  const entries                                           = [];
  for (const brand of BASKETBALL_BRANDS) {
    for (const alias of [brand.n, ...(brand.a ?? [])]) {
      const key = normalize(alias);
      if (key) entries.push({ key, brand });
    }
  }
  return entries.sort((a, b) => b.key.length - a.key.length);
})();

const SCHOOL_ALIAS_OVERRIDES                           = {
  "app state": ["appalachian state", "app state"],
  "east texas a and m": ["texas a and m commerce", "east texas a and m"],
  "houston christian": ["houston baptist", "houston christian"],
  "iu indianapolis": ["iupui", "iu indianapolis"],
  "kansas city": ["umkc", "kansas city"],
  "long island": ["liu", "long island"],
  "se louisiana": ["southeastern louisiana", "se louisiana"],
  "st thomas": ["st thomas mn", "st thomas minnesota"],
  ualbany: ["albany", "ualbany"],
  uconn: ["connecticut", "uconn"],
  uic: ["illinois chicago", "uic"],
  "ul monroe": ["louisiana monroe", "ul monroe"],
  "ut arlington": ["texas arlington", "ut arlington"],
  "ut rio grande valley": ["utrgv", "texas rio grande valley"],
  utsa: ["texas san antonio", "utsa"],
  vcu: ["virginia commonwealth", "vcu"],
};

function schoolVariants(school        ) {
  const base = normalize(school);
  const variants = new Set        ([base]);
  const add = (value        ) => {
    const normalized = normalize(value);
    if (normalized) variants.add(normalized);
  };

  add(base.replace(/\bsaint\b/g, "st"));
  add(base.replace(/\bst\b/g, "saint"));
  add(base.replace(/\bmount\b/g, "mt"));
  add(base.replace(/\bmt\b/g, "mount"));
  add(base.replace(/\bcal state\b/g, "csu"));
  add(base.replace(/\bcsu\b/g, "cal state"));
  add(base.replace(/\bnorth carolina\b/g, "unc"));
  add(base.replace(/\bunc\b/g, "north carolina"));

  for (const [from, aliases] of Object.entries(SCHOOL_ALIAS_OVERRIDES)) {
    if (base === from || base.startsWith(`${from} `)) {
      for (const alias of aliases) add(alias);
    }
  }

  return [...variants];
}

function teamFixFor(school        ) {
  const base = normalizeIdentity(school);
  const entries = Object.entries(TEAM_FIXES)
    .map(([key, fix]) => [normalizeIdentity(key), fix]         )
    .sort((a, b) => b[0].length - a[0].length);
  for (const [key, fix] of entries) {
    if (base === key || base.startsWith(`${key} `)) return fix;
  }
  return undefined;
}

function resolveLegacyBrand(school        ) {
  const variants = schoolVariants(school);
  for (const key of variants) {
    const direct = TEAM_BRAND_BY_ALIAS[key];
    if (direct?.l) return direct;
    const normalized = NORMALIZED_TEAM_BRANDS.get(key);
    if (normalized?.l) return normalized;
  }
  for (const key of variants) {
    const match = LEGACY_PREFIX_ENTRIES.find(([candidate]) =>
      key === candidate || key.startsWith(`${candidate} `),
    );
    if (match?.[1]?.l) return match[1];
  }
  return undefined;
}

function resolveRichBrand(school        ) {
  const variants = schoolVariants(school);
  for (const key of variants) {
    const exact = RICH_BRAND_ENTRIES.find((entry) => entry.key === key);
    if (exact) return exact.brand;
  }
  for (const key of variants) {
    const match = RICH_BRAND_ENTRIES.find((entry) =>
      entry.key.length >= 4 && (key === entry.key || key.startsWith(`${entry.key} `)),
    );
    if (match) return match.brand;
  }
  return undefined;
}

export async function hubTeams(env) {
  try {
    const schoolRows = await env.HUB.prepare(
      "SELECT school, conference FROM players WHERE (recruit_type = 'transfer' OR recruit_type = '') AND school <> '' GROUP BY school, conference ORDER BY school",
    ).all                                        ();

    const teams = schoolRows.results.map((row, index) => {
      const school = String(row.school ?? "").trim();
      const schoolKey = normalize(school);
      const fix = teamFixFor(school);
      const legacyBrand = resolveLegacyBrand(school);
      const richBrand = resolveRichBrand(school);
      const conference =
        fix?.conference ||
        normalizedConference(String(row.conference ?? "").trim()) ||
        normalizedConference(String(richBrand?.c ?? ""));
      const logo = String(fix?.logo || legacyBrand?.l || richBrand?.l || "")
        .replace(/^http:/, "https:");
      const aliases = [...new Set([
        ...(fix?.aliases ?? []),
        legacyBrand?.n,
        richBrand?.n,
        ...(richBrand?.a ?? []),
      ].filter((value)                  => Boolean(value)))];

      return {
        id: `hub-${index}-${schoolKey.replace(/\s+/g, "-")}`,
        name: school,
        shortName: school,
        location: school,
        abbreviation: "",
        conference,
        logo,
        aliases,
      };
    });

    const discovered = teams.map((team) => team.conference).filter(Boolean);
    const conferences = [...new Set([...CONFERENCE_OPTIONS, ...discovered])].map(
      (name) => ({
        id: `hub-${normalize(name).replace(/\s+/g, "-")}`,
        name,
        abbreviation: name,
        logo: CONFERENCE_LOGO_FIXES[name] ?? CONFERENCE_LOGO_BY_NAME[name] ?? "",
      }),
    );
    const missingLogos = teams.filter((team) => !team.logo).map((team) => team.name);
    const missingConferences = teams
      .filter((team) => !team.conference)
      .map((team) => team.name);

    return Response.json(
      {
        teams,
        conferences,
        count: teams.length,
        missingLogoCount: missingLogos.length,
        missingLogos,
        missingConferenceCount: missingConferences.length,
        missingConferences,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Team branding unavailable.",
        teams: [],
        conferences: CONFERENCE_OPTIONS.map((name) => ({
          id: `fallback-${normalize(name).replace(/\s+/g, "-")}`,
          name,
          abbreviation: name,
          logo: CONFERENCE_LOGO_FIXES[name] ?? CONFERENCE_LOGO_BY_NAME[name] ?? "",
        })),
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
}
