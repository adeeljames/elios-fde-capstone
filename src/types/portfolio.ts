export interface AccountRecord {
  id: string;
  userId: string;
  name: string;
  accountType: 'INVESTMENT' | 'RETIREMENT';
  institution: string;
  currency: 'USD';
  createdAt?: any;
  updatedAt?: any;
}

export interface HoldingRecord {
  id: string;
  userId: string;
  accountId: string;
  accountName: string;
  accountType: 'INVESTMENT' | 'RETIREMENT';
  ticker: string;
  shares: number;
  purchasePrice: number;
  purchaseDate: string;
  notes: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface FavoriteRecord {
  id: string;
  userId: string;
  ticker: string;
  companyName: string;
  sector: string;
  thesisNotes: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface AnalysisRecord {
  id: string;
  userId: string;
  periodKey: string;
  triggerType: 'MONTHLY' | 'ON_DEMAND';
  modelUsed: string;
  totalValue: number;
  totalCostBasis: number;
  totalUnrealizedGain: number;
  totalReturnPct: number;
  topHoldingTicker: string;
  topHoldingWeightPct: number;
  staleOrMissingCount: number;
  executiveSummary: string;
  concentrationAnalysis: string;
  dataQualityNotice: string;
  recommendationsText: string;
  limitationsAndBasis: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface EnrichedHolding {
  id: string;
  accountId: string;
  accountName: string;
  accountType: 'INVESTMENT' | 'RETIREMENT';
  ticker: string;
  companyName: string;
  sector: string;
  shares: number;
  purchasePrice: number;
  purchaseDate: string;
  notes: string;
  currentPrice: number;
  previousClose: number;
  costBasis: number;
  marketValue: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  dayChange: number;
  portfolioWeightPct: number;
  quoteTimestamp: string;
  quoteStatus: 'LIVE' | 'STALE' | 'UNAVAILABLE';
  quoteReason: string;
  source: string;
}

export interface CombinedPosition {
  ticker: string;
  companyName: string;
  sector: string;
  totalShares: number;
  weightedAvgCost: number;
  currentPrice: number;
  totalCostBasis: number;
  totalMarketValue: number;
  totalUnrealizedGain: number;
  totalUnrealizedGainPct: number;
  totalDayChange: number;
  portfolioWeightPct: number;
  isConcentrated: boolean;
  lotCount: number;
  accounts: string[];
  quoteStatus: 'LIVE' | 'STALE' | 'UNAVAILABLE';
  quoteTimestamp: string;
}

export interface AccountSummary {
  accountId: string;
  accountName: string;
  accountType: 'INVESTMENT' | 'RETIREMENT';
  marketValue: number;
  costBasis: number;
  unrealizedGain: number;
  returnPct: number;
  allocationPct: number;
  holdingsCount: number;
}

export interface PortfolioMetrics {
  summary: {
    totalMarketValue: number;
    totalCostBasis: number;
    totalUnrealizedGain: number;
    totalReturnPct: number;
    totalDayChange: number;
    investmentValue: number;
    investmentAllocationPct: number;
    retirementValue: number;
    retirementAllocationPct: number;
    topHoldingTicker: string;
    topHoldingWeightPct: number;
    totalPositionsCount: number;
    totalLotsCount: number;
    staleTickers: string[];
    unavailableTickers: string[];
    staleOrMissingCount: number;
  };
  combinedPositions: CombinedPosition[];
  holdings: EnrichedHolding[];
  accountSummaries: AccountSummary[];
  assumptions: {
    currency: string;
    costBasisMethod: string;
    transactionFees: string;
    dividendsAndSplits: string;
    staleDataPolicy: string;
    concentrationThresholdPct: number;
  };
}

export interface MarketQuoteDetail {
  ticker: string;
  companyName: string;
  sector: string;
  currentPrice: number;
  previousClose: number;
  changeAmount: number;
  changePct: number;
  highPrice: number;
  lowPrice: number;
  marketCapB: number;
  peRatio: number;
  dividendYieldPct: number;
  week52High: number;
  week52Low: number;
  quoteTimestamp: string;
  fetchedAt: string;
  source: string;
  isStale: boolean;
  isUnavailable: boolean;
  statusReason: string;
  summary: string;
  priceHistory: { date: string; close: number }[];
}
