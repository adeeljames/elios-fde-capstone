"""
Meridian Portfolio Ledger — Python CLI & Subprocess Bridge (`backend/cli_bridge.py`)
Elios Academy Forward Deployed Engineer Capstone

Allows the Node/Express gateway (or standalone Python FastAPI server) to invoke
the Python deterministic calculation engine, Finnhub quote & price-history manager,
LangGraph Groq agent workflow, and full Python MCP JSON-RPC 2.0 server directly via JSON stdin/stdout.
"""

import sys
import json
from typing import Any, Dict

from backend.database import init_db
from backend.market_data import fetch_quote_for_ticker, PROVIDER_LIMITS_INFO, KNOWN_SECURITIES
from backend.calculations import compute_portfolio_metrics, CALCULATION_ASSUMPTIONS
from backend.agent import run_langgraph_portfolio_agent
from backend.mcp_server import (
    MCP_TOOLS_MANIFEST,
    MCP_RESOURCES_MANIFEST,
    MCP_PROMPTS_MANIFEST,
    validate_upsert_holding_input,
    handle_mcp_jsonrpc,
)


def handle_action(payload: Dict[str, Any]) -> Dict[str, Any]:
    action = payload.get("action", "")
    init_db()

    if action == "fetch_quotes":
        tickers = payload.get("tickers", [])
        force_refresh = bool(payload.get("forceRefresh", False))
        quotes: Dict[str, Dict[str, Any]] = {}
        for t in tickers:
            sym = str(t).upper().strip()
            if sym:
                quotes[sym] = fetch_quote_for_ticker(sym, force_refresh=force_refresh)
        return {
            "ok": True,
            "quotes": quotes,
            "providerLimits": PROVIDER_LIMITS_INFO,
        }

    if action == "compute_portfolio":
        holdings = payload.get("holdings", [])
        force_refresh = bool(payload.get("forceRefresh", False))
        tickers = sorted(
            list({str(h.get("ticker", "")).upper().strip() for h in holdings if h.get("ticker")})
        )
        quotes: Dict[str, Dict[str, Any]] = {}
        for sym in tickers:
            quotes[sym] = fetch_quote_for_ticker(sym, force_refresh=force_refresh)
        metrics = compute_portfolio_metrics(holdings, quotes)
        return {
            "ok": True,
            "metrics": metrics,
            "quotes": quotes,
            "providerLimits": PROVIDER_LIMITS_INFO,
        }

    if action == "run_agent":
        user_id = str(payload.get("userId", "")).strip()
        if not user_id:
            return {"ok": False, "error": "Unauthorized: userId is required to run portfolio agent."}
        trigger_type = str(payload.get("triggerType", "ON_DEMAND")).upper().strip()
        holdings = payload.get("holdings", [])
        force_refresh = bool(payload.get("forceRefresh", False))
        tickers = sorted(
            list({str(h.get("ticker", "")).upper().strip() for h in holdings if h.get("ticker")})
        )
        quotes: Dict[str, Dict[str, Any]] = {}
        for sym in tickers:
            quotes[sym] = fetch_quote_for_ticker(sym, force_refresh=force_refresh)
        metrics = compute_portfolio_metrics(holdings, quotes)
        report = run_langgraph_portfolio_agent(
            user_id=user_id,
            trigger_type=trigger_type,
            holdings=holdings,
            quotes=quotes,
            metrics=metrics,
        )
        return {
            "ok": True,
            "report": report,
            "metrics": metrics,
            "quotes": quotes,
        }

    if action == "validate_holding":
        try:
            validated = validate_upsert_holding_input(payload.get("input", {}))
            return {"ok": True, "validated": validated}
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}

    if action == "research_ticker":
        ticker = str(payload.get("ticker", "GOOGL")).upper().strip()
        force_refresh = bool(payload.get("forceRefresh", False))
        quote = fetch_quote_for_ticker(ticker, force_refresh=force_refresh)
        return {
            "ok": True,
            "quote": quote,
            "providerLimits": PROVIDER_LIMITS_INFO,
            "knownTickers": list(KNOWN_SECURITIES.keys()),
        }

    if action == "mcp_manifest":
        return {
            "ok": True,
            "tools": MCP_TOOLS_MANIFEST,
            "resources": MCP_RESOURCES_MANIFEST,
            "prompts": MCP_PROMPTS_MANIFEST,
            "assumptions": CALCULATION_ASSUMPTIONS,
            "providerLimits": PROVIDER_LIMITS_INFO,
        }

    if action == "mcp_rpc":
        rpc_req = payload.get("rpcRequest") or {}
        id_token = str(payload.get("idToken") or "")
        verified_uid = payload.get("userId")
        verified_email = payload.get("userEmail")
        status_code, rpc_resp = handle_mcp_jsonrpc(
            rpc_request=rpc_req,
            id_token=id_token,
            verified_user_id=verified_uid,
            verified_email=verified_email,
        )
        return {
            "ok": status_code == 200,
            "statusCode": status_code,
            "rpcResponse": rpc_resp,
        }

    return {"ok": False, "error": f"Unknown action: {action}"}


if __name__ == "__main__":
    try:
        raw_in = sys.stdin.read()
        data = json.loads(raw_in) if raw_in.strip() else {}
        result = handle_action(data)
        sys.stdout.write(json.dumps(result))
    except Exception as exc:
        sys.stdout.write(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(0)
