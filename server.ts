import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { verifyBearerToken, extractRawBearerToken } from './src/lib/firebase-admin.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runPythonBridge(payload: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', ['-m', 'backend.cli_bridge'], {
      cwd: __dirname,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    py.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    py.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(`Python backend bridge failed (${code}): ${stderr}`));
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Invalid JSON from Python backend: ${stdout || stderr}`));
      }
    });

    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();
  });
}

function setMcpCorsHeaders(res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Accept, Mcp-Session-Id, X-Requested-With'
  );
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  // Global CORS preflight support for API & MCP endpoints
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    setMcpCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // 1. Health & Architecture Info
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      backend: 'Python 3.10 LangGraph + Finnhub + MCP Server',
      database: process.env.NEON_DATABASE_URL
        ? 'Neon Serverless PostgreSQL + Firestore'
        : 'Firestore Enterprise + SQLite Price History',
      llmModel: 'Groq llama-3.3-70b-versatile',
      mcpEndpoint: '/api/mcp',
    });
  });

  // 2. Compute Deterministic Portfolio Metrics & Quotes (Python Engine)
  app.post('/api/portfolio/compute', async (req: Request, res: Response) => {
    try {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const holdings = Array.isArray(req.body?.holdings) ? req.body.holdings : [];
      const forceRefresh = Boolean(req.body?.forceRefresh);

      // Filter holdings strictly to authenticated user
      const scopedHoldings = holdings.filter(
        (h: any) => !h.userId || h.userId === decoded.uid
      );

      const pyResult = await runPythonBridge({
        action: 'compute_portfolio',
        holdings: scopedHoldings,
        forceRefresh,
      });

      if (!pyResult.ok) {
        return res.status(400).json({ error: pyResult.error || 'Calculation failed' });
      }
      return res.json(pyResult);
    } catch (err: any) {
      const status = String(err.message).startsWith('Unauthorized') ? 401 : 500;
      return res.status(status).json({ error: err.message || 'Failed to compute portfolio metrics' });
    }
  });

  // 3. Run LangGraph Portfolio Analysis Agent (Monthly or On-Demand)
  app.post('/api/agent/analyze', async (req: Request, res: Response) => {
    try {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const triggerType = req.body?.triggerType === 'MONTHLY' ? 'MONTHLY' : 'ON_DEMAND';
      const holdings = Array.isArray(req.body?.holdings) ? req.body.holdings : [];
      const forceRefresh = Boolean(req.body?.forceRefresh);

      const scopedHoldings = holdings.filter(
        (h: any) => !h.userId || h.userId === decoded.uid
      );

      const pyResult = await runPythonBridge({
        action: 'run_agent',
        userId: decoded.uid,
        triggerType,
        holdings: scopedHoldings,
        forceRefresh,
      });

      if (!pyResult.ok) {
        return res.status(400).json({ error: pyResult.error || 'Agent analysis failed' });
      }

      return res.json(pyResult);
    } catch (err: any) {
      const status = String(err.message).startsWith('Unauthorized') ? 401 : 500;
      return res.status(status).json({ error: err.message || 'Failed to execute LangGraph agent' });
    }
  });

  // 4. Market Data & Stock Research Lookup (Finnhub + Price History)
  app.get('/api/market/research/:ticker', async (req: Request, res: Response) => {
    try {
      await verifyBearerToken(req.headers.authorization);
      const ticker = String(req.params.ticker || 'GOOGL').toUpperCase().trim();
      const forceRefresh = req.query.refresh === 'true';

      const pyResult = await runPythonBridge({
        action: 'research_ticker',
        ticker,
        forceRefresh,
      });

      if (!pyResult.ok) {
        return res.status(400).json({ error: pyResult.error || 'Failed to fetch research data' });
      }
      return res.json(pyResult);
    } catch (err: any) {
      const status = String(err.message).startsWith('Unauthorized') ? 401 : 500;
      return res.status(status).json({ error: err.message || 'Failed to inspect ticker' });
    }
  });

  // 5. Validate Holding Input via Python MCP Validator
  app.post('/api/holdings/validate', async (req: Request, res: Response) => {
    try {
      await verifyBearerToken(req.headers.authorization);
      const pyResult = await runPythonBridge({
        action: 'validate_holding',
        input: req.body || {},
      });
      if (!pyResult.ok) {
        return res.status(400).json({ ok: false, error: pyResult.error });
      }
      return res.json(pyResult);
    } catch (err: any) {
      const status = String(err.message).startsWith('Unauthorized') ? 401 : 400;
      return res.status(status).json({ ok: false, error: err.message });
    }
  });

  // 6a. Model Context Protocol (MCP) Discovery & SSE Handshake Endpoint (`GET /api/mcp`)
  app.get('/api/mcp', async (req: Request, res: Response) => {
    const acceptHeader = String(req.headers.accept || '');
    if (acceptHeader.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`event: endpoint\ndata: /api/mcp\n\n`);
      return;
    }

    try {
      const manifest = await runPythonBridge({ action: 'mcp_manifest' });
      return res.json({
        name: 'meridian-portfolio-mcp-python',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        transport: 'Streamable HTTP JSON-RPC 2.0 (POST /api/mcp) & Python Stdio (python3 -m backend.mcp_server)',
        authentication: 'OAuth 2.0 Bearer Token required in Authorization header',
        tools: manifest.tools || [],
        resources: manifest.resources || [],
        prompts: manifest.prompts || [],
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to load MCP manifest' });
    }
  });

  // 6b. Model Context Protocol (MCP) JSON-RPC 2.0 Server Endpoint (`POST /api/mcp`)
  // Executed natively in Python (`backend/mcp_server.py`) with OAuth 2.0 Bearer verification
  // and authenticated Cloud Firestore REST API v1 tenant-isolated operations.
  app.post('/api/mcp', async (req: Request, res: Response) => {
    const rpcId = req.body?.id ?? 1;
    const rawToken = extractRawBearerToken(req.headers.authorization);

    try {
      const decoded = await verifyBearerToken(req.headers.authorization);

      const pyResult = await runPythonBridge({
        action: 'mcp_rpc',
        idToken: rawToken,
        userId: decoded.uid,
        userEmail: decoded.email || decoded.uid,
        rpcRequest: req.body || {},
      });

      const statusCode = Number(pyResult?.statusCode) || 200;
      const rpcResponse = pyResult?.rpcResponse || {
        jsonrpc: '2.0',
        id: rpcId,
        error: {
          code: -32603,
          message: pyResult?.error || 'Internal Python MCP bridge error',
        },
      };

      return res.status(statusCode).json(rpcResponse);
    } catch (err: any) {
      const isAuthErr = String(err.message).startsWith('Unauthorized');
      return res.status(isAuthErr ? 401 : 400).json({
        jsonrpc: '2.0',
        id: rpcId,
        error: {
          code: isAuthErr ? -32001 : -32602,
          message: err.message || 'MCP execution error',
        },
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Meridian Portfolio Ledger running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
