/** Curated full team names for end-of-title detection (longest match wins). */

const NBA = [
  'Portland Trail Blazers',
  'Golden State Warriors',
  'Oklahoma City Thunder',
  'Minnesota Timberwolves',
  'New Orleans Pelicans',
  'Los Angeles Lakers',
  'Los Angeles Clippers',
  'Philadelphia 76ers',
  'San Antonio Spurs',
  'Sacramento Kings',
  'Washington Wizards',
  'Charlotte Hornets',
  'Cleveland Cavaliers',
  'Indiana Pacers',
  'Memphis Grizzlies',
  'Milwaukee Bucks',
  'Orlando Magic',
  'Toronto Raptors',
  'Denver Nuggets',
  'Detroit Pistons',
  'Houston Rockets',
  'Miami Heat',
  'Atlanta Hawks',
  'Boston Celtics',
  'Brooklyn Nets',
  'Chicago Bulls',
  'Dallas Mavericks',
  'New York Knicks',
  'Phoenix Suns',
  'Utah Jazz',
];

const MLB = [
  'San Francisco Giants',
  'Los Angeles Dodgers',
  'New York Yankees',
  'St. Louis Cardinals',
  'Tampa Bay Rays',
  'Kansas City Royals',
  'Chicago White Sox',
  'Chicago Cubs',
  'Boston Red Sox',
  'Atlanta Braves',
  'Seattle Mariners',
  'San Diego Padres',
  'New York Mets',
  'Houston Astros',
  'Texas Rangers',
  'Miami Marlins',
  'Oakland Athletics',
  'Cincinnati Reds',
  'Cleveland Guardians',
  'Detroit Tigers',
  'Milwaukee Brewers',
  'Minnesota Twins',
  'Philadelphia Phillies',
  'Pittsburgh Pirates',
  'Washington Nationals',
  'Colorado Rockies',
  'Arizona Diamondbacks',
  'Los Angeles Angels',
  'Baltimore Orioles',
];

const NFL = [
  'Kansas City Chiefs',
  'Green Bay Packers',
  'New England Patriots',
  'Tampa Bay Buccaneers',
  'San Francisco 49ers',
  'New York Giants',
  'New York Jets',
  'Philadelphia Eagles',
  'Washington Commanders',
  'Los Angeles Rams',
  'Los Angeles Chargers',
  'Las Vegas Raiders',
  'Denver Broncos',
  'Seattle Seahawks',
  'Dallas Cowboys',
  'Pittsburgh Steelers',
  'Baltimore Ravens',
  'Buffalo Bills',
  'Miami Dolphins',
];

const NHL = [
  'Tampa Bay Lightning',
  'Vegas Golden Knights',
  'New York Rangers',
  'New York Islanders',
  'Los Angeles Kings',
  'San Jose Sharks',
  'Detroit Red Wings',
  'Chicago Blackhawks',
  'Boston Bruins',
  'Dallas Stars',
  'Colorado Avalanche',
];

const NBA_SET = new Set(NBA.map((s) => s.toLowerCase()));
const MLB_SET = new Set(MLB.map((s) => s.toLowerCase()));
const NFL_SET = new Set(NFL.map((s) => s.toLowerCase()));
const NHL_SET = new Set(NHL.map((s) => s.toLowerCase()));

/** Longest names first so "Los Angeles Lakers" wins over substring collisions. */
export const FULL_TEAM_NAMES_SORTED: readonly string[] = Array.from(new Set([...NBA, ...MLB, ...NFL, ...NHL])).sort(
  (a, b) => b.length - a.length,
);

export function sportForKnownTeam(teamName: string | null | undefined): string | null {
  if (!teamName) return null;
  const k = teamName.trim().toLowerCase();
  if (NBA_SET.has(k)) return 'Basketball';
  if (MLB_SET.has(k)) return 'Baseball';
  if (NFL_SET.has(k)) return 'Football';
  if (NHL_SET.has(k)) return 'Hockey';
  return null;
}

export function inferSportFromTeamSubstring(title: string): string | null {
  const lower = title.toLowerCase();
  for (const team of FULL_TEAM_NAMES_SORTED) {
    if (lower.includes(team.toLowerCase())) return sportForKnownTeam(team);
  }
  return null;
}
