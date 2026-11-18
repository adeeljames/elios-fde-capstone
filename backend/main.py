"""
Meridian Portfolio Ledger — FastAPI Application (`backend/main.py`)
Elios Academy Forward Deployed Engineer Capstone

Exposes REST and MCP JSON-RPC 2.0 endpoints in Python (compatible with Vercel Python Serverless & Uvicorn):
- GET  /api/health
- POST /api/portfolio/compute
- POST /api/agent/analyze
- GET  /api/market/research/{ticker}
- POST /api/holdings/validate
- GET  /api/mcp (MCP Server Discovery & SSE endpoint)
- POST /api/mcp (Model Context Protocol JSON-RPC 2.0 server endpoint)
"""

import os
from fastapi import FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from typing import Any, Dict, Optional

from backend.cli_bridge import handle_action
from backend.mcp_server import (
    handle_mcp_jsonrpc,
    verify_firebase_oauth_token,
    MCP_TOOLS_MANIFEST,
    MCP_RESOURCES_MANIFEST,
    MCP_PROMPTS_MANIFEST,
)

app = FastAPI(
    title="Meridian Portfolio Ledger — Python LangGraph & MCP Backend",
    version="1.0.0",
    description="Elios Academy Forward Deployed Engineer Capstone Backend",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Mcp-Session-Id", "X-Requested-With"],
    expose_headers=["Mcp-Session-Id"],
)


@app.get("/api/health")
async def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "backend": "Python 3.10+ LangGraph + Finnhub + MCP Server",
        "database": (
            "Neon Serverless PostgreSQL + Firestore"
            if os.environ.get("NEON_DATABASE_URL")
            else "Firestore Enterprise + SQLite Price History"
        ),
        "llmModel": "Groq llama-3.3-70b-versatile",
        "mcpEndpoint": "/api/mcp",
    }


@app.post("/api/portfolio/compute")
async def compute_portfolio(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> JSONResponse:
    try:
        uid, _ = verify_firebase_oauth_token(authorization or "")
        payload = await request.json()
        holdings = payload.get("holdings") if isinstance(payload.get("holdings"), list) else []
        scoped_holdings = [
            h for h in holdings if not h.get("userId") or h.get("userId") == uid
        ]
        res = handle_action(
            {
                "action": "compute_portfolio",
                "holdings": scoped_holdings,
                "forceRefresh": bool(payload.get("forceRefresh", False)),
            }
        )
        if not res.get("ok"):
            return JSONResponse(status_code=400, content={"error": res.get("error", "Calculation failed")})
        return JSONResponse(status_code=200, content=res)
    except PermissionError as exc:
        return JSONResponse(status_code=401, content={"error": str(exc)})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.post("/api/agent/analyze")
async def analyze_portfolio(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> JSONResponse:
    try:
        uid, _ = verify_firebase_oauth_token(authorization or "")
        payload = await request.json()
        trigger_type = "MONTHLY" if payload.get("triggerType") == "MONTHLY" else "ON_DEMAND"
        holdings = payload.get("holdings") if isinstance(payload.get("holdings"), list) else []
        scoped_holdings = [
            h for h in holdings if not h.get("userId") or h.get("userId") == uid
        ]
        res = handle_action(
            {
                "action": "run_agent",
                "userId": uid,
                "triggerType": trigger_type,
                "holdings": scoped_holdings,
                "forceRefresh": bool(payload.get("forceRefresh", False)),
            }
        )
        if not res.get("ok"):
            return JSONResponse(status_code=400, content={"error": res.get("error", "Agent execution failed")})
        return JSONResponse(status_code=200, content=res)
    except PermissionError as exc:
        return JSONResponse(status_code=401, content={"error": str(exc)})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.get("/api/market/research/{ticker}")
async def research_ticker(
    ticker: str,
    refresh: bool = False,
    authorization: Optional[str] = Header(default=None),
) -> JSONResponse:
    try:
        verify_firebase_oauth_token(authorization or "")
        res = handle_action(
            {
                "action": "research_ticker",
                "ticker": ticker.upper().strip(),
                "forceRefresh": refresh,
            }
        )
        if not res.get("ok"):
            return JSONResponse(status_code=400, content={"error": res.get("error", "Failed to fetch research data")})
        return JSONResponse(status_code=200, content=res)
    except PermissionError as exc:
        return JSONResponse(status_code=401, content={"error": str(exc)})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.post("/api/holdings/validate")
async def validate_holding_endpoint(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> JSONResponse:
    try:
        verify_firebase_oauth_token(authorization or "")
        payload = await request.json()
        res = handle_action({"action": "validate_holding", "input": payload or {}})
        status_code = 200 if res.get("ok") else 400
        return JSONResponse(status_code=status_code, content=res)
    except PermissionError as exc:
        return JSONResponse(status_code=401, content={"ok": False, "error": str(exc)})
    except Exception as exc:
        return JSONResponse(status_code=400, content={"ok": False, "error": str(exc)})


@app.get("/api/mcp")
async def mcp_discovery(request: Request) -> Response:
    accept_header = request.headers.get("accept", "")
    if "text/event-stream" in accept_header:
        return Response(
            content="event: endpoint\ndata: /api/mcp\n\n",
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )
    return JSONResponse(
        status_code=200,
        content={
            "name": "meridian-portfolio-mcp-python",
            "version": "1.0.0",
            "protocolVersion": "2024-11-05",
            "transport": "Streamable HTTP JSON-RPC 2.0 (POST /api/mcp) & Python Stdio (python3 -m backend.mcp_server)",
            "authentication": "OAuth 2.0 Bearer Token required in Authorization header",
            "tools": MCP_TOOLS_MANIFEST,
            "resources": MCP_RESOURCES_MANIFEST,
            "prompts": MCP_PROMPTS_MANIFEST,
        },
    )


@app.post("/api/mcp")
async def mcp_jsonrpc_endpoint(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> JSONResponse:
    body = await request.json()
    status_code, rpc_resp = handle_mcp_jsonrpc(
        rpc_request=body,
        id_token=authorization or "",
    )
    return JSONResponse(status_code=status_code, content=rpc_resp)
