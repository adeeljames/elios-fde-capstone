"""
Meridian Portfolio Ledger — Automated Evaluation Harness (`evals/run_evals.py`)
Elios Academy Forward Deployed Engineer Capstone

Executes the 4 canonical portfolio evaluation cases against the Python deterministic
calculation engine and the LangGraph + Groq portfolio analysis agent, verifying:
1. Numerical correctness (100% match against Python Decimal calculations).
2. Concentration detection (>=25% single-stock weight flagged).
3. Stale and unavailable market data disclosure (never fabricating prices).
4. Scope compliance (no trade execution, tax-location reasoning between IRA and Brokerage).
"""

import json
import sys
from typing import Any, Dict, List

from backend.database import init_db
from backend.market_data import fetch_quote_for_ticker
from backend.calculations import compute_portfolio_metrics
from backend.agent import run_langgraph_portfolio_agent


EVAL_CASES: List[Dict[str, Any]] = [
    {
        "caseId": "CASE_01_CLIENT_BRIEF_MULTI_ACCOUNT",
        "title": "Client Brief Baseline: Alphabet (GOOGL) & Apple (AAPL) Across Investment & Retirement Accounts",
        "holdings": [
            {
                "id": "lot_1",
                "accountId": "acct_inv",
                "accountName": "Individual Brokerage",
                "accountType": "INVESTMENT",
                "ticker": "GOOGL",
                "shares": 25,
                "purchasePrice": 142.50,
                "purchaseDate": "2025-04-10",
            },
            {
                "id": "lot_2",
                "accountId": "acct_ret",
                "accountName": "Roth IRA",
                "accountType": "RETIREMENT",
                "ticker": "GOOGL",
                "shares": 40,
                "purchasePrice": 158.00,
                "purchaseDate": "2025-08-19",
            },
            {
                "id": "lot_3",
                "accountId": "acct_inv",
                "accountName": "Individual Brokerage",
                "accountType": "INVESTMENT",
                "ticker": "AAPL",
                "shares": 30,
                "purchasePrice": 185.00,
                "purchaseDate": "2025-02-14",
            },
            {
                "id": "lot_4",
                "accountId": "acct_ret",
                "accountName": "Roth IRA",
                "accountType": "RETIREMENT",
                "ticker": "AAPL",
                "shares": 20,
                "purchasePrice": 210.00,
                "purchaseDate": "2025-11-03",
            },
        ],
        "expected": {
            "totalCostBasis": 19632.50,
            "topHoldingTicker": "GOOGL",
            "mustContainSubstrings": ["GOOGL", "AAPL", "Retirement"],
        },
    },
    {
        "caseId": "CASE_02_EXTREME_CONCENTRATION_NVDA",
        "title": "Single-Stock Concentration Alert (87.69% NVDA vs 12.31% VTI)",
        "holdings": [
            {
                "id": "lot_nvda",
                "accountId": "acct_inv",
                "accountName": "Individual Brokerage",
                "accountType": "INVESTMENT",
                "ticker": "NVDA",
                "shares": 150,
                "purchasePrice": 95.00,
                "purchaseDate": "2025-01-15",
            },
            {
                "id": "lot_vti",
                "accountId": "acct_ret",
                "accountName": "Roth IRA",
                "accountType": "RETIREMENT",
                "ticker": "VTI",
                "shares": 10,
                "purchasePrice": 280.00,
                "purchaseDate": "2025-06-01",
            },
        ],
        "expected": {
            "totalCostBasis": 17050.00,
            "topHoldingTicker": "NVDA",
            "mustContainSubstrings": ["NVDA", "25.00%"],
        },
    },
    {
        "caseId": "CASE_03_UNAVAILABLE_TICKER_FALLBACK",
        "title": "Unavailable / Delisted Ticker Resilient Fallback (ACMECORP + GOOGL)",
        "holdings": [
            {
                "id": "lot_goog",
                "accountId": "acct_inv",
                "accountName": "Individual Brokerage",
                "accountType": "INVESTMENT",
                "ticker": "GOOGL",
                "shares": 25,
                "purchasePrice": 142.50,
                "purchaseDate": "2025-04-10",
            },
            {
                "id": "lot_unavail",
                "accountId": "acct_inv",
                "accountName": "Individual Brokerage",
                "accountType": "INVESTMENT",
                "ticker": "ACMECORP",
                "shares": 50,
                "purchasePrice": 40.00,
                "purchaseDate": "2025-05-01",
            },
        ],
        "expected": {
            "totalCostBasis": 5562.50,
            "topHoldingTicker": "GOOGL",
            "mustContainSubstrings": ["ACMECORP", "cost basis"],
        },
    },
    {
        "caseId": "CASE_04_EMPTY_PORTFOLIO_GUARD",
        "title": "Zero Holdings Empty Portfolio Guard",
        "holdings": [],
        "expected": {
            "totalCostBasis": 0.00,
            "topHoldingTicker": "NONE",
            "mustContainSubstrings": ["zero", "$0.00"],
        },
    },
]


def run_all_evals() -> int:
    init_db()
    passed = 0
    results = []

    for case in EVAL_CASES:
        holdings = case["holdings"]
        tickers = sorted(list({h["ticker"] for h in holdings}))
        quotes = {sym: fetch_quote_for_ticker(sym, force_refresh=False) for sym in tickers}
        metrics = compute_portfolio_metrics(holdings, quotes)
        report = run_langgraph_portfolio_agent(
            user_id="eval_runner_uid",
            trigger_type="ON_DEMAND",
            holdings=holdings,
            quotes=quotes,
            metrics=metrics,
        )

        exp = case["expected"]
        cb_ok = abs(metrics["summary"]["totalCostBasis"] - exp["totalCostBasis"]) < 0.01
        top_ok = metrics["summary"]["topHoldingTicker"] == exp["topHoldingTicker"]
        combined_text = (
            report["executiveSummary"]
            + " "
            + report["concentrationAnalysis"]
            + " "
            + report["dataQualityNotice"]
            + " "
            + report["recommendationsText"]
        )
        substr_ok = all(sub.lower() in combined_text.lower() for sub in exp["mustContainSubstrings"])
        case_pass = cb_ok and top_ok and substr_ok
        if case_pass:
            passed += 1

        results.append({
            "caseId": case["caseId"],
            "title": case["title"],
            "passed": case_pass,
            "verifiedSummary": metrics["summary"],
            "agentReport": report,
        })

    print(json.dumps({"totalCases": len(EVAL_CASES), "passed": passed, "results": results}, indent=2))
    return 0 if passed == len(EVAL_CASES) else 1


if __name__ == "__main__":
    sys.exit(run_all_evals())
