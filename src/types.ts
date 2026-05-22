export interface Fixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  dateTime: string;
}

export interface Angle {
  id: string;
  title: string;
  description: string;
  type: 'CORE' | 'EXPERIMENTAL';
  supportingData: string[];
}

export interface AnalysisResult {
  fixtureId: string | null;
  coreAngle: Angle;
  experimentalAngle: Angle;
  contextUsed: string[];
}

export interface HistoryEntry {
  id: string;
  fixture: Fixture | null;
  matchContext: string;
  selectedMarkets: string[];
  analysis: AnalysisResult | null;
  timestamp: string;
}

export interface SavedAngle extends Angle {
  fixture: Fixture | null;
  savedAt: string;
}

export interface Settings {
  preferredLeagues: string[];
  preferredMarkets: string[];
  analysisDepth: 'Quick' | 'Standard' | 'Deep';
  numFixturesToFetch: number;
  analysisVerbosity: 'Low' | 'Medium' | 'High';
  experimentalAggressiveness: 'Low' | 'Medium' | 'High';
}

export const LEAGUES = [
  "NBA", "EuroLeague", "NBL (Australia)", "Liga ACB (Spain)", 
  "Lega Basket (Italy)", "Pro A (France)", "BSL (Turkey)", 
  "BCL (Basketball Champions League)", "FIBA World Cup Qualifiers", 
  "NCAA (Men's)", "NCAA (Women's)", "WNBA", "G League", "Other"
];

export const MARKETS = [
  "Player Points", "Player Rebounds", "Player Assists", "Player Steals", 
  "Player Blocks", "Player Turnovers", "Team Total Points", "First Half Result", 
  "Halftime Score", "BTTS Quarters", "Player Double-Double", "Triple-Double", 
  "Game Result", "Spread", "Over/Under"
];
