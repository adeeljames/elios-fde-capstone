/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signOut,
  doc,
  collection,
  query,
  where,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  handleFirestoreError,
  OperationType,
} from './lib/firebase.ts';
import {
  AccountRecord,
  AnalysisRecord,
  FavoriteRecord,
  HoldingRecord,
  PortfolioMetrics,
} from './types/portfolio.ts';
import {
  PortfolioOverview,
  AccountsAndHoldingsManager,
} from './components/PortfolioViews.tsx';
import {
  ResearchView,
  AgentAnalysisView,
} from './components/ResearchAndAgentView.tsx';
import { McpAndEvalView } from './components/McpAndEvalView.tsx';
import { LogIn, LogOut, ShieldCheck, ArrowRight, Sun, Moon } from 'lucide-react';

type ActiveTab = 'overview' | 'holdings' | 'research' | 'agent' | 'mcp' | 'eval';

export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [authReady, setAuthReady] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('overview');
  const [darkMode, setDarkMode] = React.useState<boolean>(true);

  // Sync dark mode class on <html>
  React.useEffect(() => {
    const rootEl = document.documentElement;
    if (darkMode) {
      rootEl.classList.add('dark');
    } else {
      rootEl.classList.remove('dark');
    }
  }, [darkMode]);

  // Firestore Real-Time State
  const [accounts, setAccounts] = React.useState<AccountRecord[]>([]);
  const [holdings, setHoldings] = React.useState<HoldingRecord[]>([]);
  const [favorites, setFavorites] = React.useState<FavoriteRecord[]>([]);
  const [analyses, setAnalyses] = React.useState<AnalysisRecord[]>([]);

  // Python Deterministic Calculation & Agent State
  const [metrics, setMetrics] = React.useState<PortfolioMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = React.useState(false);
  const [runningAgent, setRunningAgent] = React.useState(false);
  const [seeding, setSeeding] = React.useState(false);
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  // 1. Auth Listener
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2. Real-time Firestore Listeners (Strictly Scoped to Authenticated User)
  React.useEffect(() => {
    if (!authReady || !user) {
      setAccounts([]);
      setHoldings([]);
      setFavorites([]);
      setAnalyses([]);
      setMetrics(null);
      return;
    }

    const uid = user.uid;
    const accountsPath = `users/${uid}/accounts`;
    const holdingsPath = `users/${uid}/holdings`;
    const favoritesPath = `users/${uid}/favorites`;
    const analysesPath = `users/${uid}/analyses`;

    const unsubAccounts = onSnapshot(
      query(collection(db, accountsPath), where('userId', '==', uid)),
      (snap) => {
        const list: AccountRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AccountRecord, 'id'>),
        }));
        setAccounts(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, accountsPath)
    );

    const unsubHoldings = onSnapshot(
      query(collection(db, holdingsPath), where('userId', '==', uid)),
      (snap) => {
        const list: HoldingRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<HoldingRecord, 'id'>),
        }));
        setHoldings(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, holdingsPath)
    );

    const unsubFavorites = onSnapshot(
      query(collection(db, favoritesPath), where('userId', '==', uid)),
      (snap) => {
        const list: FavoriteRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FavoriteRecord, 'id'>),
        }));
        setFavorites(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, favoritesPath)
    );

    const unsubAnalyses = onSnapshot(
      query(collection(db, analysesPath), where('userId', '==', uid)),
      (snap) => {
        const list: AnalysisRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AnalysisRecord, 'id'>),
        }));
        list.sort((a, b) => {
          const tA = a.updatedAt?.seconds || 0;
          const tB = b.updatedAt?.seconds || 0;
          return tB - tA;
        });
        setAnalyses(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, analysesPath)
    );

    return () => {
      unsubAccounts();
      unsubHoldings();
      unsubFavorites();
      unsubAnalyses();
    };
  }, [authReady, user]);

  // 3. Compute Deterministic Metrics via Python Backend whenever holdings change
  const computeMetrics = React.useCallback(
    async (currentHoldings: HoldingRecord[], forceRefresh = false) => {
      if (!user) return;
      setLoadingMetrics(true);
      setGlobalError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/portfolio/compute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            holdings: currentHoldings,
            forceRefresh,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Failed to compute portfolio metrics');
        }
        setMetrics(data.metrics);
      } catch (err: any) {
        setGlobalError(err.message || 'Error computing portfolio valuation');
      } finally {
        setLoadingMetrics(false);
      }
    },
    [user]
  );

  React.useEffect(() => {
    if (user && authReady) {
      computeMetrics(holdings, false);
    }
  }, [user, authReady, holdings, computeMetrics]);

  // 4. OAuth Sign-In / Sign-Out Handlers
  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(err.message || 'Google OAuth sign-in failed');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // 5. Seed Client Brief Baseline (Alphabet & Apple across Investment & Retirement Accounts)
  const handleSeedClientBrief = async () => {
    if (!user) return;
    setSeeding(true);
    setGlobalError(null);
    const uid = user.uid;
    try {
      const invAcctId = 'acct_taxable_brokerage';
      const retAcctId = 'acct_roth_retirement';

      await setDoc(doc(db, `users/${uid}/accounts`, invAcctId), {
        userId: uid,
        name: 'Individual Brokerage',
        accountType: 'INVESTMENT',
        institution: 'Vanguard Brokerage',
        currency: 'USD',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, `users/${uid}/accounts`, retAcctId), {
        userId: uid,
        name: 'Roth IRA Retirement',
        accountType: 'RETIREMENT',
        institution: 'Fidelity Retirement',
        currency: 'USD',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const initialLots = [
        {
          id: 'lot_googl_inv_1',
          accountId: invAcctId,
          accountName: 'Individual Brokerage',
          accountType: 'INVESTMENT' as const,
          ticker: 'GOOGL',
          shares: 25,
          purchasePrice: 142.5,
          purchaseDate: '2025-04-10',
          notes: 'Alphabet Class A core taxable lot',
        },
        {
          id: 'lot_googl_ret_1',
          accountId: retAcctId,
          accountName: 'Roth IRA Retirement',
          accountType: 'RETIREMENT' as const,
          ticker: 'GOOGL',
          shares: 40,
          purchasePrice: 158.0,
          purchaseDate: '2025-08-19',
          notes: 'Alphabet Class A retirement accumulation lot',
        },
        {
          id: 'lot_aapl_inv_1',
          accountId: invAcctId,
          accountName: 'Individual Brokerage',
          accountType: 'INVESTMENT' as const,
          ticker: 'AAPL',
          shares: 30,
          purchasePrice: 185.0,
          purchaseDate: '2025-02-14',
          notes: 'Apple taxable position',
        },
        {
          id: 'lot_aapl_ret_1',
          accountId: retAcctId,
          accountName: 'Roth IRA Retirement',
          accountType: 'RETIREMENT' as const,
          ticker: 'AAPL',
          shares: 20,
          purchasePrice: 210.0,
          purchaseDate: '2025-11-03',
          notes: 'Apple Roth IRA tax-free growth lot',
        },
      ];

      for (const lot of initialLots) {
        await setDoc(doc(db, `users/${uid}/holdings`, lot.id), {
          userId: uid,
          accountId: lot.accountId,
          accountName: lot.accountName,
          accountType: lot.accountType,
          ticker: lot.ticker,
          shares: lot.shares,
          purchasePrice: lot.purchasePrice,
          purchaseDate: lot.purchaseDate,
          notes: lot.notes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await setDoc(doc(db, `users/${uid}/favorites`, 'fav_MSFT'), {
        userId: uid,
        ticker: 'MSFT',
        companyName: 'Microsoft Corporation',
        sector: 'Information Technology · Enterprise Cloud & Software',
        thesisNotes: 'Monitoring enterprise cloud growth and valuation multiple vs. Alphabet.',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, `users/${uid}/favorites`, 'fav_VTI'), {
        userId: uid,
        ticker: 'VTI',
        companyName: 'Vanguard Total Stock Market Index Fund ETF',
        sector: 'Broad Market Index ETF · US Total Equity',
        thesisNotes: 'Target broad-market diversification candidate for future Roth IRA contributions.',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/holdings`);
    } finally {
      setSeeding(false);
    }
  };

  // 6. Create Account
  const handleCreateAccount = async (
    name: string,
    accountType: 'INVESTMENT' | 'RETIREMENT',
    institution: string
  ) => {
    if (!user) return;
    const uid = user.uid;
    const acctId = `acct_${accountType.toLowerCase()}_${Date.now()}`;
    const path = `users/${uid}/accounts`;
    try {
      await setDoc(doc(db, path, acctId), {
        userId: uid,
        name: name.slice(0, 80),
        accountType,
        institution: institution.slice(0, 80),
        currency: 'USD',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // 7. Create or Update Holding (with Idempotent Duplicate Prevention)
  const handleSaveHolding = async (input: {
    holdingId?: string;
    accountId: string;
    accountName: string;
    accountType: 'INVESTMENT' | 'RETIREMENT';
    ticker: string;
    shares: number;
    purchasePrice: number;
    purchaseDate: string;
    notes: string;
  }) => {
    if (!user) return;
    const uid = user.uid;
    const path = `users/${uid}/holdings`;

    const existingDuplicate = holdings.find(
      (h) =>
        h.id === input.holdingId ||
        (!input.holdingId &&
          h.accountId === input.accountId &&
          h.ticker === input.ticker &&
          h.purchaseDate === input.purchaseDate &&
          Math.abs(h.purchasePrice - input.purchasePrice) < 0.0001)
    );

    try {
      if (existingDuplicate) {
        await updateDoc(doc(db, path, existingDuplicate.id), {
          accountId: input.accountId,
          accountName: input.accountName.slice(0, 80),
          accountType: input.accountType,
          ticker: input.ticker.slice(0, 12),
          shares: Number(input.shares),
          purchasePrice: Number(input.purchasePrice),
          purchaseDate: input.purchaseDate,
          notes: (input.notes || '').slice(0, 240),
          updatedAt: serverTimestamp(),
        });
      } else {
        const newId = `lot_${input.ticker.replace(/[^A-Z0-9]/g, '')}_${Date.now()}`;
        await setDoc(doc(db, path, newId), {
          userId: uid,
          accountId: input.accountId,
          accountName: input.accountName.slice(0, 80),
          accountType: input.accountType,
          ticker: input.ticker.slice(0, 12),
          shares: Number(input.shares),
          purchasePrice: Number(input.purchasePrice),
          purchaseDate: input.purchaseDate,
          notes: (input.notes || '').slice(0, 240),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  // 8. Delete Holding
  const handleDeleteHolding = async (holdingId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/holdings`;
    try {
      await deleteDoc(doc(db, path, holdingId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // 9. Add / Remove Favorite Ticker
  const handleAddFavorite = async (
    ticker: string,
    companyName: string,
    sector: string,
    thesisNotes: string
  ) => {
    if (!user) return;
    const uid = user.uid;
    const cleanTicker = ticker.replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
    const favId = `fav_${cleanTicker.replace(/[^a-zA-Z0-9_\-]/g, '_')}`;
    const path = `users/${uid}/favorites`;
    const existsFav = favorites.find((f) => f.id === favId);
    try {
      if (existsFav) {
        await updateDoc(doc(db, path, favId), {
          companyName: companyName.slice(0, 120),
          sector: sector.slice(0, 80),
          thesisNotes: thesisNotes.slice(0, 500),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, path, favId), {
          userId: uid,
          ticker: cleanTicker,
          companyName: companyName.slice(0, 120),
          sector: sector.slice(0, 80),
          thesisNotes: thesisNotes.slice(0, 500),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleRemoveFavorite = async (favId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/favorites`;
    try {
      await deleteDoc(doc(db, path, favId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // 10. Run Managed LangGraph Agent (Monthly or On-Demand) & Persist Idempotently
  const handleRunAgent = async (triggerType: 'MONTHLY' | 'ON_DEMAND') => {
    if (!user) return;
    setRunningAgent(true);
    setGlobalError(null);
    const uid = user.uid;
    const path = `users/${uid}/analyses`;

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/agent/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          triggerType,
          holdings,
          forceRefresh: false,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Agent execution failed');
      }

      const r = data.report;
      if (data.metrics) {
        setMetrics(data.metrics);
      }

      const safeDocId = `analysis_${String(r.periodKey).replace(/[^a-zA-Z0-9_\-]/g, '_')}`.slice(0, 120);
      const existingReport = analyses.find((a) => a.id === safeDocId);

      const payload = {
        userId: uid,
        periodKey: String(r.periodKey).slice(0, 64),
        triggerType: r.triggerType === 'MONTHLY' ? 'MONTHLY' : 'ON_DEMAND',
        modelUsed: String(r.modelUsed).slice(0, 80),
        totalValue: Number(r.totalValue),
        totalCostBasis: Number(r.totalCostBasis),
        totalUnrealizedGain: Number(r.totalUnrealizedGain),
        totalReturnPct: Number(r.totalReturnPct),
        topHoldingTicker: String(r.topHoldingTicker || 'NONE').slice(0, 12),
        topHoldingWeightPct: Number(r.topHoldingWeightPct || 0),
        staleOrMissingCount: Math.max(0, Math.floor(Number(r.staleOrMissingCount || 0))),
        executiveSummary: String(r.executiveSummary).slice(0, 2000),
        concentrationAnalysis: String(r.concentrationAnalysis).slice(0, 2000),
        dataQualityNotice: String(r.dataQualityNotice).slice(0, 1500),
        recommendationsText: String(r.recommendationsText).slice(0, 3000),
        limitationsAndBasis: String(r.limitationsAndBasis).slice(0, 1500),
        updatedAt: serverTimestamp(),
      };

      if (existingReport) {
        await updateDoc(doc(db, path, safeDocId), {
          modelUsed: payload.modelUsed,
          totalValue: payload.totalValue,
          totalCostBasis: payload.totalCostBasis,
          totalUnrealizedGain: payload.totalUnrealizedGain,
          totalReturnPct: payload.totalReturnPct,
          topHoldingTicker: payload.topHoldingTicker,
          topHoldingWeightPct: payload.topHoldingWeightPct,
          staleOrMissingCount: payload.staleOrMissingCount,
          executiveSummary: payload.executiveSummary,
          concentrationAnalysis: payload.concentrationAnalysis,
          dataQualityNotice: payload.dataQualityNotice,
          recommendationsText: payload.recommendationsText,
          limitationsAndBasis: payload.limitationsAndBasis,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, path, safeDocId), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      setActiveTab('agent');
    } catch (err: any) {
      setGlobalError(err.message || 'Failed to run or persist LangGraph analysis');
    } finally {
      setRunningAgent(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
          Initializing OAuth 2.0 session & portfolio ledger...
        </div>
      </div>
    );
  }

  // Unauthenticated Landing View (OAuth Sign-In Gate)
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
        {/* Strict 3-Zone Top Bar Contract */}
        <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0"
          >
            Meridian Portfolio Ledger
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#capabilities" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Multi-Account Ledger
            </a>
            <a href="#agent" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              LangGraph Agent
            </a>
            <a href="#mcp" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              MCP Protocol
            </a>
            <a href="#evaluation" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Evaluation Suite
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              onClick={handleSignIn}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In with Google OAuth
            </button>
          </div>
        </header>

        {/* Sub-Toolbar for Theme Selection on Landing */}
        <div className="bg-white/60 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 px-6 lg:px-10 py-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Institutional Equity Portfolio & Verified AI Advisory Platform</span>
          <button
            onClick={() => setDarkMode((d) => !d)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
            {darkMode ? 'Switch to Light Ledger' : 'Switch to Dark Terminal'}
          </button>
        </div>

        {/* Main Unauthenticated Hero & Architecture Summary */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-10 py-12 lg:py-16 space-y-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Elios Academy Forward Deployed Engineer Capstone</span>
                <span>·</span>
                <span>Python LangGraph</span>
                <span>·</span>
                <span>Groq LLM</span>
                <span>·</span>
                <span>Finnhub Market Data</span>
              </div>
              <h1
                className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-[1.12]"
                style={{ textWrap: 'balance' }}
              >
                Institutional multi-account portfolio tracking and verified AI advisory.
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                Consolidate shares of Alphabet, Apple, and custom equities purchased at different prices across taxable Investment and tax-advantaged Retirement accounts. Every valuation, weighted-average cost basis, and single-stock concentration metric is computed deterministically in Python before our LangGraph agent synthesizes recommendations.
              </p>

              {authError && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-800 dark:text-red-300">
                  {authError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <button
                  onClick={handleSignIn}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 text-sm font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-xl hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In with Google OAuth to Open Your Ledger
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-200 dark:border-slate-800 max-w-xl">
                <div>
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">100%</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Deterministic Python Math</div>
                </div>
                <div>
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">OAuth 2.0</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Per-User Tenant Isolation</div>
                </div>
                <div>
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">JSON-RPC</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Authenticated MCP Tools</div>
                </div>
              </div>
            </div>

            {/* Right Architectural Ledger Preview Card */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 lg:p-7 flex flex-col justify-between space-y-6">
              <div className="space-y-5">
                <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Client Brief Baseline Ledger</p>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      Combined Multi-Account Valuation
                    </h2>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-xl font-bold text-slate-900 dark:text-slate-50">$23,569.00</div>
                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">+$3,936.50 (+20.05%)</div>
                  </div>
                </div>

                {/* SVG Portfolio Trajectory Preview */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <span>6-Month Combined Equity Curve (GOOGL + AAPL)</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">+20.05% vs. Cost Basis</span>
                  </div>
                  <svg viewBox="0 0 400 72" className="w-full h-16 overflow-visible">
                    <polygon
                      points="0,68 0,54 80,44 160,40 240,28 320,18 400,8 400,68"
                      fill="rgba(16, 185, 129, 0.12)"
                    />
                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points="0,54 80,44 160,40 240,28 320,18 400,8"
                    />
                  </svg>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono">
                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-slate-100">GOOGL</span>
                      <span className="text-slate-500 dark:text-slate-400 ml-2 font-sans">65 sh · Brokerage & Roth IRA</span>
                    </div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">$11,999.00 (+21.42%)</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-slate-100">AAPL</span>
                      <span className="text-slate-500 dark:text-slate-400 ml-2 font-sans">50 sh · Brokerage & Roth IRA</span>
                    </div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">$11,570.00 (+18.67%)</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  One-Click Reviewer Onboarding
                </div>
                <p className="leading-relaxed">
                  Sign in with Google OAuth above, then click <strong>Load Client Brief Portfolio</strong> to populate the Alphabet and Apple holdings across Investment and Retirement accounts immediately.
                </p>
              </div>
            </div>
          </div>

          {/* 3-Column Pillar Strip */}
          <div id="capabilities" className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 border-t border-slate-200 dark:border-slate-800">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                01. Deterministic Cost-Basis & Finnhub Engine
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Computes exact lot values, combined multi-account positions, and unrealized gains in Python <code className="font-mono">Decimal</code>. Stores Finnhub price history and surfaces explicit staleness (&gt;15m) and rate-limit indicators (60 calls/min).
              </p>
            </div>
            <div id="agent" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                02. Managed LangGraph & Groq Portfolio Agent
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Runs scheduled monthly analyses and on-demand reviews powered by <code className="font-mono">llama-3.3-70b-versatile</code> on Groq. Identifies single-stock concentration (&ge;25%), tax-location tradeoffs, and missing/stale inputs with idempotent retry keys.
              </p>
            </div>
            <div id="mcp" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                03. Authenticated MCP Server & Evaluation Suite
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Exposes <code className="font-mono">get_portfolio_holdings</code>, <code className="font-mono">get_computed_metrics</code>, <code className="font-mono">get_latest_analysis</code>, and <code className="font-mono">upsert_holding</code> over JSON-RPC 2.0 (<code className="font-mono">/api/mcp</code>) with OAuth Bearer token verification.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Authenticated Application Workspace
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('overview');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0"
        >
          Meridian Portfolio Ledger
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          {(
            [
              ['overview', 'Portfolio'],
              ['holdings', 'Accounts & Lots'],
              ['research', 'Research'],
              ['agent', 'Agent Advisory'],
              ['mcp', 'MCP & Eval'],
            ] as const
          ).map(([tabKey, label]) => {
            const isCurrent =
              activeTab === tabKey || (tabKey === 'mcp' && activeTab === 'eval');
            return (
              <a
                key={tabKey}
                href={`#${tabKey}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab(tabKey);
                }}
                className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                  isCurrent
                    ? 'text-slate-900 dark:text-white font-semibold border-slate-900 dark:border-emerald-400'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-transparent'
                }`}
              >
                {label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Workspace Sub-Toolbar (User Identity, Mobile Nav, MCP/Eval Sub-Selector, Theme Switcher) */}
      <div className="bg-white dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 px-6 lg:px-10 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Signed in via Google OAuth:</span>
          <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{user.email}</span>
          <span>·</span>
          <span>Isolated Tenant UID:</span>
          <span className="font-mono text-slate-700 dark:text-slate-300">{user.uid.slice(0, 12)}...</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mobile Tab Switcher */}
          <div className="flex md:hidden items-center gap-1">
            {(
              [
                ['overview', 'Portfolio'],
                ['holdings', 'Holdings'],
                ['research', 'Research'],
                ['agent', 'Agent'],
                ['mcp', 'MCP'],
                ['eval', 'Eval'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setActiveTab(k)}
                className={`px-2 py-1 rounded text-xs font-medium ${
                  activeTab === k
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Sub-navigation when inside MCP & Eval section */}
          {(activeTab === 'mcp' || activeTab === 'eval') && (
            <div className="hidden md:flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                onClick={() => setActiveTab('mcp')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeTab === 'mcp'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                MCP Assistant Console
              </button>
              <button
                onClick={() => setActiveTab('eval')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeTab === 'eval'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Evaluation Suite & Handoff
              </button>
            </div>
          )}

          {/* Institutional Light / Dark Theme Switch */}
          <button
            onClick={() => setDarkMode((d) => !d)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
            {darkMode ? 'Light Ledger' : 'Dark Terminal'}
          </button>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-10 py-8 space-y-6">
        {globalError && (
          <div className="p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-800 dark:text-red-300 flex items-center justify-between">
            <span>{globalError}</span>
            <button
              onClick={() => setGlobalError(null)}
              className="font-semibold underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeTab === 'overview' && (
          <PortfolioOverview
            accounts={accounts}
            holdings={holdings}
            metrics={metrics}
            loadingMetrics={loadingMetrics}
            onRefreshQuotes={() => computeMetrics(holdings, true)}
            onSeedClientBrief={handleSeedClientBrief}
            onOpenHoldingsTab={() => setActiveTab('holdings')}
            onRunAgentOnDemand={() => handleRunAgent('ON_DEMAND')}
            seeding={seeding}
            runningAgent={runningAgent}
          />
        )}

        {activeTab === 'holdings' && (
          <AccountsAndHoldingsManager
            accounts={accounts}
            holdings={holdings}
            metrics={metrics}
            onCreateAccount={handleCreateAccount}
            onSaveHolding={handleSaveHolding}
            onDeleteHolding={handleDeleteHolding}
          />
        )}

        {activeTab === 'research' && (
          <ResearchView
            favorites={favorites}
            onAddFavorite={handleAddFavorite}
            onRemoveFavorite={handleRemoveFavorite}
            getIdToken={() => user.getIdToken()}
          />
        )}

        {activeTab === 'agent' && (
          <AgentAnalysisView
            analyses={analyses}
            metrics={metrics}
            runningAgent={runningAgent}
            onRunAgent={handleRunAgent}
          />
        )}

        {(activeTab === 'mcp' || activeTab === 'eval') && (
          <McpAndEvalView
            activeTab={activeTab}
            getIdToken={() => user.getIdToken()}
            userEmail={user.email || 'Authenticated User'}
            userId={user.uid}
          />
        )}
      </main>

      {/* Quiet Institutional Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-6 lg:px-10 py-4 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>
          Meridian Portfolio Ledger · Elios Academy Forward Deployed Engineer Capstone
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('mcp')}
            className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            MCP Connection Guide
          </button>
          <span>·</span>
          <button
            onClick={() => setActiveTab('eval')}
            className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            Evaluation Evidence & Model Swap Protocol
          </button>
        </div>
      </footer>
    </div>
  );
}
