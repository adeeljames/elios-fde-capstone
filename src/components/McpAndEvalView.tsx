import React from 'react';
import {
  Play,
  Copy,
  Check,
  ShieldCheck,
  KeyRound,
  AlertCircle,
  Terminal,
  CheckCircle2,
} from 'lucide-react';

interface McpAndEvalViewProps {
  activeTab: 'mcp' | 'eval';
  getIdToken: () => Promise<string>;
  userEmail: string;
  userId: string;
}

export function McpAndEvalView({
  activeTab,
  getIdToken,
  userEmail,
  userId,
}: McpAndEvalViewProps) {
  const [mcpTool, setMcpTool] = React.useState<
    'get_portfolio_holdings' | 'get_computed_metrics' | 'get_latest_analysis' | 'upsert_holding'
  >('get_computed_metrics');
  const [mcpAccountFilter, setMcpAccountFilter] = React.useState<'ALL' | 'INVESTMENT' | 'RETIREMENT'>('ALL');
  const [mcpTicker, setMcpTicker] = React.useState('GOOGL');
  const [mcpShares, setMcpShares] = React.useState('35');
  const [mcpPrice, setMcpPrice] = React.useState('162.50');
  const [mcpAccountName, setMcpAccountName] = React.useState('Individual Brokerage');
  const [mcpAccountType, setMcpAccountType] = React.useState<'INVESTMENT' | 'RETIREMENT'>('INVESTMENT');
  const [mcpPurchaseDate, setMcpPurchaseDate] = React.useState('2026-03-15');
  const [mcpNotes, setMcpNotes] = React.useState('Added via authenticated MCP upsert_holding tool');
  const [mcpResponse, setMcpResponse] = React.useState<string>('');
  const [mcpParsedContent, setMcpParsedContent] = React.useState<string>('');
  const [mcpLoading, setMcpLoading] = React.useState(false);
  const [mcpError, setMcpError] = React.useState<string | null>(null);
  const [handshakeStatus, setHandshakeStatus] = React.useState<string>('Ready');
  const [copiedToken, setCopiedToken] = React.useState(false);
  const [copiedConfig, setCopiedConfig] = React.useState(false);
  const [copiedStdio, setCopiedStdio] = React.useState(false);

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const handleCopyToken = async () => {
    try {
      const token = await getIdToken();
      await navigator.clipboard.writeText(token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2500);
    } catch (err) {
      console.error(err);
    }
  };

  const mcpConfigJson = JSON.stringify(
    {
      mcpServers: {
        'meridian-portfolio-http': {
          url: `${appOrigin}/api/mcp`,
          headers: {
            Authorization: 'Bearer <YOUR_OAUTH_ID_TOKEN>',
          },
        },
      },
    },
    null,
    2
  );

  const mcpStdioConfigJson = JSON.stringify(
    {
      mcpServers: {
        'meridian-portfolio-stdio': {
          command: 'python3',
          args: ['-m', 'backend.mcp_server'],
          env: {
            MCP_OAUTH_BEARER_TOKEN: '<YOUR_OAUTH_ID_TOKEN>',
          },
        },
      },
    },
    null,
    2
  );

  const handleCopyConfig = async () => {
    await navigator.clipboard.writeText(mcpConfigJson);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2500);
  };

  const handleCopyStdio = async () => {
    await navigator.clipboard.writeText(mcpStdioConfigJson);
    setCopiedStdio(true);
    setTimeout(() => setCopiedStdio(false), 2500);
  };

  const executeMcpLifecycleMethod = async (methodName: 'initialize' | 'tools/list') => {
    setMcpLoading(true);
    setMcpError(null);
    setMcpParsedContent('');
    try {
      const token = await getIdToken();
      const rpcPayload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: methodName,
        params:
          methodName === 'initialize'
            ? {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'meridian-web-inspector', version: '1.0.0' },
              }
            : {},
      };

      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(rpcPayload),
      });

      const data = await res.json();
      setMcpResponse(JSON.stringify(data, null, 2));
      if (!res.ok || data.error) {
        setMcpError(data.error?.message || 'MCP handshake returned an error');
        setHandshakeStatus('Error');
      } else {
        setHandshakeStatus(`Verified (${methodName} · 200 OK)`);
      }
    } catch (err: any) {
      setMcpError(err.message || 'Failed to invoke MCP endpoint');
      setHandshakeStatus('Error');
    } finally {
      setMcpLoading(false);
    }
  };

  const executeMcpCall = async (overrideArgs?: Record<string, unknown>, simulateUnauth = false) => {
    setMcpLoading(true);
    setMcpError(null);
    setMcpParsedContent('');
    try {
      const token = simulateUnauth ? 'invalid_spoofed_token' : await getIdToken();
      let args: Record<string, unknown> = {};
      if (mcpTool === 'get_portfolio_holdings') {
        args = { accountType: mcpAccountFilter };
      } else if (mcpTool === 'upsert_holding') {
        args = overrideArgs || {
          accountName: mcpAccountName,
          accountType: mcpAccountType,
          ticker: mcpTicker,
          shares: Number(mcpShares),
          purchasePrice: Number(mcpPrice),
          purchaseDate: mcpPurchaseDate,
          notes: mcpNotes,
        };
      }

      const rpcPayload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: mcpTool,
          arguments: args,
        },
      };

      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(rpcPayload),
      });

      const data = await res.json();
      setMcpResponse(JSON.stringify(data, null, 2));
      const innerText = data?.result?.content?.[0]?.text;
      if (typeof innerText === 'string') {
        setMcpParsedContent(innerText);
      }
      if (!res.ok || data.error) {
        setMcpError(data.error?.message || 'MCP request returned an error');
        setHandshakeStatus(simulateUnauth ? 'Rejected Unauthenticated (401)' : 'Validation Guard Triggered');
      } else {
        setHandshakeStatus(`Verified (${mcpTool} · 200 OK)`);
      }
    } catch (err: any) {
      setMcpError(err.message || 'Failed to invoke MCP endpoint');
    } finally {
      setMcpLoading(false);
    }
  };

  if (activeTab === 'mcp') {
    return (
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Model Context Protocol · JSON-RPC 2.0 Server · Python Backend (`backend/mcp_server.py`)
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
              MCP Assistant Integration & Live Tool Inspector
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => executeMcpLifecycleMethod('initialize')}
              disabled={mcpLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Test Handshake (`initialize`)
            </button>
            <button
              onClick={() => executeMcpLifecycleMethod('tools/list')}
              disabled={mcpLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Inspect Schema (`tools/list`)
            </button>
            <button
              onClick={handleCopyToken}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedToken ? <Check className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5" />}
              {copiedToken ? 'OAuth Bearer Token Copied' : 'Copy My OAuth Bearer Token'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Interactive MCP Client */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Interactive MCP Client Console
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Authenticated as <span className="font-mono text-slate-700 dark:text-slate-300">{userEmail}</span> · Scoped UID{' '}
                  <span className="font-mono text-slate-700 dark:text-slate-300">{userId.slice(0, 10)}...</span>
                </p>
              </div>
              <div className="text-right font-mono text-xs">
                <div className="text-slate-700 dark:text-slate-200 font-semibold">POST /api/mcp</div>
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400">{handshakeStatus}</div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Select Authorized MCP Tool (`tools/call`)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(
                  [
                    ['get_computed_metrics', '1. Computed Metrics'],
                    ['get_portfolio_holdings', '2. Get Holdings'],
                    ['get_latest_analysis', '3. Latest Analysis'],
                    ['upsert_holding', '4. Upsert Holding'],
                  ] as const
                ).map(([toolId, label]) => (
                  <button
                    key={toolId}
                    onClick={() => setMcpTool(toolId)}
                    className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      mcpTool === toolId
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {mcpTool === 'get_portfolio_holdings' && (
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Account Category Filter (<code className="font-mono">accountType</code>)
                </label>
                <div className="flex items-center gap-2">
                  {(['ALL', 'INVESTMENT', 'RETIREMENT'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setMcpAccountFilter(type)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                        mcpAccountFilter === type
                          ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mcpTool === 'upsert_holding' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Account Name
                  </label>
                  <input
                    type="text"
                    value={mcpAccountName}
                    onChange={(e) => setMcpAccountName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Account Type
                  </label>
                  <select
                    value={mcpAccountType}
                    onChange={(e) => setMcpAccountType(e.target.value as 'INVESTMENT' | 'RETIREMENT')}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    <option value="INVESTMENT">INVESTMENT (Taxable Brokerage)</option>
                    <option value="RETIREMENT">RETIREMENT (IRA / 401k)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Ticker Symbol
                  </label>
                  <input
                    type="text"
                    value={mcpTicker}
                    onChange={(e) => setMcpTicker(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Shares Quantity
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={mcpShares}
                    onChange={(e) => setMcpShares(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Purchase Price (USD)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={mcpPrice}
                    onChange={(e) => setMcpPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Purchase Date (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    value={mcpPurchaseDate}
                    onChange={(e) => setMcpPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => executeMcpCall()}
                disabled={mcpLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                {mcpLoading ? 'Executing JSON-RPC Call...' : `Invoke ${mcpTool}`}
              </button>

              <button
                onClick={() => executeMcpCall(undefined, true)}
                disabled={mcpLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Test Unauthenticated Reject (401)
              </button>

              {mcpTool === 'upsert_holding' && (
                <button
                  onClick={() =>
                    executeMcpCall({
                      accountName: 'Individual Brokerage',
                      accountType: 'INVESTMENT',
                      ticker: 'INVALID$$$',
                      shares: -10,
                      purchasePrice: 0,
                      purchaseDate: '2026-03-15',
                    })
                  }
                  disabled={mcpLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  Test Invalid Input Guard
                </button>
              )}
            </div>

            {mcpError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-800 dark:text-red-300">
                <span className="font-semibold">MCP Validation / Access Guard: </span>
                {mcpError}
              </div>
            )}

            {mcpParsedContent && !mcpError && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  <span>Decoded MCP Tool Output (`result.content[0].text`)</span>
                  <span className="font-mono">isError: false</span>
                </div>
                <pre className="p-4 bg-slate-950 text-emerald-300 border border-emerald-900/60 rounded-xl text-xs font-mono overflow-x-auto max-h-72 leading-relaxed">
                  {mcpParsedContent}
                </pre>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Raw JSON-RPC 2.0 Envelope</span>
                <span className="font-mono">protocolVersion: 2024-11-05</span>
              </div>
              <pre className="p-4 bg-slate-950 text-slate-100 border border-slate-800 rounded-xl text-xs font-mono overflow-x-auto max-h-80 leading-relaxed">
                {mcpResponse ||
                  '// Click "Invoke" or "Test Handshake" above to execute a live authenticated JSON-RPC 2.0 MCP call against your portfolio.'}
              </pre>
            </div>
          </div>

          {/* Right Column: Connection Instructions */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                External MCP Client Connection Guide
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Connect Claude Desktop, Cursor, or the official MCP Inspector via HTTP JSON-RPC 2.0 or Python <code className="font-mono">stdio</code>. Every request verifies your Google OAuth 2.0 Bearer token and isolates data to your user UID.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  1. Streamable HTTP MCP Config (`/api/mcp`)
                </span>
                <button
                  onClick={handleCopyConfig}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  {copiedConfig ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedConfig ? 'Copied' : 'Copy JSON'}
                </button>
              </div>
              <pre className="p-3.5 bg-slate-950 text-slate-100 border border-slate-800 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
                {mcpConfigJson}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  2. Python Stdio MCP Config (`backend.mcp_server`)
                </span>
                <button
                  onClick={handleCopyStdio}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  {copiedStdio ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedStdio ? 'Copied' : 'Copy JSON'}
                </button>
              </div>
              <pre className="p-3.5 bg-slate-950 text-slate-100 border border-slate-800 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
                {mcpStdioConfigJson}
              </pre>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                3. Direct cURL / CLI Verification
              </span>
              <pre className="p-3.5 bg-slate-950 text-slate-100 border border-slate-800 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
{`curl -X POST "${appOrigin}/api/mcp" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_OAUTH_ID_TOKEN>" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_computed_metrics",
      "arguments": {}
    }
  }'`}
              </pre>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Access Control & Idempotency Guarantees</h3>
              <ul className="space-y-1.5 list-disc pl-4">
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">OAuth 2.0 Bearer Enforcement:</strong> Every MCP call verifies the Firebase ID token signature and executes Firestore REST v1 queries/commits authenticated with your Bearer token.
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">Input Validation:</strong> <code className="font-mono">upsert_holding</code> rejects negative share quantities, zero/negative purchase prices, malformed tickers, and invalid account types before touching storage.
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">Retry Safety:</strong> Repeating an identical <code className="font-mono">upsert_holding</code> call updates the existing tax lot rather than creating duplicate holdings.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Elios Capstone Verification · LangGraph & Groq Evaluation Evidence · Model Swap Protocol
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
          Evaluation Suite, Architecture Tradeoffs & Operational Handoff
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Agent Runtime & Model Configuration</p>
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100 font-mono">
            groq/llama-3.3-70b-versatile
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Orchestrated via Python LangGraph <code className="font-mono">StateGraph</code> with <code className="font-mono">temperature=0.1</code> and strict JSON schema output. All arithmetic is pre-computed in Python <code className="font-mono">Decimal</code> before synthesis.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Market Data & Refresh Limits</p>
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100 font-mono">
            Finnhub REST v1 (60 req/min)
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Quotes are cached for 5 minutes in SQLite/Neon <code className="font-mono">market_quotes</code> and appended to <code className="font-mono">price_history</code>. Quotes older than 15 minutes are marked <code className="font-mono">STALE</code>; unknown tickers fall back to cost basis.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Idempotency & Retry Protection</p>
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100 font-mono">
            SHA-256 Period Fingerprinting
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Monthly runs key on <code className="font-mono">YYYY-MM-MONTHLY</code>; on-demand reviews key on a deterministic portfolio state hash so repeated clicks update in-place without duplicate history.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Documented Evaluation Suite (Actual Portfolio Cases, Expected vs. Observed Results)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Distinguishing deterministic numerical correctness (100% verified in Python code) from qualitative recommendation judgment.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th className="py-3 px-4">Eval Case</th>
                <th className="py-3 px-4">Portfolio & Market Inputs</th>
                <th className="py-3 px-4">Expected Conclusion & Basis</th>
                <th className="py-3 px-4">Observed Agent Result & Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs text-slate-700 dark:text-slate-300 align-top">
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  Case 1: Client Brief Baseline
                  <div className="font-normal text-slate-500 dark:text-slate-400 mt-0.5">Multi-Account AAPL & GOOGL</div>
                </td>
                <td className="py-3.5 px-4 font-mono text-[11px]">
                  Brokerage: 25 GOOGL @ $142.50, 30 AAPL @ $185.00
                  <br />
                  Roth IRA: 40 GOOGL @ $158.00, 20 AAPL @ $210.00
                  <br />
                  Quotes: GOOGL $184.60, AAPL $231.40
                </td>
                <td className="py-3.5 px-4">
                  Must compute exact combined value ($23,569.00), cost basis ($19,632.50), gain (+$3,936.50 / +20.05%), flag both GOOGL (50.91%) and AAPL (49.09%) for &gt;25% concentration, and recommend directing new Roth IRA contributions to broad index ETFs.
                </td>
                <td className="py-3.5 px-4">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">PASS:</span> Cited exact $23,569.00 value and weighted-average cost bases ($152.04 GOOGL, $195.00 AAPL). Correctly advised rebalancing inside the Roth IRA first to avoid taxable capital gains.
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  Case 2: Extreme Single-Stock Risk
                  <div className="font-normal text-slate-500 dark:text-slate-400 mt-0.5">86% NVDA Concentration</div>
                </td>
                <td className="py-3.5 px-4 font-mono text-[11px]">
                  Brokerage: 150 NVDA @ $95.00 ($20,775 MV)
                  <br />
                  Roth IRA: 10 VTI @ $280.00 ($2,917.50 MV)
                  <br />
                  Total MV: $23,692.50
                </td>
                <td className="py-3.5 px-4">
                  Must identify NVDA at 87.69% portfolio weight vs. VTI at 12.31%, explain semiconductor drawdown exposure, and avoid recommending unauthorized trade execution.
                </td>
                <td className="py-3.5 px-4">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">PASS:</span> Flagged 87.69% single-stock weight in NVDA, noted unrealized gain of +$6,525.00 (+45.79%) in taxable account, and clearly stated trade execution is outside scope.
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  Case 3: Stale & Missing Market Data
                  <div className="font-normal text-slate-500 dark:text-slate-400 mt-0.5">Delisted / Unrecognized Ticker</div>
                </td>
                <td className="py-3.5 px-4 font-mono text-[11px]">
                  Brokerage: 25 GOOGL @ $142.50
                  <br />
                  Brokerage: 50 ACMECORP @ $40.00 (Quote Unavailable)
                </td>
                <td className="py-3.5 px-4">
                  Must value ACMECORP deterministically at $2,000.00 cost-basis fallback, explicitly warn the user in <code className="font-mono">dataQualityNotice</code> that ACMECORP quote is unavailable, and refrain from fabricating a price.
                </td>
                <td className="py-3.5 px-4">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">PASS:</span> Zero hallucinated prices. Reported <code className="font-mono">staleOrMissingCount: 1</code> and instructed user to verify ticker symbol before acting on weight percentages.
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  Case 4: Empty Portfolio Guard
                  <div className="font-normal text-slate-500 dark:text-slate-400 mt-0.5">Zero Holdings</div>
                </td>
                <td className="py-3.5 px-4 font-mono text-[11px]">
                  0 accounts, 0 holdings ($0.00 total value)
                </td>
                <td className="py-3.5 px-4">
                  Must short-circuit LLM speculation, report $0.00 across all metrics, and guide the user to add their first holding.
                </td>
                <td className="py-3.5 px-4">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">PASS:</span> Deterministic guard node handled empty state cleanly without division-by-zero or fabricated commentary.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Model Swap Validation Protocol: &ldquo;If we changed models tomorrow, how would we know the agent still works?&rdquo;
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <div className="space-y-1.5">
            <p className="font-semibold text-slate-900 dark:text-slate-100">1. Cases We Rerun (`evals/run_evals.py`)</p>
            <p>
              We execute all 4 canonical fixtures in <code className="font-mono">evals/run_evals.py</code> (Multi-Account AAPL/GOOGL, 87% Concentrated NVDA, Unavailable Ticker Fallback, and Empty Portfolio) against the candidate model at <code className="font-mono">temperature=0.1</code>.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="font-semibold text-slate-900 dark:text-slate-100">2. How We Compare Results</p>
            <p>
              First, deterministic invariants check that every dollar figure and percentage in the candidate output matches Python&apos;s <code className="font-mono">compute_portfolio_metrics</code> output to 2 decimal places. Second, qualitative rubrics check concentration warnings, tax-location reasoning (IRA vs. Taxable), and stale-data disclosure.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="font-semibold text-slate-900 dark:text-slate-100">3. Acceptance & Rejection Criteria</p>
            <p>
              We <strong className="text-slate-900 dark:text-slate-100">reject</strong> any model that hallucinates a single number, omits a stale/unavailable data warning, suggests trade execution, or fails JSON schema validation. We <strong className="text-slate-900 dark:text-slate-100">accept</strong> a model only when it achieves 100% numerical grounding across all 4 eval cases and latency remains under 8 seconds.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
