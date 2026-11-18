"""
Meridian Portfolio Ledger — Model Context Protocol (MCP) Server in Python (`backend/mcp_server.py`)
Elios Academy Forward Deployed Engineer Capstone

Acceptance Criteria Addressed:
- Through a compatible MCP client (Claude Desktop, Cursor, MCP Inspector, or HTTP/Stdio JSON-RPC 2.0),
  an authenticated user can:
  1. `get_portfolio_holdings`: Retrieve holdings and account breakdown.
  2. `get_computed_metrics`: Retrieve deterministic portfolio value, cost basis, unrealized gain/loss, and combined positions across accounts.
  3. `get_latest_analysis`: Retrieve the latest saved LangGraph agent analysis and reasoned recommendations.
  4. `upsert_holding`: Add or update a holding in a specific investment or retirement account with strict input validation.
- Enforce user access on reads and writes (requires valid OAuth 2.0 Bearer token; binds all reads and writes to the authenticated user's isolated tenant via Cloud Firestore REST API v1 and security rules).
"""

import os
import re
import sys
import json
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.calculations import compute_portfolio_metrics, CALCULATION_ASSUMPTIONS
from backend.market_data import fetch_quote_for_ticker, PROVIDER_LIMITS_INFO

TICKER_REGEX = re.compile(r"^[A-Z0-9.\-]{1,12}$")
DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SAFE_ID_REGEX = re.compile(r"^[a-zA-Z0-9_\-]{1,128}$")

# Load Firebase project & database configuration for authenticated REST calls
_CONFIG_PATH = Path(__file__).resolve().parent.parent / "firebase-applet-config.json"
try:
    with open(_CONFIG_PATH, "r", encoding="utf-8") as _f:
        _FIREBASE_CFG = json.load(_f)
except Exception:
    _FIREBASE_CFG = {}

FIREBASE_PROJECT_ID = os.environ.get(
    "FIREBASE_PROJECT_ID", _FIREBASE_CFG.get("projectId", "scientific-map-p8f9p")
)
FIRESTORE_DATABASE_ID = os.environ.get(
    "FIRESTORE_DATABASE_ID",
    _FIREBASE_CFG.get("firestoreDatabaseId", "ai-studio-22e05c89-9152-462c-965e-584ac1df336a"),
)
FIREBASE_WEB_API_KEY = os.environ.get(
    "FIREBASE_WEB_API_KEY", _FIREBASE_CFG.get("apiKey", "")
)

FIRESTORE_DOC_ROOT = (
    f"projects/{FIREBASE_PROJECT_ID}/databases/{FIRESTORE_DATABASE_ID}/documents"
)
FIRESTORE_BASE_URL = f"https://firestore.googleapis.com/v1/{FIRESTORE_DOC_ROOT}"


MCP_TOOLS_MANIFEST: List[Dict[str, Any]] = [
    {
        "name": "get_portfolio_holdings",
        "description": "Retrieve the authenticated user's investment and retirement accounts and individual stock holding tax lots.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "accountType": {
                    "type": "string",
                    "enum": ["ALL", "INVESTMENT", "RETIREMENT"],
                    "description": "Optional filter by account category.",
                }
            },
        },
    },
    {
        "name": "get_computed_metrics",
        "description": "Retrieve deterministic portfolio calculations including total value, cost basis, unrealized gain/loss, combined multi-account positions, and calculation assumptions.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_latest_analysis",
        "description": "Retrieve the latest saved monthly or on-demand LangGraph portfolio analysis report and reasoned recommendations for the authenticated user.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "upsert_holding",
        "description": "Add a new stock holding tax lot or update an existing holding in the authenticated user's portfolio. Enforces strict input validation and user ownership.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "holdingId": {
                    "type": "string",
                    "description": "Optional existing holding ID to update. Omit to create or idempotently upsert by (accountId, ticker, purchasePrice, purchaseDate).",
                },
                "accountId": {
                    "type": "string",
                    "description": "Target account ID owned by the authenticated user.",
                },
                "accountName": {
                    "type": "string",
                    "description": "Account display name (e.g., 'Individual Brokerage' or 'Roth IRA Retirement').",
                },
                "accountType": {
                    "type": "string",
                    "enum": ["INVESTMENT", "RETIREMENT"],
                    "description": "Category of the account.",
                },
                "ticker": {
                    "type": "string",
                    "description": "Stock ticker symbol (1-12 uppercase characters, e.g., GOOGL, AAPL).",
                },
                "shares": {
                    "type": "number",
                    "description": "Positive quantity of shares (> 0).",
                },
                "purchasePrice": {
                    "type": "number",
                    "description": "Positive per-share purchase price in USD (> 0).",
                },
                "purchaseDate": {
                    "type": "string",
                    "description": "Acquisition date in YYYY-MM-DD format.",
                },
                "notes": {
                    "type": "string",
                    "description": "Optional tax-lot note (max 240 chars).",
                },
            },
            "required": ["accountName", "accountType", "ticker", "shares", "purchasePrice"],
        },
    },
]

MCP_RESOURCES_MANIFEST: List[Dict[str, Any]] = [
    {
        "uri": "portfolio://ledger/holdings",
        "name": "Authenticated User Portfolio Holdings",
        "description": "Tax-lot holdings across Investment and Retirement accounts.",
        "mimeType": "application/json",
    },
    {
        "uri": "portfolio://ledger/metrics",
        "name": "Deterministic Portfolio Valuation & Concentration Metrics",
        "description": "Python Decimal calculations for market value, cost basis, unrealized gain/loss, and combined positions.",
        "mimeType": "application/json",
    },
    {
        "uri": "portfolio://ledger/latest-analysis",
        "name": "Latest LangGraph Portfolio Analysis Report",
        "description": "Most recent monthly or on-demand LangGraph + Groq portfolio advisory report.",
        "mimeType": "application/json",
    },
]

MCP_PROMPTS_MANIFEST: List[Dict[str, Any]] = [
    {
        "name": "monthly-portfolio-review",
        "description": "Review combined multi-account holdings, unrealized performance, and single-stock concentration (>=25%).",
        "arguments": [],
    }
]


def validate_upsert_holding_input(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validates MCP/API input for adding or updating a holding.
    Raises ValueError with clear, human-understandable explanation on invalid input.
    """
    ticker = str(args.get("ticker", "")).upper().strip()
    if not TICKER_REGEX.match(ticker):
        raise ValueError(
            f"Invalid ticker symbol '{args.get('ticker')}'. Ticker must be 1-12 uppercase alphanumeric characters (e.g., AAPL, GOOGL, BRK.B)."
        )

    try:
        shares = float(args.get("shares", 0))
    except (TypeError, ValueError):
        raise ValueError("Shares quantity must be a valid positive number.")
    if shares <= 0 or shares > 1_000_000_000:
        raise ValueError(
            f"Invalid shares quantity ({shares}). Quantity must be greater than 0 and at most 1,000,000,000."
        )

    try:
        purchase_price = float(args.get("purchasePrice", 0))
    except (TypeError, ValueError):
        raise ValueError("Purchase price must be a valid positive USD amount.")
    if purchase_price <= 0 or purchase_price > 1_000_000_000:
        raise ValueError(
            f"Invalid purchase price (${purchase_price}). Purchase price must be greater than $0.00."
        )

    account_type = str(args.get("accountType", "INVESTMENT")).upper().strip()
    if account_type not in ("INVESTMENT", "RETIREMENT"):
        raise ValueError(
            f"Invalid accountType '{account_type}'. Must be 'INVESTMENT' or 'RETIREMENT'."
        )

    account_name = str(args.get("accountName", "Individual Brokerage")).strip()
    if not account_name or len(account_name) > 80:
        raise ValueError("Account name must be between 1 and 80 characters.")

    purchase_date = str(args.get("purchaseDate", "2026-01-15")).strip()
    if not DATE_REGEX.match(purchase_date):
        raise ValueError(f"Invalid purchaseDate '{purchase_date}'. Expected YYYY-MM-DD format.")

    notes = str(args.get("notes", "")).strip()[:240]

    return {
        "holdingId": str(args.get("holdingId", "")).strip(),
        "accountId": str(args.get("accountId", "")).strip(),
        "accountName": account_name,
        "accountType": account_type,
        "ticker": ticker,
        "shares": round(shares, 6),
        "purchasePrice": round(purchase_price, 4),
        "purchaseDate": purchase_date,
        "notes": notes,
    }


def verify_firebase_oauth_token(id_token: str) -> Tuple[str, str]:
    """
    Verifies a Firebase OAuth 2.0 Bearer ID token natively in Python via Google Identity Toolkit REST API.
    Returns (user_id, email) or raises PermissionError on invalid/missing/expired token.
    """
    clean_token = (id_token or "").strip()
    if clean_token.startswith("Bearer "):
        clean_token = clean_token[len("Bearer ") :].strip()
    if not clean_token:
        raise PermissionError("Unauthorized: Missing OAuth 2.0 Bearer token.")

    if not FIREBASE_WEB_API_KEY:
        raise PermissionError("Unauthorized: Firebase Web API Key not configured for token verification.")

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={FIREBASE_WEB_API_KEY}"
    payload = json.dumps({"idToken": clean_token}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            users = data.get("users", [])
            if not users:
                raise PermissionError("Unauthorized: Token did not resolve to an active user account.")
            user_info = users[0]
            uid = str(user_info.get("localId", "")).strip()
            email = str(user_info.get("email", uid)).strip()
            if not uid:
                raise PermissionError("Unauthorized: Token missing user UID.")
            return uid, email
    except urllib.error.HTTPError as exc:
        raise PermissionError("Unauthorized: Invalid or expired OAuth 2.0 Bearer token.") from exc
    except Exception as exc:
        if isinstance(exc, PermissionError):
            raise
        raise PermissionError(f"Unauthorized: Token verification failed ({exc}).") from exc


def _parse_firestore_value(val_obj: Dict[str, Any]) -> Any:
    if "stringValue" in val_obj:
        return val_obj["stringValue"]
    if "doubleValue" in val_obj:
        return float(val_obj["doubleValue"])
    if "integerValue" in val_obj:
        return int(val_obj["integerValue"])
    if "booleanValue" in val_obj:
        return bool(val_obj["booleanValue"])
    if "timestampValue" in val_obj:
        return val_obj["timestampValue"]
    if "nullValue" in val_obj:
        return None
    if "arrayValue" in val_obj:
        values = val_obj["arrayValue"].get("values", [])
        return [_parse_firestore_value(v) for v in values]
    if "mapValue" in val_obj:
        fields = val_obj["mapValue"].get("fields", {})
        return {k: _parse_firestore_value(v) for k, v in fields.items()}
    return None


def _parse_firestore_doc(doc_obj: Dict[str, Any]) -> Dict[str, Any]:
    name = doc_obj.get("name", "")
    doc_id = name.split("/")[-1] if name else ""
    fields = doc_obj.get("fields", {})
    parsed = {"id": doc_id}
    for k, v in fields.items():
        parsed[k] = _parse_firestore_value(v)
    return parsed


def query_user_collection_firestore(
    user_id: str, collection_id: str, id_token: str
) -> List[Dict[str, Any]]:
    """
    Executes a structuredQuery against Cloud Firestore REST API v1 scoped to `/users/{userId}/{collectionId}`
    with `where('userId', '==', userId)` and the user's OAuth Bearer token so `firestore.rules`
    (`allow list: if isOwner(userId) && existing().userId == request.auth.uid;`) succeeds.
    """
    url = f"{FIRESTORE_BASE_URL}/users/{user_id}:runQuery"
    query_payload = {
        "structuredQuery": {
            "from": [{"collectionId": collection_id}],
            "where": {
                "fieldFilter": {
                    "field": {"fieldPath": "userId"},
                    "op": "EQUAL",
                    "value": {"stringValue": user_id},
                }
            },
        }
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(query_payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {id_token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
            results: List[Dict[str, Any]] = []
            if isinstance(rows, list):
                for item in rows:
                    doc = item.get("document")
                    if doc:
                        results.append(_parse_firestore_doc(doc))
            return results
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="ignore")
        if exc.code in (401, 403):
            raise PermissionError(
                f"Unauthorized Firestore access ({exc.code}): {err_body[:240]}"
            ) from exc
        raise RuntimeError(f"Firestore query error ({exc.code}): {err_body[:240]}") from exc


def commit_firestore_writes(writes: List[Dict[str, Any]], id_token: str) -> Dict[str, Any]:
    """
    Executes an atomic commit against Cloud Firestore REST API v1 using the user's OAuth Bearer token.
    Supports `updateTransforms` with `setToServerValue: "REQUEST_TIME"` to satisfy `firestore.rules`
    timestamp equality checks (`incoming().createdAt == request.time && incoming().updatedAt == request.time`).
    """
    url = f"{FIRESTORE_BASE_URL}:commit"
    req = urllib.request.Request(
        url,
        data=json.dumps({"writes": writes}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {id_token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="ignore")
        if exc.code in (401, 403):
            raise PermissionError(
                f"Unauthorized Firestore write ({exc.code}): {err_body[:240]}"
            ) from exc
        raise RuntimeError(f"Firestore commit error ({exc.code}): {err_body[:240]}") from exc


def upsert_holding_in_firestore(
    user_id: str, raw_args: Dict[str, Any], id_token: str
) -> Dict[str, Any]:
    """
    1. Strictly validates the holding input via `validate_upsert_holding_input`.
    2. Queries the user's existing accounts in Firestore; creates the target account if not yet present.
    3. Queries the user's existing holdings in Firestore; idempotently updates matching lot or creates a new lot.
    """
    v = validate_upsert_holding_input(raw_args)

    existing_accounts = query_user_collection_firestore(user_id, "accounts", id_token)
    target_account_id = v["accountId"]
    target_account_name = v["accountName"]
    target_account_type = v["accountType"]

    matched_account = None
    for acct in existing_accounts:
        if target_account_id and acct.get("id") == target_account_id:
            matched_account = acct
            break
        if (
            str(acct.get("name", "")).lower() == target_account_name.lower()
            and str(acct.get("accountType", "")).upper() == target_account_type.upper()
        ):
            matched_account = acct
            break

    if matched_account:
        target_account_id = str(matched_account["id"])
        target_account_name = str(matched_account.get("name", target_account_name))
        target_account_type = str(matched_account.get("accountType", target_account_type))
    else:
        if not target_account_id or not SAFE_ID_REGEX.match(target_account_id):
            target_account_id = f"acct_{target_account_type.lower()}_{int(time.time() * 1000)}"
        institution = (
            "Fidelity Retirement" if target_account_type == "RETIREMENT" else "Vanguard Brokerage"
        )
        acct_doc_name = f"{FIRESTORE_DOC_ROOT}/users/{user_id}/accounts/{target_account_id}"
        commit_firestore_writes(
            [
                {
                    "update": {
                        "name": acct_doc_name,
                        "fields": {
                            "userId": {"stringValue": user_id},
                            "name": {"stringValue": target_account_name[:80]},
                            "accountType": {"stringValue": target_account_type},
                            "institution": {"stringValue": institution},
                            "currency": {"stringValue": "USD"},
                        },
                    },
                    "updateTransforms": [
                        {"fieldPath": "createdAt", "setToServerValue": "REQUEST_TIME"},
                        {"fieldPath": "updatedAt", "setToServerValue": "REQUEST_TIME"},
                    ],
                    "currentDocument": {"exists": False},
                }
            ],
            id_token,
        )

    existing_holdings = query_user_collection_firestore(user_id, "holdings", id_token)
    matched_holding = None
    for h in existing_holdings:
        if v["holdingId"] and h.get("id") == v["holdingId"]:
            matched_holding = h
            break
        if (
            h.get("accountId") == target_account_id
            and str(h.get("ticker", "")).upper() == v["ticker"]
            and str(h.get("purchaseDate", "")) == v["purchaseDate"]
            and abs(float(h.get("purchasePrice", 0)) - float(v["purchasePrice"])) < 0.0001
        ):
            matched_holding = h
            break

    if matched_holding:
        holding_id = str(matched_holding["id"])
        holding_doc_name = f"{FIRESTORE_DOC_ROOT}/users/{user_id}/holdings/{holding_id}"
        commit_firestore_writes(
            [
                {
                    "update": {
                        "name": holding_doc_name,
                        "fields": {
                            "accountId": {"stringValue": target_account_id},
                            "accountName": {"stringValue": target_account_name[:80]},
                            "accountType": {"stringValue": target_account_type},
                            "ticker": {"stringValue": v["ticker"]},
                            "shares": {"doubleValue": float(v["shares"])},
                            "purchasePrice": {"doubleValue": float(v["purchasePrice"])},
                            "purchaseDate": {"stringValue": v["purchaseDate"]},
                            "notes": {"stringValue": v["notes"]},
                        },
                    },
                    "updateMask": {
                        "fieldPaths": [
                            "accountId",
                            "accountName",
                            "accountType",
                            "ticker",
                            "shares",
                            "purchasePrice",
                            "purchaseDate",
                            "notes",
                        ]
                    },
                    "updateTransforms": [
                        {"fieldPath": "updatedAt", "setToServerValue": "REQUEST_TIME"},
                    ],
                    "currentDocument": {"exists": True},
                }
            ],
            id_token,
        )
        operation = "UPDATED"
    else:
        clean_sym = re.sub(r"[^A-Z0-9]", "", v["ticker"]) or "LOT"
        holding_id = (
            v["holdingId"]
            if v["holdingId"] and SAFE_ID_REGEX.match(v["holdingId"])
            else f"lot_{clean_sym}_{int(time.time() * 1000)}"
        )
        holding_doc_name = f"{FIRESTORE_DOC_ROOT}/users/{user_id}/holdings/{holding_id}"
        commit_firestore_writes(
            [
                {
                    "update": {
                        "name": holding_doc_name,
                        "fields": {
                            "userId": {"stringValue": user_id},
                            "accountId": {"stringValue": target_account_id},
                            "accountName": {"stringValue": target_account_name[:80]},
                            "accountType": {"stringValue": target_account_type},
                            "ticker": {"stringValue": v["ticker"]},
                            "shares": {"doubleValue": float(v["shares"])},
                            "purchasePrice": {"doubleValue": float(v["purchasePrice"])},
                            "purchaseDate": {"stringValue": v["purchaseDate"]},
                            "notes": {"stringValue": v["notes"]},
                        },
                    },
                    "updateTransforms": [
                        {"fieldPath": "createdAt", "setToServerValue": "REQUEST_TIME"},
                        {"fieldPath": "updatedAt", "setToServerValue": "REQUEST_TIME"},
                    ],
                    "currentDocument": {"exists": False},
                }
            ],
            id_token,
        )
        operation = "CREATED"

    return {
        "operation": operation,
        "id": holding_id,
        "userId": user_id,
        "accountId": target_account_id,
        "accountName": target_account_name,
        "accountType": target_account_type,
        "ticker": v["ticker"],
        "shares": float(v["shares"]),
        "purchasePrice": float(v["purchasePrice"]),
        "purchaseDate": v["purchaseDate"],
        "notes": v["notes"],
    }


def handle_mcp_jsonrpc(
    rpc_request: Dict[str, Any],
    id_token: Optional[str] = None,
    verified_user_id: Optional[str] = None,
    verified_email: Optional[str] = None,
) -> Tuple[int, Dict[str, Any]]:
    """
    Complete Model Context Protocol (MCP) JSON-RPC 2.0 handler in Python.
    Returns `(http_status_code, jsonrpc_response_dict)`.
    """
    rpc_id = rpc_request.get("id", 1)
    method = str(rpc_request.get("method", "")).strip()
    params = rpc_request.get("params") or {}

    # 1. Authenticate OAuth 2.0 Bearer Token on every MCP request
    clean_token = (id_token or "").strip()
    if clean_token.startswith("Bearer "):
        clean_token = clean_token[len("Bearer ") :].strip()

    try:
        if verified_user_id and clean_token:
            user_id = verified_user_id
            user_email = verified_email or verified_user_id
        else:
            user_id, user_email = verify_firebase_oauth_token(clean_token)
    except PermissionError as auth_err:
        return 401, {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "error": {
                "code": -32001,
                "message": str(auth_err),
            },
        }

    # 2. Standard MCP Lifecycle & Discovery Methods
    if method == "initialize":
        return 200, {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {"listChanged": False},
                    "resources": {"subscribe": False, "listChanged": False},
                    "prompts": {"listChanged": False},
                },
                "serverInfo": {
                    "name": "meridian-portfolio-mcp-python",
                    "version": "1.0.0",
                },
            },
        }

    if method in ("notifications/initialized", "initialized"):
        return 200, {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {},
        }

    if method == "ping":
        return 200, {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {},
        }

    if method == "tools/list":
        return 200, {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "tools": MCP_TOOLS_MANIFEST,
            },
        }

    if method == "resources/list":
        return 200, {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "resources": MCP_RESOURCES_MANIFEST,
            },
        }

    if method == "prompts/list":
        return 200, {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "prompts": MCP_PROMPTS_MANIFEST,
            },
        }

    # 3. MCP Tool Execution (`tools/call`)
    if method == "tools/call":
        tool_name = str(params.get("name", "")).strip()
        tool_args = params.get("arguments") or {}

        try:
            if tool_name == "get_portfolio_holdings":
                accounts = query_user_collection_firestore(user_id, "accounts", clean_token)
                holdings = query_user_collection_firestore(user_id, "holdings", clean_token)
                filter_type = str(tool_args.get("accountType", "ALL")).upper().strip()
                if filter_type in ("INVESTMENT", "RETIREMENT"):
                    holdings = [
                        h for h in holdings if str(h.get("accountType", "")).upper() == filter_type
                    ]
                payload_text = json.dumps(
                    {
                        "authenticatedUser": user_email,
                        "userId": user_id,
                        "accountTypeFilter": filter_type,
                        "accountsCount": len(accounts),
                        "holdingsCount": len(holdings),
                        "accounts": accounts,
                        "holdings": holdings,
                    },
                    indent=2,
                )
                return 200, {
                    "jsonrpc": "2.0",
                    "id": rpc_id,
                    "result": {
                        "content": [{"type": "text", "text": payload_text}],
                        "isError": False,
                    },
                }

            if tool_name == "get_computed_metrics":
                holdings = query_user_collection_firestore(user_id, "holdings", clean_token)
                tickers = sorted(
                    list(
                        {
                            str(h.get("ticker", "")).upper().strip()
                            for h in holdings
                            if h.get("ticker")
                        }
                    )
                )
                quotes: Dict[str, Dict[str, Any]] = {}
                for sym in tickers:
                    quotes[sym] = fetch_quote_for_ticker(sym, force_refresh=False)
                metrics = compute_portfolio_metrics(holdings, quotes)
                payload_text = json.dumps(
                    {
                        "authenticatedUser": user_email,
                        "userId": user_id,
                        "metrics": metrics,
                        "providerLimits": PROVIDER_LIMITS_INFO,
                    },
                    indent=2,
                )
                return 200, {
                    "jsonrpc": "2.0",
                    "id": rpc_id,
                    "result": {
                        "content": [{"type": "text", "text": payload_text}],
                        "isError": False,
                    },
                }

            if tool_name == "get_latest_analysis":
                analyses = query_user_collection_firestore(user_id, "analyses", clean_token)
                analyses.sort(key=lambda a: str(a.get("updatedAt", "")), reverse=True)
                latest = analyses[0] if analyses else None
                payload_text = json.dumps(
                    {
                        "authenticatedUser": user_email,
                        "userId": user_id,
                        "totalSavedAnalyses": len(analyses),
                        "latestAnalysis": latest
                        or "No saved analysis found yet. Run a Monthly or On-Demand analysis in the Agent Advisory tab first.",
                    },
                    indent=2,
                )
                return 200, {
                    "jsonrpc": "2.0",
                    "id": rpc_id,
                    "result": {
                        "content": [{"type": "text", "text": payload_text}],
                        "isError": False,
                    },
                }

            if tool_name == "upsert_holding":
                upserted = upsert_holding_in_firestore(user_id, tool_args, clean_token)
                payload_text = json.dumps(
                    {
                        "authenticatedUser": user_email,
                        "userId": user_id,
                        "status": "SUCCESS",
                        "holding": upserted,
                    },
                    indent=2,
                )
                return 200, {
                    "jsonrpc": "2.0",
                    "id": rpc_id,
                    "result": {
                        "content": [{"type": "text", "text": payload_text}],
                        "isError": False,
                    },
                }

            return 400, {
                "jsonrpc": "2.0",
                "id": rpc_id,
                "error": {
                    "code": -32601,
                    "message": (
                        f"Unknown MCP tool '{tool_name}'. Supported tools: "
                        "get_portfolio_holdings, get_computed_metrics, get_latest_analysis, upsert_holding."
                    ),
                },
            }

        except ValueError as val_err:
            return 400, {
                "jsonrpc": "2.0",
                "id": rpc_id,
                "error": {
                    "code": -32602,
                    "message": str(val_err),
                },
            }
        except PermissionError as perm_err:
            return 401, {
                "jsonrpc": "2.0",
                "id": rpc_id,
                "error": {
                    "code": -32001,
                    "message": str(perm_err),
                },
            }
        except Exception as exc:
            return 400, {
                "jsonrpc": "2.0",
                "id": rpc_id,
                "error": {
                    "code": -32603,
                    "message": f"MCP tool execution error: {exc}",
                },
            }

    return 400, {
        "jsonrpc": "2.0",
        "id": rpc_id,
        "error": {
            "code": -32601,
            "message": (
                f"Unsupported JSON-RPC method '{method}'. Supported methods: "
                "initialize, notifications/initialized, ping, tools/list, tools/call, resources/list, prompts/list."
            ),
        },
    }


def run_stdio_mcp_server() -> None:
    """
    Standard MCP Stdio Transport entrypoint (`python3 -m backend.mcp_server`).
    Reads newline-delimited JSON-RPC 2.0 requests from stdin and writes JSON-RPC 2.0 responses to stdout.
    Uses `MCP_OAUTH_BEARER_TOKEN` from environment variables for authentication.
    """
    env_token = os.environ.get("MCP_OAUTH_BEARER_TOKEN", "").strip()
    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            req_obj = json.loads(raw)
            token = (
                req_obj.get("params", {}).get("_meta", {}).get("oauthBearerToken")
                or env_token
            )
            _, resp_obj = handle_mcp_jsonrpc(req_obj, id_token=token)
            sys.stdout.write(json.dumps(resp_obj) + "\n")
            sys.stdout.flush()
        except Exception as exc:
            err_resp = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Parse error: {exc}"},
            }
            sys.stdout.write(json.dumps(err_resp) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    run_stdio_mcp_server()
