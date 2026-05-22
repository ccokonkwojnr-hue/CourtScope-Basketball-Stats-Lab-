import { GoogleGenAI, Type } from '@google/genai';
import { Fixture, AnalysisResult, Settings } from '../types';

// Initialize the Gemini API client
// We use a getter to ensure it picks up the env var if it changes or is loaded late
const getAi = () => new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '' });

export async function fetchFixturesFromAI(league: string, query: string = '', count: number = 10): Promise<Fixture[]> {
  const ai = getAi();
  
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `Today is ${todayStr}.
  You MUST use the Google Search tool to find the ACTUAL, REAL-LIFE schedule for the ${count} most upcoming basketball matches starting from TODAY (${todayStr}) for the league: ${league}. 
  DO NOT hallucinate or guess the schedule. You must search for the official ${league} schedule for today and the upcoming days.
  ${query ? `Filter by team or keyword: ${query}` : ''}
  If the league is "Other", try to infer the league from the query.
  Normalize team names (e.g. "LA Lakers" -> "Los Angeles Lakers").
  Return ONLY a JSON array of objects with keys: homeTeam, awayTeam, league, dateTime (ISO string or readable format).`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              homeTeam: { type: Type.STRING },
              awayTeam: { type: Type.STRING },
              league: { type: Type.STRING },
              dateTime: { type: Type.STRING },
            },
            required: ['homeTeam', 'awayTeam', 'league', 'dateTime']
          }
        },
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text;
    if (!text) return [];
    
    const data = JSON.parse(text);
    return data.map((item: any) => ({
      id: Math.random().toString(36).substring(2, 9),
      ...item
    }));
  } catch (error: any) {
    const errorString = error instanceof Error ? error.message : JSON.stringify(error);
    if (error?.status === 429 || errorString.includes('429') || errorString.includes('quota') || errorString.includes('RESOURCE_EXHAUSTED')) {
      console.warn("API Quota Exceeded. Falling back to mock data.");
      return getMockFixtures(league);
    }
    console.error("Error fetching fixtures:", error);
    throw new Error(`Could not fetch fixtures for ${league}. Try again.`);
  }
}

function getMockFixtures(league: string): Fixture[] {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const mockData: Record<string, any[]> = {
    'NBA': [
      { homeTeam: '[MOCK] Los Angeles Lakers', awayTeam: '[MOCK] Boston Celtics', league: 'NBA', dateTime: tomorrow.toISOString() },
      { homeTeam: '[MOCK] Golden State Warriors', awayTeam: '[MOCK] Phoenix Suns', league: 'NBA', dateTime: tomorrow.toISOString() },
      { homeTeam: '[MOCK] Miami Heat', awayTeam: '[MOCK] New York Knicks', league: 'NBA', dateTime: tomorrow.toISOString() },
      { homeTeam: '[MOCK] Denver Nuggets', awayTeam: '[MOCK] Dallas Mavericks', league: 'NBA', dateTime: tomorrow.toISOString() },
    ],
    'EuroLeague': [
      { homeTeam: '[MOCK] Real Madrid', awayTeam: '[MOCK] Barcelona', league: 'EuroLeague', dateTime: tomorrow.toISOString() },
      { homeTeam: '[MOCK] Fenerbahce', awayTeam: '[MOCK] Olympiacos', league: 'EuroLeague', dateTime: tomorrow.toISOString() },
    ],
    'NBL': [
      { homeTeam: '[MOCK] Sydney Kings', awayTeam: '[MOCK] Perth Wildcats', league: 'NBL', dateTime: tomorrow.toISOString() },
      { homeTeam: '[MOCK] Melbourne United', awayTeam: '[MOCK] Tasmania JackJumpers', league: 'NBL', dateTime: tomorrow.toISOString() },
    ],
    'WNBA': [
      { homeTeam: '[MOCK] Las Vegas Aces', awayTeam: '[MOCK] New York Liberty', league: 'WNBA', dateTime: tomorrow.toISOString() },
      { homeTeam: '[MOCK] Seattle Storm', awayTeam: '[MOCK] Connecticut Sun', league: 'WNBA', dateTime: tomorrow.toISOString() },
    ],
    'NCAA': [
      { homeTeam: '[MOCK] Duke', awayTeam: '[MOCK] North Carolina', league: 'NCAA', dateTime: tomorrow.toISOString() },
      { homeTeam: '[MOCK] Kansas', awayTeam: '[MOCK] Kentucky', league: 'NCAA', dateTime: tomorrow.toISOString() },
    ]
  };

  const fixtures = mockData[league] || mockData['NBA'];
  return fixtures.map(f => ({
    id: Math.random().toString(36).substring(2, 9),
    ...f
  }));
}

export async function suggestMarketsFromAI(fixture: Fixture | null, context: string): Promise<string[]> {
  const ai = getAi();
  
  const fixtureContext = fixture ? `${fixture.homeTeam} vs ${fixture.awayTeam} (${fixture.league})` : 'Unknown fixture';
  const prompt = `Given the basketball match: ${fixtureContext}
  And additional context: ${context}
  
  Suggest 3 to 5 relevant betting/statistical markets from this list:
  Player Points, Player Rebounds, Player Assists, Player Steals, Player Blocks, Player Turnovers, Team Total Points, First Half Result, Halftime Score, BTTS Quarters, Player Double-Double, Triple-Double, Game Result, Spread, Over/Under.
  
  Return ONLY a JSON array of strings.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (error: any) {
    const errorString = error instanceof Error ? error.message : JSON.stringify(error);
    if (error?.status === 429 || errorString.includes('429') || errorString.includes('quota') || errorString.includes('RESOURCE_EXHAUSTED')) {
      console.warn("API Quota Exceeded. Falling back to mock markets.");
      return ['Player Points', 'Player Rebounds', 'Player Assists', 'Game Result', 'Over/Under'];
    }
    console.error("Error suggesting markets:", error);
    return [];
  }
}

export async function generateAnalysisFromAI(
  fixture: Fixture | null, 
  context: string, 
  markets: string[], 
  settings: Settings
): Promise<AnalysisResult> {
  const ai = getAi();
  
  const fixtureContext = fixture ? `${fixture.homeTeam} vs ${fixture.awayTeam} (${fixture.league} on ${fixture.dateTime})` : 'General Context';
  
  const prompt = `Analyze the following basketball scenario for informational purposes only.
  Match: ${fixtureContext}
  User Context: ${context}
  Markets of Interest: ${markets.join(', ')}
  
  Settings:
  Depth: ${settings.analysisDepth}
  Verbosity: ${settings.analysisVerbosity}
  Experimental Aggressiveness: ${settings.experimentalAggressiveness}
  
  You MUST actively search for real-time context:
  - Player injury reports and DNP statuses
  - Back-to-back game fatigue indicators
  - Load management news for star players
  - Weather (if applicable)
  - Recent Twitter/X discussions, insider beat reporter tweets, fan sentiment
  - Official team news and pre-game press conference quotes
  - Pace stats, defensive ratings, referee tendencies, rest days, recent form (last 5 games)
  
  CRITICAL REQUIREMENT: You MUST ALWAYS include specific "overs" estimates (e.g., estimated total points over/under, or specific player stat overs like points/rebounds/assists) in your analysis and supporting data, regardless of the selected markets.
  
  Output a CORE ANGLE (most statistically supported insight) and an EXPERIMENTAL ANGLE (high-variance alternative).
  Provide supporting data points for each.
  Also list the key context factors you used.
  
  Format as JSON matching the requested schema.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            coreAngle: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                supportingData: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ['title', 'description', 'supportingData']
            },
            experimentalAngle: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                supportingData: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ['title', 'description', 'supportingData']
            },
            contextUsed: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['coreAngle', 'experimentalAngle', 'contextUsed']
        },
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const data = JSON.parse(text);
    
    return {
      fixtureId: fixture?.id || null,
      coreAngle: {
        id: Math.random().toString(36).substring(2, 9),
        type: 'CORE',
        ...data.coreAngle
      },
      experimentalAngle: {
        id: Math.random().toString(36).substring(2, 9),
        type: 'EXPERIMENTAL',
        ...data.experimentalAngle
      },
      contextUsed: data.contextUsed
    };
  } catch (error: any) {
    const errorString = error instanceof Error ? error.message : JSON.stringify(error);
    if (error?.status === 429 || errorString.includes('429') || errorString.includes('quota') || errorString.includes('RESOURCE_EXHAUSTED')) {
      console.warn("API Quota Exceeded. Falling back to mock analysis.");
      return {
        fixtureId: fixture?.id || null,
        coreAngle: {
          id: Math.random().toString(36).substring(2, 9),
          type: 'CORE',
          title: 'Mock Core Angle: Over on Points (Est. 225.5+)',
          description: 'Based on historical data and recent form, this game is expected to be high-scoring, easily clearing the estimated total points over.',
          supportingData: [
            'Both teams rank in the top 5 for pace.',
            'The over has hit in 8 of their last 10 matchups.',
            'Key defensive players are out for both teams.',
            'Overs Estimate: Total points projected at 232, clearing the 225.5 line.'
          ]
        },
        experimentalAngle: {
          id: Math.random().toString(36).substring(2, 9),
          type: 'EXPERIMENTAL',
          title: 'Mock Experimental Angle: Star Player Triple-Double & Points Over',
          description: 'With the starting point guard out, the star forward will handle more playmaking duties while scoring heavily.',
          supportingData: [
            'Averages 8 assists when the starting PG is out.',
            'Opponent allows the most rebounds to forwards.',
            'High usage rate expected in a fast-paced game.',
            'Overs Estimate: Player Points Over 28.5 is highly probable given the usage spike.'
          ]
        },
        contextUsed: [
          'Historical matchup data',
          'Recent injury reports',
          'Pace and defensive ratings'
        ]
      };
    }
    console.error("Error generating analysis:", error);
    throw new Error("Failed to generate analysis. Please try again.");
  }
}
