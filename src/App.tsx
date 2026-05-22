import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Settings as SettingsIcon, History, Bookmark, 
  ChevronDown, AlertCircle, Loader2, Info, ChevronRight, 
  CheckCircle2, Flame, Zap, RefreshCw, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Fixture, Angle, AnalysisResult, HistoryEntry, 
  SavedAngle, Settings, LEAGUES, MARKETS 
} from './types';
import { fetchFixturesFromAI, suggestMarketsFromAI, generateAnalysisFromAI } from './services/ai';
import { cn } from './lib/utils';
import { format } from 'date-fns';

const DEFAULT_SETTINGS: Settings = {
  preferredLeagues: [],
  preferredMarkets: [],
  analysisDepth: 'Standard',
  numFixturesToFetch: 10,
  analysisVerbosity: 'Medium',
  experimentalAggressiveness: 'Medium',
};

export default function App() {
  // State
  const [fixtures, setFixtures] = useState<Record<string, Fixture[]>>({});
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);
  const [matchContext, setMatchContext] = useState('');
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  
  const [isFetchingFixtures, setIsFetchingFixtures] = useState(false);
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  
  const [isSuggestingMarkets, setIsSuggestingMarkets] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const stored = localStorage.getItem('courtscope_history');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [savedAngles, setSavedAngles] = useState<SavedAngle[]>(() => {
    try {
      const stored = localStorage.getItem('courtscope_saved');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  
  const [guidedMode, setGuidedMode] = useState(false);
  const [creatorMode, setCreatorMode] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const stored = localStorage.getItem('courtscope_settings');
      return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });
  
  // Modals
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  // Save to local storage
  useEffect(() => {
    localStorage.setItem('courtscope_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('courtscope_saved', JSON.stringify(savedAngles));
  }, [savedAngles]);

  useEffect(() => {
    localStorage.setItem('courtscope_settings', JSON.stringify(settings));
  }, [settings]);

  // Handlers
  const handleLeagueClick = async (league: string) => {
    if (selectedLeague === league) {
      setSelectedLeague(null);
      return;
    }
    
    setSelectedLeague(league);
    
    // Always fetch to ensure games are updated
    await fetchFixtures(league);
  };

  const fetchFixtures = async (league: string, query: string = '') => {
    setIsFetchingFixtures(true);
    setFixtureError(null);
    try {
      const data = await fetchFixturesFromAI(league, query, settings.numFixturesToFetch);
      setFixtures(prev => ({
        ...prev,
        [league]: data
      }));
    } catch (err: any) {
      setFixtureError(err.message || `Could not fetch fixtures for ${league}. Try again.`);
    } finally {
      setIsFetchingFixtures(false);
    }
  };

  const handleSearch = () => {
    if (!searchQuery) return;
    const targetLeague = selectedLeague || 'Other';
    fetchFixtures(targetLeague, searchQuery);
  };

  const handleSuggestMarkets = async () => {
    setIsSuggestingMarkets(true);
    setMarketError(null);
    try {
      const suggestions = await suggestMarketsFromAI(selectedFixture, matchContext);
      // Merge with existing, avoiding duplicates
      const newMarkets = [...new Set([...selectedMarkets, ...suggestions])];
      setSelectedMarkets(newMarkets);
    } catch (err: any) {
      console.error(err);
      setMarketError(err.message || 'Failed to suggest markets');
    } finally {
      setIsSuggestingMarkets(false);
    }
  };

  const handleGenerateAnalysis = async () => {
    if (!selectedFixture && !matchContext) return;
    
    setIsGeneratingAnalysis(true);
    setAnalysisError(null);
    try {
      const result = await generateAnalysisFromAI(selectedFixture, matchContext, selectedMarkets, settings);
      setAnalysisResult(result);
      
      // Save to history
      const newEntry: HistoryEntry = {
        id: Math.random().toString(36).substring(2, 9),
        fixture: selectedFixture,
        matchContext,
        selectedMarkets,
        analysis: result,
        timestamp: new Date().toISOString()
      };
      setHistory(prev => [newEntry, ...prev].slice(0, 20));
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || 'Failed to generate analysis');
    } finally {
      setIsGeneratingAnalysis(false);
    }
  };

  const toggleMarket = (market: string) => {
    setSelectedMarkets(prev => 
      prev.includes(market) ? prev.filter(m => m !== market) : [...prev, market]
    );
  };

  const saveAngle = (angle: Angle) => {
    if (savedAngles.some(a => a.id === angle.id)) return;
    const newSaved: SavedAngle = {
      ...angle,
      fixture: selectedFixture,
      savedAt: new Date().toISOString()
    };
    setSavedAngles(prev => [newSaved, ...prev]);
  };

  const removeSavedAngle = (id: string) => {
    setSavedAngles(prev => prev.filter(a => a.id !== id));
  };

  const loadHistoryEntry = (entry: HistoryEntry) => {
    setSelectedFixture(entry.fixture);
    if (entry.fixture?.league) setSelectedLeague(entry.fixture.league);
    setMatchContext(entry.matchContext);
    setSelectedMarkets(entry.selectedMarkets);
    setAnalysisResult(entry.analysis);
    setShowHistory(false);
  };

  // Filtered fixtures based on search
  const displayedFixtures = React.useMemo(() => {
    let list: Fixture[] = [];
    if (selectedLeague) {
      list = fixtures[selectedLeague] || [];
    } else {
      // Show all if no league selected
      Object.values(fixtures).forEach(f => list.push(...f));
    }
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f => 
        f.homeTeam.toLowerCase().includes(q) || 
        f.awayTeam.toLowerCase().includes(q) ||
        f.league.toLowerCase().includes(q)
      );
    }
    return list;
  }, [fixtures, selectedLeague, searchQuery]);

  // Guided Mode Logic
  const getGuideStep = () => {
    if (!guidedMode) return null;
    if (!selectedLeague) return 1;
    if (!selectedFixture) return 2;
    if (selectedMarkets.length === 0) return 3;
    if (!analysisResult) return 4;
    return null;
  };
  const guideStep = getGuideStep();

  return (
    <div className="min-h-screen bg-[#0D1B2A] text-slate-200 font-sans selection:bg-[#E8600A]/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0D1B2A]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E8600A] to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Flame className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white">CourtScope</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 bg-white/5 px-3 py-1.5 rounded-full">
                <Info className="w-4 h-4 shrink-0" />
                <span>CourtScope does not place bets, set odds, or simulate wagering. It provides basketball statistics and analytical angles only.</span>
              </div>
              
              <button 
                onClick={() => setShowSaved(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-white/5 transition-colors text-sm font-medium"
              >
                <Bookmark className="w-4 h-4 text-[#E8600A]" />
                <span className="hidden sm:inline">Saved ({savedAngles.length})</span>
              </button>
              
              <button 
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-white/5 transition-colors text-sm font-medium"
              >
                <History className="w-4 h-4" />
                <span className="hidden sm:inline">History</span>
              </button>
              
              <div className="h-6 w-px bg-white/10 mx-1"></div>
              
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className="relative">
                  <input 
                    type="checkbox" 
                    className="sr-only" 
                    checked={guidedMode}
                    onChange={(e) => setGuidedMode(e.target.checked)}
                  />
                  <div className={cn("block w-10 h-6 rounded-full transition-colors", guidedMode ? "bg-[#E8600A]" : "bg-slate-700")}></div>
                  <div className={cn("absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform", guidedMode ? "translate-x-4" : "")}></div>
                </div>
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors hidden sm:inline">Guided Mode</span>
              </label>
              
              <button 
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-md hover:bg-white/5 transition-colors"
              >
                <SettingsIcon className="w-5 h-5 text-slate-400 hover:text-white" />
              </button>
            </div>
          </div>
          {/* Mobile Disclaimer */}
          <div className="md:hidden py-2 px-4 text-[10px] text-slate-400 text-center border-t border-white/5">
            CourtScope does not place bets, set odds, or simulate wagering. It provides basketball statistics and analytical angles only.
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Fixture & Leagues Section */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-xs font-bold">1</span>
              Fixture & Leagues
            </h2>
            
            <div className="flex w-full sm:w-auto gap-2 relative">
              <div className="relative flex-1 sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Search any team or fixture..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full bg-[#1A293C] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#E8600A]/50 focus:border-[#E8600A]"
                />
              </div>
              <button 
                onClick={handleSearch}
                className="p-2 bg-[#1A293C] border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                title="Fetch from AI"
              >
                <Search className="w-5 h-5 text-[#E8600A]" />
              </button>
              
              <div className="relative group">
                <button className="p-2 bg-[#1A293C] border border-white/10 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-1 h-full">
                  <Bookmark className="w-4 h-4 text-slate-400" />
                  <ChevronDown className="w-3 h-3 text-slate-500" />
                </button>
                <div className="absolute right-0 top-full mt-2 w-64 bg-[#0D1B2A] border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                  <div className="p-2 border-b border-white/5">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">Recent Fixtures</h4>
                    {history.slice(0, 3).filter(h => h.fixture).map(h => (
                      <button 
                        key={h.id} 
                        onClick={() => loadHistoryEntry(h)}
                        className="w-full text-left px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5 rounded-md truncate"
                      >
                        {h.fixture?.homeTeam} vs {h.fixture?.awayTeam}
                      </button>
                    ))}
                    {history.filter(h => h.fixture).length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-slate-500">No recent fixtures</div>
                    )}
                  </div>
                  <div className="p-2">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1 flex justify-between">
                      Saved Angles <span>({savedAngles.length})</span>
                    </h4>
                    {savedAngles.slice(0, 3).map(a => (
                      <button 
                        key={a.id}
                        onClick={() => setShowSaved(true)}
                        className="w-full text-left px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5 rounded-md truncate"
                      >
                        {a.title}
                      </button>
                    ))}
                    {savedAngles.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-slate-500">No saved angles</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* League Tabs */}
          <div className="flex flex-wrap gap-2 pb-2 relative">
            <GuideTooltip show={guideStep === 1} text="Step 1: Select a league" position="top" />
            {LEAGUES.map(league => {
              const count = fixtures[league]?.length || 0;
              const isActive = selectedLeague === league;
              return (
                <button
                  key={league}
                  onClick={() => handleLeagueClick(league)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border",
                    isActive 
                      ? "bg-[#E8600A] text-white border-[#E8600A] shadow-lg shadow-orange-500/20" 
                      : "bg-[#1A293C] text-slate-300 border-white/5 hover:bg-white/10 hover:border-white/20"
                  )}
                >
                  {league}
                  {count > 0 && (
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-full text-xs",
                      isActive ? "bg-white/20 text-white" : "bg-white/10 text-slate-400"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Fixtures Display */}
          <div className="bg-[#1A293C] border border-white/5 rounded-xl p-4 min-h-[120px] relative">
            <GuideTooltip show={guideStep === 2} text="Step 2: Pick a fixture" position="top" />
            
            {selectedLeague && (
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-medium text-slate-300">
                  {selectedLeague} Fixtures
                </h3>
                <button 
                  onClick={() => fetchFixtures(selectedLeague)}
                  disabled={isFetchingFixtures}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", isFetchingFixtures && "animate-spin")} />
                  Refresh
                </button>
              </div>
            )}

            {isFetchingFixtures ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="p-4 rounded-lg border border-white/5 bg-[#0D1B2A] animate-pulse">
                    <div className="h-3 w-16 bg-white/10 rounded mb-2"></div>
                    <div className="h-4 w-3/4 bg-white/10 rounded mb-1"></div>
                    <div className="h-3 w-4 bg-white/5 rounded my-1"></div>
                    <div className="h-4 w-3/4 bg-white/10 rounded mb-2"></div>
                    <div className="h-3 w-24 bg-white/5 rounded mt-3"></div>
                  </div>
                ))}
              </div>
            ) : fixtureError ? (
              <div className="flex items-center justify-center h-24 gap-2 text-red-400">
                <AlertCircle className="w-5 h-5" />
                <span>{fixtureError}</span>
                <button onClick={() => selectedLeague && fetchFixtures(selectedLeague)} className="ml-2 underline text-sm">Retry</button>
              </div>
            ) : displayedFixtures.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {displayedFixtures.map(fixture => (
                  <button
                    key={fixture.id}
                    onClick={() => setSelectedFixture(fixture)}
                    className={cn(
                      "text-left p-4 rounded-lg border transition-all",
                      selectedFixture?.id === fixture.id
                        ? "bg-[#E8600A]/10 border-[#E8600A] shadow-[0_0_15px_rgba(232,96,10,0.15)]"
                        : "bg-[#0D1B2A] border-white/5 hover:border-white/20 hover:bg-white/5"
                    )}
                  >
                    <div className="text-xs font-medium text-[#E8600A] mb-1">{fixture.league}</div>
                    <div className="font-semibold text-white truncate">{fixture.homeTeam}</div>
                    <div className="text-xs text-slate-500 my-0.5">vs</div>
                    <div className="font-semibold text-white truncate">{fixture.awayTeam}</div>
                    <div className="text-xs text-slate-400 mt-2">{fixture.dateTime}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-24 text-slate-500 text-sm">
                {searchQuery ? "No local results match." : "Select a league to view fixtures."}
                <button 
                  onClick={handleSearch}
                  className="mt-2 text-[#E8600A] hover:underline flex items-center gap-1"
                >
                  <Search className="w-3 h-3" /> Click to fetch from AI
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Inputs Section */}
        <section className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-xs font-bold">2</span>
              Match Context
            </h2>
            <textarea
              value={matchContext}
              onChange={(e) => setMatchContext(e.target.value)}
              placeholder="e.g. Lakers vs Celtics, NBA, Friday. LeBron is questionable."
              className="w-full h-32 bg-[#1A293C] border border-white/10 rounded-xl p-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#E8600A]/50 focus:border-[#E8600A] resize-none"
            />
          </div>

          <div className="space-y-4 relative">
            <GuideTooltip show={guideStep === 3} text="Step 3: Choose markets" position="top" />
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-xs font-bold">3</span>
                Markets of Interest
              </h2>
              <button 
                onClick={handleSuggestMarkets}
                disabled={isSuggestingMarkets || (!selectedFixture && !matchContext)}
                className="flex items-center gap-1.5 text-xs font-medium text-[#E8600A] hover:text-orange-400 disabled:opacity-50 transition-colors bg-[#E8600A]/10 px-3 py-1.5 rounded-full"
              >
                {isSuggestingMarkets ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Suggest Markets
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {MARKETS.map(market => (
                <button
                  key={market}
                  onClick={() => toggleMarket(market)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                    selectedMarkets.includes(market)
                      ? "bg-white text-[#0D1B2A] border-white"
                      : "bg-[#1A293C] text-slate-300 border-white/10 hover:bg-white/10"
                  )}
                >
                  {market}
                </button>
              ))}
            </div>
            {marketError && (
              <div className="flex items-center gap-2 text-red-400 text-sm mt-2">
                <AlertCircle className="w-4 h-4" />
                <span>{marketError}</span>
              </div>
            )}
          </div>
        </section>

        {/* Generate Button */}
        <div className="flex flex-col items-center justify-center py-4 relative">
          <GuideTooltip show={guideStep === 4} text="Step 4: Generate analysis" position="top" />
          <button
            onClick={handleGenerateAnalysis}
            disabled={isGeneratingAnalysis || (!selectedFixture && !matchContext)}
            className="relative group overflow-hidden rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#E8600A] to-orange-500 transition-transform group-hover:scale-105"></div>
            <div className="relative flex items-center gap-3 px-8 py-4 text-white font-bold text-lg tracking-wide">
              {isGeneratingAnalysis ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Analyzing Real-Time Data...
                </>
              ) : (
                <>
                  <Zap className="w-6 h-6 fill-current" />
                  Generate Analysis
                </>
              )}
            </div>
          </button>
          {analysisError && (
            <div className="flex items-center gap-2 text-red-400 text-sm mt-4 bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20">
              <AlertCircle className="w-4 h-4" />
              <span>{analysisError}</span>
            </div>
          )}
        </div>

        {/* Analysis Workspace */}
        <AnimatePresence mode="wait">
          {analysisResult && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-white flex items-center gap-3 border-b border-white/10 pb-4">
                Analysis & Angle Workspace
                <span className="text-sm font-normal text-slate-400 bg-white/5 px-3 py-1 rounded-full">
                  {selectedFixture ? `${selectedFixture.homeTeam} vs ${selectedFixture.awayTeam}` : 'Custom Context'}
                </span>
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Core Angle */}
                <div className="bg-gradient-to-b from-[#1A293C] to-[#0D1B2A] border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                      <CheckCircle2 className="w-4 h-4" />
                      Core Angle
                    </div>
                    <button 
                      onClick={() => saveAngle(analysisResult.coreAngle)}
                      className="text-slate-400 hover:text-[#E8600A] transition-colors"
                      title="Save Angle"
                    >
                      <Bookmark className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <h3 className="text-xl font-bold text-white mb-3">{analysisResult.coreAngle.title}</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-6">
                    {analysisResult.coreAngle.description}
                  </p>
                  
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Supporting Data</h4>
                    <ul className="space-y-2">
                      {analysisResult.coreAngle.supportingData.map((data, i) => (
                        <li key={i} className="flex gap-3 text-sm text-slate-300">
                          <span className="text-emerald-500 mt-0.5">•</span>
                          <span>{data}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Experimental Angle */}
                <div className="bg-gradient-to-b from-[#1A293C] to-[#0D1B2A] border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-purple-500"></div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs font-bold uppercase tracking-wider">
                      <Flame className="w-4 h-4" />
                      Experimental Angle
                    </div>
                    <button 
                      onClick={() => saveAngle(analysisResult.experimentalAngle)}
                      className="text-slate-400 hover:text-[#E8600A] transition-colors"
                      title="Save Angle"
                    >
                      <Bookmark className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <h3 className="text-xl font-bold text-white mb-3">{analysisResult.experimentalAngle.title}</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-6">
                    {analysisResult.experimentalAngle.description}
                  </p>
                  
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Supporting Data</h4>
                    <ul className="space-y-2">
                      {analysisResult.experimentalAngle.supportingData.map((data, i) => (
                        <li key={i} className="flex gap-3 text-sm text-slate-300">
                          <span className="text-purple-500 mt-0.5">•</span>
                          <span>{data}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Context Used */}
              <div className="bg-[#1A293C]/50 border border-white/5 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Search className="w-4 h-4 text-slate-400" />
                  Real-Time Context Factors Considered
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analysisResult.contextUsed.map((ctx, i) => (
                    <span key={i} className="px-3 py-1 bg-white/5 border border-white/10 rounded-md text-xs text-slate-400">
                      {ctx}
                    </span>
                  ))}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showHistory && (
          <Modal key="history-modal" title="Session History" onClose={() => setShowHistory(false)}>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {history.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No history yet.</p>
              ) : (
                history.map(entry => (
                  <div key={entry.id} className="bg-[#1A293C] border border-white/5 rounded-lg p-4 hover:border-white/20 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-semibold text-white">
                        {entry.fixture ? `${entry.fixture.homeTeam} vs ${entry.fixture.awayTeam}` : 'Custom Context'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {format(new Date(entry.timestamp), 'MMM d, HH:mm')}
                      </div>
                    </div>
                    {entry.fixture && <div className="text-xs text-[#E8600A] mb-2">{entry.fixture.league}</div>}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {entry.selectedMarkets.map(m => (
                        <span key={m} className="text-[10px] px-2 py-0.5 bg-white/10 rounded text-slate-300">{m}</span>
                      ))}
                    </div>
                    <button 
                      onClick={() => loadHistoryEntry(entry)}
                      className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-md text-sm font-medium transition-colors"
                    >
                      Restore Session
                    </button>
                  </div>
                ))
              )}
            </div>
          </Modal>
        )}

        {showSaved && (
          <Modal key="saved-modal" title="Saved Angles" onClose={() => setShowSaved(false)}>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {savedAngles.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No saved angles yet.</p>
              ) : (
                savedAngles.map(angle => (
                  <div key={angle.id} className="bg-[#1A293C] border border-white/5 rounded-lg p-4 relative">
                    <button 
                      onClick={() => removeSavedAngle(angle.id)}
                      className="absolute top-4 right-4 text-slate-500 hover:text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-2",
                      angle.type === 'CORE' ? "bg-emerald-500/10 text-emerald-400" : "bg-purple-500/10 text-purple-400"
                    )}>
                      {angle.type}
                    </div>
                    {angle.fixture && (
                      <div className="text-xs text-slate-400 mb-1">
                        {angle.fixture.homeTeam} vs {angle.fixture.awayTeam}
                      </div>
                    )}
                    <h4 className="font-bold text-white mb-2 pr-6">{angle.title}</h4>
                    <p className="text-sm text-slate-300 line-clamp-2">{angle.description}</p>
                  </div>
                ))
              )}
            </div>
          </Modal>
        )}

        {showSettings && (
          <Modal key="settings-modal" title="Settings" onClose={() => setShowSettings(false)}>
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-white">Creator Mode</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        className="sr-only" 
                        checked={creatorMode}
                        onChange={(e) => setCreatorMode(e.target.checked)}
                      />
                      <div className={cn("block w-10 h-6 rounded-full transition-colors", creatorMode ? "bg-[#E8600A]" : "bg-slate-700")}></div>
                      <div className={cn("absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform", creatorMode ? "translate-x-4" : "")}></div>
                    </div>
                  </label>
                </div>
                <p className="text-xs text-slate-400">Exposes advanced AI tuning settings.</p>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-white">Preferred Leagues</label>
                <div className="flex flex-wrap gap-2">
                  {LEAGUES.map(league => (
                    <button
                      key={league}
                      onClick={() => setSettings(s => ({
                        ...s,
                        preferredLeagues: s.preferredLeagues.includes(league)
                          ? s.preferredLeagues.filter(l => l !== league)
                          : [...s.preferredLeagues, league]
                      }))}
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium border transition-colors",
                        settings.preferredLeagues.includes(league)
                          ? "bg-[#E8600A] border-[#E8600A] text-white"
                          : "bg-transparent border-white/10 text-slate-400 hover:border-white/30"
                      )}
                    >
                      {league}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-white">Preferred Markets</label>
                <div className="flex flex-wrap gap-2">
                  {MARKETS.map(market => (
                    <button
                      key={market}
                      onClick={() => setSettings(s => ({
                        ...s,
                        preferredMarkets: s.preferredMarkets.includes(market)
                          ? s.preferredMarkets.filter(m => m !== market)
                          : [...s.preferredMarkets, market]
                      }))}
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium border transition-colors",
                        settings.preferredMarkets.includes(market)
                          ? "bg-white text-[#0D1B2A] border-white"
                          : "bg-transparent border-white/10 text-slate-400 hover:border-white/30"
                      )}
                    >
                      {market}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-white">Default Analysis Depth</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Quick', 'Standard', 'Deep'].map(depth => (
                    <button
                      key={depth}
                      onClick={() => setSettings(s => ({ ...s, analysisDepth: depth as any }))}
                      className={cn(
                        "py-2 rounded-md text-sm font-medium border transition-colors",
                        settings.analysisDepth === depth
                          ? "bg-white/10 border-white text-white"
                          : "bg-transparent border-white/10 text-slate-400 hover:border-white/30"
                      )}
                    >
                      {depth}
                    </button>
                  ))}
                </div>
              </div>

              {creatorMode && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4 pt-4 border-t border-white/10"
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white flex justify-between">
                      Fixtures to Fetch <span>{settings.numFixturesToFetch}</span>
                    </label>
                    <input 
                      type="range" 
                      min="5" max="20" step="1"
                      value={settings.numFixturesToFetch}
                      onChange={(e) => setSettings(s => ({ ...s, numFixturesToFetch: parseInt(e.target.value) }))}
                      className="w-full accent-[#E8600A]"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Analysis Verbosity</label>
                    <select 
                      value={settings.analysisVerbosity}
                      onChange={(e) => setSettings(s => ({ ...s, analysisVerbosity: e.target.value as any }))}
                      className="w-full bg-[#1A293C] border border-white/10 rounded-md p-2 text-sm text-white"
                    >
                      <option value="Low">Low (Concise)</option>
                      <option value="Medium">Medium (Balanced)</option>
                      <option value="High">High (Detailed)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Experimental Aggressiveness</label>
                    <select 
                      value={settings.experimentalAggressiveness}
                      onChange={(e) => setSettings(s => ({ ...s, experimentalAggressiveness: e.target.value as any }))}
                      className="w-full bg-[#1A293C] border border-white/10 rounded-md p-2 text-sm text-white"
                    >
                      <option value="Low">Low (Safe)</option>
                      <option value="Medium">Medium (Moderate Variance)</option>
                      <option value="High">High (Wildcard)</option>
                    </select>
                  </div>
                </motion.div>
              )}
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

// Simple Modal Component
function Modal({ title, onClose, children }: { title: string, onClose: () => void, children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#0D1B2A] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function GuideTooltip({ show, text, position = 'top' }: { show: boolean, text: string, position?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!show) return null;
  
  return (
    <div className={cn(
      "absolute z-50 pointer-events-none",
      position === 'top' && "bottom-full left-1/2 -translate-x-1/2 mb-2",
      position === 'bottom' && "top-full left-1/2 -translate-x-1/2 mt-2",
      position === 'left' && "right-full top-1/2 -translate-y-1/2 mr-2",
      position === 'right' && "left-full top-1/2 -translate-y-1/2 ml-2"
    )}>
      <motion.div 
        initial={{ opacity: 0, y: position === 'top' ? 10 : position === 'bottom' ? -10 : 0, x: position === 'left' ? 10 : position === 'right' ? -10 : 0 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        className="bg-[#E8600A] text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap flex items-center gap-2"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
        </span>
        {text}
      </motion.div>
    </div>
  );
}
