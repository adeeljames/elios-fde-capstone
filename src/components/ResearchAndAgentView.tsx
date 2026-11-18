import React from 'react';
import {
  Search,
  Star,
  RefreshCw,
  Play,
  Calendar,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  AnalysisRecord,
  FavoriteRecord,
  MarketQuoteDetail,
  PortfolioMetrics,
} from '../types/portfolio.ts';

interface ResearchViewProps {
  favorites: FavoriteRecord[];
  onAddFavorite: (ticker: string, companyName: string, sector: string, thesisNotes: string) => Promise<void>;
  onRemoveFavorite: (id: string) => Promise<void>;
  getIdToken: () => Promise<string>;
}

function PriceHistoryChart({ points }: { points: { date: string; close: number }[] }) {
  if (!points || points.length < 2) return null;
  const closes = points.map((p) => p.close);
  const minVal = Math.min(...closes);
  const maxVal = Math.max(...closes);
  const range = maxVal - minVal || 1;
  const width = 560;
  const height = 140;
  const padX = 16;
  const padY = 18;

  const coords = points.map((pt, idx) => {
    const x = padX + (idx / (points.length - 1)) * (width - padX * 2);
    const y = height - padY - ((pt.close - minVal) / range) * (height - padY * 2);
    return { x, y, ...pt };
  });

  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPoints = `${coords[0].x.toFixed(1)},${height - padY} ${polylinePoints} ${coords[
    coords.length - 1
  ].x.toFixed(1)},${height - padY}`;

  const isUp = closes[closes.length - 1] >= closes[0];
  const strokeColor = isUp ? '#10b981' : '#ef4444';
  const fillColor = isUp ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)';

  return (
    <div className="space-y-2">
      <div className="w-full overflow-hidden bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-32 overflow-visible"
          role="img"
          aria-label="Stored historical price trend"
        >
          <polygon points={areaPoints} fill={fillColor} />
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />
          {coords.map((c) => (
            <g key={c.date}>
              <circle cx={c.x} cy={c.y} r="3.5" fill="#0f172a" stroke={strokeColor} strokeWidth="2" />
            </g>
          ))}
        </svg>
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 px-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
          <span>
            Start ({points[0].date}): ${points[0].close.toFixed(2)}
          </span>
          <span>
            Range: ${minVal.toFixed(2)} – ${maxVal.toFixed(2)}
          </span>
          <span>
            Latest ({points[points.length - 1].date}): ${points[points.length - 1].close.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ResearchView({
  favorites,
  onAddFavorite,
  onRemoveFavorite,
  getIdToken,
}: ResearchViewProps) {
  const [searchTicker, setSearchTicker] = React.useState('GOOGL');
  const [quoteDetail, setQuoteDetail] = React.useState<MarketQuoteDetail | null>(null);
  const [knownTickers, setKnownTickers] = React.useState<string[]>([
    'GOOGL',
    'AAPL',
    'MSFT',
    'NVDA',
    'AMZN',
    'VTI',
    'BRK.B',
  ]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [thesisInput, setThesisInput] = React.useState('');
  const [savingFav, setSavingFav] = React.useState(false);

  const inspectTicker = React.useCallback(
    async (tickerSymbol: string, forceRefresh = false) => {
      const sym = tickerSymbol.toUpperCase().trim();
      if (!sym) return;
      setLoading(true);
      setError(null);
      try {
        const token = await getIdToken();
        const res = await fetch(
          `/api/market/research/${encodeURIComponent(sym)}?refresh=${forceRefresh ? 'true' : 'false'}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Failed to load stock research');
        }
        setQuoteDetail(data.quote);
        if (Array.isArray(data.knownTickers)) {
          setKnownTickers(data.knownTickers);
        }
      } catch (err: any) {
        setError(err.message || 'Could not retrieve market research');
      } finally {
        setLoading(false);
      }
    },
    [getIdToken]
  );

  React.useEffect(() => {
    inspectTicker('GOOGL', false);
  }, [inspectTicker]);

  const handleSaveFavorite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteDetail) return;
    setSavingFav(true);
    try {
      await onAddFavorite(
        quoteDetail.ticker,
        quoteDetail.companyName,
        quoteDetail.sector,
        thesisInput.trim() || `Following ${quoteDetail.ticker} valuation and earnings trajectory.`
      );
      setThesisInput('');
    } finally {
      setSavingFav(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Finnhub Equity Research</span>
            <span>·</span>
            <span>Stored Price History Curve</span>
            <span>·</span>
            <span>Watchlist Thesis Notes</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
            Favorite Tickers & Fundamental Research
          </h1>
        </div>

        {/* Search Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            inspectTicker(searchTicker, false);
          }}
          className="flex items-center gap-2"
        >
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTicker}
              onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
              placeholder="Inspect ticker (e.g., GOOGL, AAPL)"
              className="pl-9 pr-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900 dark:focus:border-slate-400 w-56"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {loading ? 'Loading...' : 'Inspect'}
          </button>
          <button
            type="button"
            onClick={() => inspectTicker(searchTicker, true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Force Refresh
          </button>
        </form>
      </div>

      {/* Quick Ticker Selector Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Institutional Benchmarks:</span>
        {knownTickers.map((sym) => (
          <button
            key={sym}
            onClick={() => {
              setSearchTicker(sym);
              inspectTicker(sym, false);
            }}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              quoteDetail?.ticker === sym
                ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {sym}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Main Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6">
          {quoteDetail ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{quoteDetail.ticker}</span>
                    <span>·</span>
                    <span>{quoteDetail.sector}</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    {quoteDetail.companyName}
                  </h2>
                </div>
                <div className="sm:text-right">
                  <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-50">
                    ${quoteDetail.currentPrice.toFixed(2)}
                  </div>
                  <div
                    className={`inline-flex items-center gap-0.5 text-xs font-mono tabular-nums font-semibold mt-0.5 ${
                      quoteDetail.changeAmount >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {quoteDetail.changeAmount >= 0 ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {quoteDetail.changeAmount >= 0 ? '+' : ''}
                    ${quoteDetail.changeAmount.toFixed(2)} ({quoteDetail.changeAmount >= 0 ? '+' : ''}
                    {quoteDetail.changePct.toFixed(2)}%)
                  </div>
                </div>
              </div>

              {/* SVG Price History Curve & Ledger */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Stored Historical Price Trajectory (<code className="font-mono">price_history</code> table)
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {quoteDetail.priceHistory.length} recorded closes
                  </span>
                </div>

                {quoteDetail.priceHistory.length >= 2 && (
                  <PriceHistoryChart points={quoteDetail.priceHistory} />
                )}

                {quoteDetail.priceHistory.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                    {quoteDetail.priceHistory.slice(-6).map((pt) => (
                      <div
                        key={pt.date}
                        className="p-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 rounded-lg text-center"
                      >
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{pt.date}</div>
                        <div className="text-xs font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                          ${pt.close.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No stored price history available for this symbol.
                  </p>
                )}
              </div>

              {/* Fundamental Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Market Cap</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {quoteDetail.marketCapB > 0 ? `$${quoteDetail.marketCapB.toFixed(1)}B` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">P/E Ratio (TTM)</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {quoteDetail.peRatio > 0 ? `${quoteDetail.peRatio.toFixed(1)}x` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">52-Week Range</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {quoteDetail.week52Low > 0
                      ? `$${quoteDetail.week52Low.toFixed(0)} – $${quoteDetail.week52High.toFixed(0)}`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Dividend Yield</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {quoteDetail.dividendYieldPct.toFixed(2)}%
                  </p>
                </div>
              </div>

              {/* Company Summary & Provider Limits */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Business & Fundamental Overview</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{quoteDetail.summary}</p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Quote Status: {quoteDetail.isUnavailable ? 'UNAVAILABLE' : quoteDetail.isStale ? 'CACHED / STALE' : 'LIVE QUOTE'}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Timestamp: {quoteDetail.quoteTimestamp ? new Date(quoteDetail.quoteTimestamp).toLocaleString() : 'N/A'}
                  </span>
                </div>
                <p>{quoteDetail.statusReason}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Provider Refresh Limit: Finnhub Stock API v1 enforces a 60 calls/min rate limit on the free tier. Quotes are cached for 5 minutes and persisted to the historical price ledger.
                </p>
              </div>

              {/* Add to Favorites Form */}
              <form onSubmit={handleSaveFavorite} className="pt-2 space-y-2.5">
                <label className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Save {quoteDetail.ticker} to Personal Watchlist & Research Notes
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={thesisInput}
                    onChange={(e) => setThesisInput(e.target.value)}
                    placeholder={`Research note for ${quoteDetail.ticker} (e.g., Cloud margin expansion, target entry $175)...`}
                    maxLength={450}
                    className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900 dark:focus:border-slate-400"
                  />
                  <button
                    type="submit"
                    disabled={savingFav}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Star className="w-3.5 h-3.5" />
                    {savingFav ? 'Saving...' : `Follow ${quoteDetail.ticker}`}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              Select or search a stock ticker above to inspect fundamentals and stored price history.
            </div>
          )}
        </div>

        {/* Right: User's Saved Favorite Tickers */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Followed Watchlist Tickers</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Persisted in your private portfolio database
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{favorites.length} followed</span>
          </div>

          {favorites.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                You have not added any favorite tickers yet.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect a stock on the left and click <strong>Follow</strong> to save your research thesis.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {favorites.map((fav) => (
                <div key={fav.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSearchTicker(fav.ticker);
                          inspectTicker(fav.ticker, false);
                        }}
                        className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100 hover:underline cursor-pointer"
                      >
                        {fav.ticker}
                      </button>
                      <span className="text-xs text-slate-400 dark:text-slate-600">·</span>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{fav.companyName}</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{fav.sector}</p>
                    {fav.thesisNotes && (
                      <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 rounded-lg px-3 py-2 mt-1.5 leading-relaxed">
                        {fav.thesisNotes}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onRemoveFavorite(fav.id)}
                    title="Remove from favorites"
                    className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface AgentAnalysisViewProps {
  analyses: AnalysisRecord[];
  metrics: PortfolioMetrics | null;
  runningAgent: boolean;
  onRunAgent: (triggerType: 'MONTHLY' | 'ON_DEMAND') => Promise<void>;
}

export function AgentAnalysisView({
  analyses,
  runningAgent,
  onRunAgent,
}: AgentAnalysisViewProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const activeReport = React.useMemo(() => {
    if (!analyses.length) return null;
    if (selectedId) {
      return analyses.find((a) => a.id === selectedId) || analyses[0];
    }
    return analyses[0];
  }, [analyses, selectedId]);

  return (
    <div className="space-y-8">
      {/* Header & Triggers */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Managed LangGraph Agent</span>
            <span>·</span>
            <span>Groq llama-3.3-70b-versatile</span>
            <span>·</span>
            <span>Verified Deterministic Calculations</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
            Portfolio Analysis & Reasoned Recommendations
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onRunAgent('MONTHLY')}
            disabled={runningAgent}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
            {runningAgent ? 'Running LangGraph...' : 'Run Scheduled Monthly Analysis'}
          </button>
          <button
            onClick={() => onRunAgent('ON_DEMAND')}
            disabled={runningAgent}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            {runningAgent ? 'Synthesizing Review...' : 'Trigger On-Demand Review'}
          </button>
        </div>
      </div>

      {analyses.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No Saved Portfolio Analysis Yet
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
            Trigger an on-demand review or run the monthly analysis above. The Python LangGraph agent will compute your exact holding values, weighted-average cost bases across Investment and Retirement accounts, single-stock concentration weights, and quote freshness before saving its reasoned recommendations.
          </p>
          <div>
            <button
              onClick={() => onRunAgent('ON_DEMAND')}
              disabled={runningAgent}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              {runningAgent ? 'Running LangGraph Pipeline...' : 'Run First Portfolio Analysis'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {activeReport && (
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 lg:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {activeReport.triggerType === 'MONTHLY' ? 'MONTHLY SCHEDULED RUN' : 'ON-DEMAND REVIEW'}
                    </span>
                    <span>·</span>
                    <span className="font-mono">Idempotency Key: {activeReport.periodKey}</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    Verified Portfolio Review & Allocation Advisory
                  </h2>
                </div>
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {activeReport.modelUsed}
                </div>
              </div>

              {/* Verified Numerical Snapshot Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Verified Value</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    ${Number(activeReport.totalValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Verified Cost Basis</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    ${Number(activeReport.totalCostBasis).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Unrealized Return</p>
                  <p
                    className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${
                      Number(activeReport.totalUnrealizedGain) >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {Number(activeReport.totalUnrealizedGain) >= 0 ? '+' : ''}$
                    {Number(activeReport.totalUnrealizedGain).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    ({Number(activeReport.totalReturnPct) >= 0 ? '+' : ''}
                    {Number(activeReport.totalReturnPct).toFixed(2)}%)
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Top Concentration</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {activeReport.topHoldingTicker} ({Number(activeReport.topHoldingWeightPct).toFixed(2)}%)
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  01. Performance & Multi-Account Position Summary
                </h3>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {activeReport.executiveSummary}
                </p>
              </div>

              <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-4">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  02. Concentration Risk & Account Allocation (Investment vs. Retirement)
                </h3>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {activeReport.concentrationAnalysis}
                </p>
              </div>

              <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    03. Market Data Audit (Stale or Missing Inputs)
                  </h3>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    Flagged tickers: {activeReport.staleOrMissingCount}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                  {activeReport.dataQualityNotice}
                </p>
              </div>

              <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  04. Reasoned Portfolio Recommendations
                </h3>
                <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line space-y-2">
                  {activeReport.recommendationsText}
                </div>
              </div>

              <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-4">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  05. Recommendation Basis, Assumptions & Scope Limitations (No Trade Execution)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {activeReport.limitationsAndBasis}
                </p>
              </div>
            </div>
          )}

          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Saved Analysis Ledger</h3>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{analyses.length} saved</span>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {analyses.map((item) => {
                  const isSelected = activeReport?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full text-left py-3 px-3 rounded-xl transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-slate-100 dark:bg-slate-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.triggerType === 'MONTHLY' ? 'Monthly Analysis' : 'On-Demand Review'}
                        </span>
                        <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold tabular-nums">
                          ${Number(item.totalValue).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-1">
                        <span className="truncate max-w-[180px]">{item.periodKey}</span>
                        <span
                          className={
                            Number(item.totalReturnPct) >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-700 dark:text-red-400'
                          }
                        >
                          {Number(item.totalReturnPct) >= 0 ? '+' : ''}
                          {Number(item.totalReturnPct).toFixed(2)}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100">Retry & Idempotency Guarantee</h4>
              <p className="leading-relaxed">
                Repeated clicks on <strong>Run Scheduled Monthly Analysis</strong> or <strong>Trigger On-Demand Review</strong> with unchanged portfolio holdings resolve to the same deterministic <code className="font-mono">periodKey</code> and update the existing record in-place rather than creating duplicate analysis history.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
