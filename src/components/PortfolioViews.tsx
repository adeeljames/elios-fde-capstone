import React from 'react';
import {
  Plus,
  RefreshCw,
  Edit3,
  Trash2,
  FolderPlus,
  Check,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Search,
} from 'lucide-react';
import {
  AccountRecord,
  HoldingRecord,
  PortfolioMetrics,
} from '../types/portfolio.ts';

interface PortfolioOverviewProps {
  accounts: AccountRecord[];
  holdings: HoldingRecord[];
  metrics: PortfolioMetrics | null;
  loadingMetrics: boolean;
  onRefreshQuotes: () => Promise<void>;
  onSeedClientBrief: () => Promise<void>;
  onOpenHoldingsTab: () => void;
  onRunAgentOnDemand: () => Promise<void>;
  seeding: boolean;
  runningAgent: boolean;
}

const CHART_COLORS = ['#0F172A', '#059669', '#2563EB', '#D97706', '#64748B', '#0D9488'];
const DARK_CHART_COLORS = ['#38BDF8', '#34D399', '#818CF8', '#FBBF24', '#94A3B8', '#2DD4BF'];

function AllocationDonutChart({
  positions,
  totalValue,
}: {
  positions: { ticker: string; companyName: string; portfolioWeightPct: number; totalMarketValue: number }[];
  totalValue: number;
}) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let cumulativePercent = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth="14"
            className="text-slate-100 dark:text-slate-800"
          />
          {positions.map((pos, idx) => {
            const pct = Math.max(0, Math.min(100, pos.portfolioWeightPct));
            const strokeDasharray = `${(pct / 100) * circumference} ${circumference}`;
            const strokeDashoffset = -((cumulativePercent / 100) * circumference);
            cumulativePercent += pct;
            const color = CHART_COLORS[idx % CHART_COLORS.length];
            const darkColor = DARK_CHART_COLORS[idx % DARK_CHART_COLORS.length];
            return (
              <circle
                key={pos.ticker}
                cx="70"
                cy="70"
                r={radius}
                fill="transparent"
                stroke={color}
                strokeWidth="14"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="butt"
                className="transition-all duration-300 dark:stroke-[var(--dark-stroke)]"
                style={{ '--dark-stroke': darkColor } as React.CSSProperties}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Net Assets</span>
          <span className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
            ${(totalValue / 1000).toFixed(1)}k
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2.5">
        {positions.map((pos, idx) => (
          <div key={pos.ticker} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: DARK_CHART_COLORS[idx % DARK_CHART_COLORS.length] }}
              />
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{pos.ticker}</span>
              <span className="text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                {pos.companyName}
              </span>
            </div>
            <div className="font-mono tabular-nums text-right shrink-0">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {pos.portfolioWeightPct.toFixed(1)}%
              </span>
              <span className="text-slate-400 dark:text-slate-500 ml-2">
                ${pos.totalMarketValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PortfolioOverview({
  accounts,
  holdings,
  metrics,
  loadingMetrics,
  onRefreshQuotes,
  onSeedClientBrief,
  onOpenHoldingsTab,
  onRunAgentOnDemand,
  seeding,
  runningAgent,
}: PortfolioOverviewProps) {
  const [searchFilter, setSearchFilter] = React.useState('');
  const [accountCategoryFilter, setAccountCategoryFilter] = React.useState<'ALL' | 'INVESTMENT' | 'RETIREMENT'>('ALL');

  const summary = metrics?.summary;
  const combined = metrics?.combinedPositions || [];
  const accountSummaries = metrics?.accountSummaries || [];
  const assumptions = metrics?.assumptions;

  const filteredCombined = React.useMemo(() => {
    return combined.filter((pos) => {
      const matchesSearch =
        !searchFilter.trim() ||
        pos.ticker.toLowerCase().includes(searchFilter.toLowerCase()) ||
        pos.companyName.toLowerCase().includes(searchFilter.toLowerCase());
      if (!matchesSearch) return false;
      if (accountCategoryFilter === 'ALL') return true;
      const matchingHoldings = (metrics?.holdings || []).filter(
        (h) => h.ticker === pos.ticker && h.accountType === accountCategoryFilter
      );
      return matchingHoldings.length > 0;
    });
  }, [combined, searchFilter, accountCategoryFilter, metrics?.holdings]);

  if (holdings.length === 0) {
    return (
      <div className="space-y-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 lg:p-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7 space-y-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Institutional Portfolio Workspace · Ready for Tax-Lot Initialization
              </div>
              <h1
                className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-tight"
                style={{ textWrap: 'balance' }}
              >
                Initialize your investment and retirement equity ledger.
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Load the canonical client brief portfolio with one click to populate shares of Alphabet (GOOGL) and Apple (AAPL) purchased at different prices across an Individual Brokerage account and a Roth IRA, or enter your own tax lots manually.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={onSeedClientBrief}
                  disabled={seeding}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  {seeding
                    ? 'Initializing Client Brief Holdings...'
                    : 'Load Client Brief Portfolio (Alphabet & Apple)'}
                </button>
                <button
                  onClick={onOpenHoldingsTab}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Enter Custom Holdings Manually
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 pt-6 lg:pt-0 lg:pl-8 space-y-4">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Included in One-Click Client Brief Sample
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">Alphabet Inc. (GOOGL)</div>
                    <div className="text-slate-500 dark:text-slate-400">
                      25 sh Brokerage ($142.50) · 40 sh Roth IRA ($158.00)
                    </div>
                  </div>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">65 sh</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">Apple Inc. (AAPL)</div>
                    <div className="text-slate-500 dark:text-slate-400">
                      30 sh Brokerage ($185.00) · 20 sh Roth IRA ($210.00)
                    </div>
                  </div>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">50 sh</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">Watchlist Benchmarks</div>
                    <div className="text-slate-500 dark:text-slate-400">
                      Microsoft (MSFT) · Vanguard Total Market (VTI)
                    </div>
                  </div>
                  <span className="font-mono text-slate-600 dark:text-slate-400 tabular-nums">2 tickers</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Executive Header & Action Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Multi-Account Valuation Ledger</span>
            <span>·</span>
            <span>Deterministic Cost-Basis Engine</span>
            <span>·</span>
            <span>Finnhub Market Feed</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
            Portfolio Executive Summary
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onRefreshQuotes}
            disabled={loadingMetrics}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingMetrics ? 'animate-spin' : ''}`} />
            {loadingMetrics ? 'Syncing Finnhub...' : 'Refresh Quotes'}
          </button>
          <button
            onClick={onOpenHoldingsTab}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Manage Lots
          </button>
          <button
            onClick={onRunAgentOnDemand}
            disabled={runningAgent}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {runningAgent ? 'Synthesizing Analysis...' : 'Run LangGraph Portfolio Review'}
          </button>
        </div>
      </div>

      {/* Unified 4-Zone Institutional Metric Ledger Band */}
      {summary && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden">
          {/* Zone 1: Net Asset Value */}
          <div className="p-6 space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Portfolio Value (USD)</div>
            <div className="text-3xl font-bold font-mono tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
              ${summary.totalMarketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums pt-0.5">
              <span>Cost Basis: ${summary.totalCostBasis.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Zone 2: Cumulative Unrealized Gain/Loss */}
          <div className="p-6 space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Cumulative Unrealized Return</div>
            <div
              className={`text-3xl font-bold font-mono tabular-nums tracking-tight flex items-baseline gap-1.5 ${
                summary.totalUnrealizedGain >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              <span>
                {summary.totalUnrealizedGain >= 0 ? '+' : ''}$
                {summary.totalUnrealizedGain.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono tabular-nums pt-0.5">
              <span
                className={`inline-flex items-center gap-0.5 font-semibold ${
                  summary.totalReturnPct >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-700 dark:text-red-400'
                }`}
              >
                {summary.totalReturnPct >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {summary.totalReturnPct >= 0 ? '+' : ''}
                {summary.totalReturnPct.toFixed(2)}%
              </span>
              <span className="text-slate-400 dark:text-slate-600">·</span>
              <span className="text-slate-500 dark:text-slate-400">
                Day: {summary.totalDayChange >= 0 ? '+' : ''}${summary.totalDayChange.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Zone 3: Tax-Location Split (Investment vs Retirement) */}
          <div className="p-6 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-500 dark:text-slate-400">Tax-Location Split</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                {summary.investmentAllocationPct.toFixed(1)}% / {summary.retirementAllocationPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${Math.min(100, Math.max(0, summary.investmentAllocationPct))}%` }}
                className="bg-slate-900 dark:bg-sky-400 h-full transition-all duration-200"
                title={`Taxable Investment: ${summary.investmentAllocationPct.toFixed(1)}%`}
              />
              <div
                style={{ width: `${Math.min(100, Math.max(0, summary.retirementAllocationPct))}%` }}
                className="bg-emerald-600 dark:bg-emerald-400 h-full transition-all duration-200"
                title={`Retirement IRA/401k: ${summary.retirementAllocationPct.toFixed(1)}%`}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 pt-0.5">
              <span>Taxable: ${summary.investmentValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              <span>Retirement: ${summary.retirementValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          {/* Zone 4: Concentration & Feed Audit */}
          <div className="p-6 space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Primary Position Concentration</div>
            <div className="text-3xl font-bold font-mono tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
              {summary.topHoldingTicker}{' '}
              <span className="text-xl font-semibold text-slate-500 dark:text-slate-400">
                ({summary.topHoldingWeightPct.toFixed(1)}%)
              </span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 pt-0.5">
              {summary.topHoldingWeightPct >= 25
                ? 'Above 25.0% single-issuer threshold'
                : 'Within diversified <25.0% guideline'}
            </div>
          </div>
        </div>
      )}

      {/* Visual Analytics Split: Left = Donut Allocation Ring, Right = Cost Basis vs Market Value Bars */}
      {combined.length > 0 && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-5">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Portfolio Allocation Breakdown
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Proportional equity weights across all accounts
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {summary.totalPositionsCount} positions
              </span>
            </div>

            <AllocationDonutChart
              positions={combined}
              totalValue={summary.totalMarketValue}
            />

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Concentration Benchmark</span>
              <span className="font-mono tabular-nums">Max 25.0% per single equity</span>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Cost Basis vs. Market Valuation by Position
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Weighted-average acquisition cost compared with current market value
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {summary.totalLotsCount} tax lots
              </span>
            </div>

            <div className="space-y-3.5">
              {combined.map((pos) => {
                const isPositive = pos.totalUnrealizedGain >= 0;
                const costRatio =
                  pos.totalMarketValue > 0
                    ? Math.min(100, (pos.totalCostBasis / pos.totalMarketValue) * 100)
                    : 100;
                return (
                  <div
                    key={pos.ticker}
                    className="p-3.5 bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-2"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
                          {pos.ticker}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                          {pos.companyName}
                        </span>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          ${pos.totalMarketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span
                          className={`text-xs font-semibold ml-2 ${
                            isPositive
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-700 dark:text-red-400'
                          }`}
                        >
                          ({isPositive ? '+' : ''}
                          {pos.totalUnrealizedGainPct.toFixed(2)}%)
                        </span>
                      </div>
                    </div>

                    <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${costRatio}%` }}
                        className="bg-slate-500 dark:bg-slate-400 h-full"
                        title={`Cost Basis: $${pos.totalCostBasis.toFixed(2)}`}
                      />
                      <div
                        style={{ width: `${Math.max(0, 100 - costRatio)}%` }}
                        className={isPositive ? 'bg-emerald-600 dark:bg-emerald-400 h-full' : 'bg-red-600 h-full'}
                        title={`Unrealized Gain: $${pos.totalUnrealizedGain.toFixed(2)}`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      <span>
                        {pos.totalShares.toLocaleString('en-US', { maximumFractionDigits: 4 })} sh @ $
                        {pos.weightedAvgCost.toFixed(2)} avg · Basis ${pos.totalCostBasis.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span>{pos.accounts.join(' · ')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Combined Positions Across Accounts Ledger Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Combined Equity Positions Across Accounts
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Deterministic aggregation of identical tickers across Investment and Retirement accounts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter ticker or name..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-slate-900 dark:focus:border-slate-400 w-44"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['ALL', 'INVESTMENT', 'RETIREMENT'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setAccountCategoryFilter(cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    accountCategoryFilter === cat
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {cat === 'ALL' ? 'All Accounts' : cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th className="py-3 px-5">Security</th>
                <th className="py-3 px-4">Accounts & Feed Status</th>
                <th className="py-3 px-4 text-right">Combined Shares</th>
                <th className="py-3 px-4 text-right">Weighted Avg Cost</th>
                <th className="py-3 px-4 text-right">Market Quote</th>
                <th className="py-3 px-4 text-right">Total Cost Basis</th>
                <th className="py-3 px-4 text-right">Market Value</th>
                <th className="py-3 px-4 text-right">Unrealized Gain / Loss</th>
                <th className="py-3 px-5 text-right">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs text-slate-800 dark:text-slate-200">
              {filteredCombined.map((pos) => {
                const isGain = pos.totalUnrealizedGain >= 0;
                return (
                  <tr key={pos.ticker} className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="font-bold font-mono text-slate-900 dark:text-slate-100 text-sm">{pos.ticker}</div>
                      <div className="text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{pos.companyName}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{pos.accounts.join(' · ')}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        {pos.lotCount} lot{pos.lotCount > 1 ? 's' : ''} · Quote: {pos.quoteStatus}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      {pos.totalShares.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      ${pos.weightedAvgCost.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      ${pos.currentPrice.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      ${pos.totalCostBasis.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      ${pos.totalMarketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-mono tabular-nums font-semibold ${
                        isGain
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      <div>
                        {isGain ? '+' : ''}$
                        {pos.totalUnrealizedGain.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div className="text-[11px]">
                        ({isGain ? '+' : ''}
                        {pos.totalUnrealizedGainPct.toFixed(2)}%)
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono tabular-nums">
                      <div
                        className={
                          pos.isConcentrated
                            ? 'font-bold text-amber-800 dark:text-amber-400'
                            : 'font-medium text-slate-800 dark:text-slate-200'
                        }
                      >
                        {pos.portfolioWeightPct.toFixed(2)}%
                      </div>
                      {pos.isConcentrated && (
                        <div className="text-[10px] text-amber-700 dark:text-amber-400">&ge;25% Risk</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Split: Account Summaries & Documented Calculation Methodology */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Custodial Account Breakdown
              </h3>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{accountSummaries.length} accounts</span>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {accountSummaries.map((acct) => (
                <div key={acct.accountId} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{acct.accountName}</span>
                      <span>·</span>
                      <span className="font-mono text-slate-600 dark:text-slate-400">{acct.accountType}</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {acct.holdingsCount} lot(s) · Cost Basis $
                      {acct.costBasis.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ·{' '}
                      {acct.allocationPct.toFixed(1)}% of portfolio
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      ${acct.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div
                      className={`text-xs font-medium ${
                        acct.unrealizedGain >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {acct.unrealizedGain >= 0 ? '+' : ''}$
                      {acct.unrealizedGain.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      ({acct.returnPct >= 0 ? '+' : ''}
                      {acct.returnPct.toFixed(2)}%)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {summary && (
            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between font-mono tabular-nums">
              <span>Quote Freshness Audit</span>
              <span>
                {summary.unavailableTickers.length > 0
                  ? `${summary.unavailableTickers.length} Unavailable (Cost-Basis Fallback)`
                  : summary.staleTickers.length > 0
                  ? `${summary.staleTickers.length} Cached Snapshot (60 req/min guard)`
                  : 'All Quotes Live'}
              </span>
            </div>
          )}
        </div>

        {assumptions && (
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Deterministic Accounting & Valuation Methodology
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                All portfolio figures are computed in Python <code className="font-mono">Decimal</code> prior to AI synthesis.
              </p>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-300">
              <div className="space-y-1">
                <dt className="font-semibold text-slate-900 dark:text-slate-100">Base Currency</dt>
                <dd className="leading-relaxed">{assumptions.currency}</dd>
              </div>
              <div className="space-y-1">
                <dt className="font-semibold text-slate-900 dark:text-slate-100">Cost Basis Aggregation</dt>
                <dd className="leading-relaxed">{assumptions.costBasisMethod}</dd>
              </div>
              <div className="space-y-1">
                <dt className="font-semibold text-slate-900 dark:text-slate-100">Commissions & Dividends</dt>
                <dd className="leading-relaxed">
                  {assumptions.transactionFees} {assumptions.dividendsAndSplits}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="font-semibold text-slate-900 dark:text-slate-100">Market Feed & Staleness Policy</dt>
                <dd className="leading-relaxed">{assumptions.staleDataPolicy}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

interface AccountsAndHoldingsManagerProps {
  accounts: AccountRecord[];
  holdings: HoldingRecord[];
  metrics: PortfolioMetrics | null;
  onCreateAccount: (name: string, accountType: 'INVESTMENT' | 'RETIREMENT', institution: string) => Promise<void>;
  onSaveHolding: (input: {
    holdingId?: string;
    accountId: string;
    accountName: string;
    accountType: 'INVESTMENT' | 'RETIREMENT';
    ticker: string;
    shares: number;
    purchasePrice: number;
    purchaseDate: string;
    notes: string;
  }) => Promise<void>;
  onDeleteHolding: (holdingId: string) => Promise<void>;
}

export function AccountsAndHoldingsManager({
  accounts,
  holdings,
  metrics,
  onCreateAccount,
  onSaveHolding,
  onDeleteHolding,
}: AccountsAndHoldingsManagerProps) {
  const [accountFilter, setAccountFilter] = React.useState<string>('ALL');

  const [acctName, setAcctName] = React.useState('');
  const [acctType, setAcctType] = React.useState<'INVESTMENT' | 'RETIREMENT'>('INVESTMENT');
  const [acctInst, setAcctInst] = React.useState('Vanguard');
  const [savingAcct, setSavingAcct] = React.useState(false);

  const [editingHoldingId, setEditingHoldingId] = React.useState<string | null>(null);
  const [selectedAcctId, setSelectedAcctId] = React.useState<string>('');
  const [ticker, setTicker] = React.useState('GOOGL');
  const [shares, setShares] = React.useState('25');
  const [purchasePrice, setPurchasePrice] = React.useState('150.00');
  const [purchaseDate, setPurchaseDate] = React.useState('2026-01-15');
  const [notes, setNotes] = React.useState('');
  const [savingHolding, setSavingHolding] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [formSuccess, setFormSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (accounts.length > 0 && !selectedAcctId) {
      setSelectedAcctId(accounts[0].id);
    }
  }, [accounts, selectedAcctId]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!acctName.trim()) {
      setFormError('Account name is required.');
      return;
    }
    setSavingAcct(true);
    try {
      await onCreateAccount(acctName.trim(), acctType, acctInst.trim() || 'Brokerage');
      setAcctName('');
      setFormSuccess('Account created and persisted.');
      setTimeout(() => setFormSuccess(null), 2500);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create account');
    } finally {
      setSavingAcct(false);
    }
  };

  const handleHoldingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const targetAccount = accounts.find((a) => a.id === selectedAcctId);
    if (!targetAccount) {
      setFormError('Please create or select an account first.');
      return;
    }

    const numShares = Number(shares);
    const numPrice = Number(purchasePrice);
    const cleanTicker = ticker.toUpperCase().trim();

    if (!/^[A-Z0-9.\-]{1,12}$/.test(cleanTicker)) {
      setFormError('Ticker must be 1-12 uppercase alphanumeric characters (e.g., AAPL, GOOGL).');
      return;
    }
    if (!Number.isFinite(numShares) || numShares <= 0) {
      setFormError('Shares quantity must be greater than 0.');
      return;
    }
    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      setFormError('Purchase price must be greater than $0.00.');
      return;
    }

    setSavingHolding(true);
    try {
      await onSaveHolding({
        holdingId: editingHoldingId || undefined,
        accountId: targetAccount.id,
        accountName: targetAccount.name,
        accountType: targetAccount.accountType,
        ticker: cleanTicker,
        shares: numShares,
        purchasePrice: numPrice,
        purchaseDate,
        notes: notes.trim(),
      });
      setEditingHoldingId(null);
      setNotes('');
      setFormSuccess(editingHoldingId ? `Updated ${cleanTicker} tax lot.` : `Recorded ${cleanTicker} tax lot.`);
      setTimeout(() => setFormSuccess(null), 3000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save holding');
    } finally {
      setSavingHolding(false);
    }
  };

  const startEdit = (h: HoldingRecord) => {
    setEditingHoldingId(h.id);
    setSelectedAcctId(h.accountId);
    setTicker(h.ticker);
    setShares(String(h.shares));
    setPurchasePrice(String(h.purchasePrice));
    setPurchaseDate(h.purchaseDate);
    setNotes(h.notes || '');
  };

  const enrichedList = metrics?.holdings || [];
  const filteredEnriched =
    accountFilter === 'ALL'
      ? enrichedList
      : enrichedList.filter((item) => item.accountType === accountFilter || item.accountId === accountFilter);

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>Persistent Portfolio Ledger</span>
          <span>·</span>
          <span>Tax-Lot Entry & Editing</span>
          <span>·</span>
          <span>Idempotent Retry Guard</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
          Accounts & Tax-Lot Holdings
        </h1>
      </div>

      {formError && (
        <div className="p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-800 dark:text-red-300 flex items-center justify-between">
          <span>{formError}</span>
          <button onClick={() => setFormError(null)} className="text-red-600 dark:text-red-400 hover:text-red-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {formSuccess && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>{formSuccess}</span>
        </div>
      )}

      {/* Forms Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <form
          onSubmit={handleHoldingSubmit}
          className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {editingHoldingId ? 'Edit Existing Tax-Lot Holding' : 'Record Stock Holding (Tax Lot)'}
            </h2>
            {editingHoldingId && (
              <button
                type="button"
                onClick={() => setEditingHoldingId(null)}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Target Account
              </label>
              <select
                value={selectedAcctId}
                onChange={(e) => setSelectedAcctId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900 dark:focus:border-slate-400"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.accountType})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Stock Ticker Symbol
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="e.g., GOOGL, AAPL, MSFT"
                required
                className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900 dark:focus:border-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Number of Shares
              </label>
              <input
                type="number"
                step="any"
                min="0.0001"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900 dark:focus:border-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Purchase Price per Share (USD)
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900 dark:focus:border-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Acquisition Date
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900 dark:focus:border-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Lot Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Q2 Dip Purchase, RSU Vest"
                maxLength={200}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900 dark:focus:border-slate-400"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={savingHolding || accounts.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {savingHolding
                ? 'Saving Holding...'
                : editingHoldingId
                ? 'Update Tax-Lot Holding'
                : 'Add Holding to Portfolio'}
            </button>
          </div>
        </form>

        <form
          onSubmit={handleCreateAccount}
          className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
        >
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Add Investment or Retirement Account
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Separate taxable brokerage positions from tax-advantaged retirement accounts.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Account Name
              </label>
              <input
                type="text"
                value={acctName}
                onChange={(e) => setAcctName(e.target.value)}
                placeholder="e.g., Traditional 401(k), Taxable Joint"
                maxLength={75}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900 dark:focus:border-slate-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Account Category
                </label>
                <select
                  value={acctType}
                  onChange={(e) => setAcctType(e.target.value as 'INVESTMENT' | 'RETIREMENT')}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900 dark:focus:border-slate-400"
                >
                  <option value="INVESTMENT">INVESTMENT</option>
                  <option value="RETIREMENT">RETIREMENT</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Custodian / Institution
                </label>
                <input
                  type="text"
                  value={acctInst}
                  onChange={(e) => setAcctInst(e.target.value)}
                  placeholder="Vanguard, Fidelity, Schwab"
                  maxLength={75}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900 dark:focus:border-slate-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingAcct}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              {savingAcct ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>

      {/* Individual Tax-Lots Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Recorded Tax Lots ({filteredEnriched.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Click Edit on any row to modify share quantity, purchase price, or account assignment.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(['ALL', 'INVESTMENT', 'RETIREMENT'] as const).map((filterKey) => (
              <button
                key={filterKey}
                onClick={() => setAccountFilter(filterKey)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  accountFilter === filterKey
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {filterKey === 'ALL' ? 'All Accounts' : filterKey}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th className="py-3 px-5">Ticker</th>
                <th className="py-3 px-4">Account & Category</th>
                <th className="py-3 px-4">Purchase Date</th>
                <th className="py-3 px-4 text-right">Shares</th>
                <th className="py-3 px-4 text-right">Purchase Price</th>
                <th className="py-3 px-4 text-right">Current Price</th>
                <th className="py-3 px-4 text-right">Lot Cost Basis</th>
                <th className="py-3 px-4 text-right">Lot Value</th>
                <th className="py-3 px-4 text-right">Unrealized Gain</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs text-slate-800 dark:text-slate-200">
              {filteredEnriched.map((lot) => {
                const rawRecord = holdings.find((h) => h.id === lot.id);
                const isGain = lot.unrealizedGain >= 0;
                return (
                  <tr key={lot.id} className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-5 font-bold font-mono text-slate-900 dark:text-slate-100">
                      {lot.ticker}
                      {lot.notes && (
                        <div className="font-normal font-sans text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                          {lot.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{lot.accountName}</div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{lot.accountType}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">{lot.purchaseDate}</td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      {lot.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      ${lot.purchasePrice.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      ${lot.currentPrice.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      ${lot.costBasis.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      ${lot.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-mono tabular-nums font-semibold ${
                        isGain
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {isGain ? '+' : ''}$
                      {lot.unrealizedGain.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      ({isGain ? '+' : ''}
                      {lot.unrealizedGainPct.toFixed(2)}%)
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        {rawRecord && (
                          <button
                            onClick={() => startEdit(rawRecord)}
                            className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                            title="Edit holding"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => onDeleteHolding(lot.id)}
                          className="p-1 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                          title="Delete holding"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
