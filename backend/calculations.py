"""
Meridian Portfolio Ledger — Deterministic Financial Calculation Engine
Elios Academy Forward Deployed Engineer Capstone

Acceptance Criteria Addressed:
- Show holding and portfolio value and unrealized gain/loss, including combined positions across accounts.
- Compute numbers deterministically in code (NEVER delegate arithmetic to an LLM).
- Document assumptions:
  * Base Currency: USD ($). All quotes and cost bases are denominated in USD.
  * Cost Basis Method: Tax-lot specific identification for individual account lots; weighted-average cost basis for combined multi-account positions.
  * Fees & Commissions: $0.00 assumed per transaction (standard US zero-commission retail/institutional brokerage baseline).
  * Dividends: Price-return basis only (unrealized capital appreciation/depreciation excluding cash dividends and dividend reinvestment).
  * Concentration Flag Threshold: Any single equity position representing >= 25.0% of total portfolio market value is flagged as a single-stock concentration risk.
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List


CALCULATION_ASSUMPTIONS = {
    "currency": "USD (US Dollars): all share prices, cost bases, and market values are strictly denominated in USD.",
    "costBasisMethod": "Specific Tax-Lot Identification per account entry; Weighted-Average Cost Basis when aggregating identical tickers across Investment and Retirement accounts.",
    "transactionFees": "$0.00 commission assumed per equity trade (standard US zero-commission brokerage schedule).",
    "dividendsAndSplits": "Price-return basis only. Unrealized gain/loss reflects share price movement vs. purchase price, excluding cash dividend payouts.",
    "staleDataPolicy": "Quotes older than 15 minutes during market hours or returned from cache fallback are explicitly marked STALE. Unavailable tickers use last known close or purchase basis and are flagged for review.",
    "concentrationThresholdPct": 25.0,
}


def _d(val: Any) -> Decimal:
    return Decimal(str(val if val is not None else 0))


def _round2(val: Decimal) -> float:
    return float(val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _round4(val: Decimal) -> float:
    return float(val.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))


def compute_portfolio_metrics(
    holdings: List[Dict[str, Any]],
    quotes_by_ticker: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Deterministically computes:
    1. Enriched individual holding rows (per-lot market value, cost basis, unrealized gain/loss $, unrealized gain/loss %, quote freshness).
    2. Combined positions across accounts (aggregating shares, weighted-average purchase price, combined market value, combined unrealized gain/loss, account breakdown).
    3. Account-level summaries (Investment vs Retirement totals and allocation %).
    4. Portfolio-level summary & concentration risk flags.
    """
    enriched_holdings: List[Dict[str, Any]] = []
    combined_map: Dict[str, Dict[str, Any]] = {}
    account_map: Dict[str, Dict[str, Any]] = {}

    total_market_value = Decimal("0")
    total_cost_basis = Decimal("0")
    total_day_change = Decimal("0")
    investment_value = Decimal("0")
    retirement_value = Decimal("0")

    stale_tickers: set[str] = set()
    unavailable_tickers: set[str] = set()

    for h in holdings:
        ticker = str(h.get("ticker", "")).upper().strip()
        if not ticker:
            continue

        shares = _d(h.get("shares", 0))
        purchase_price = _d(h.get("purchasePrice", 0))
        if shares <= Decimal("0") or purchase_price <= Decimal("0"):
            continue

        quote = quotes_by_ticker.get(ticker, {})
        is_unavailable = bool(quote.get("isUnavailable", False)) or ("currentPrice" not in quote)
        is_stale = bool(quote.get("isStale", False))

        if is_unavailable:
            unavailable_tickers.add(ticker)
            current_price = purchase_price
            prev_close = purchase_price
            quote_status = "UNAVAILABLE"
            quote_reason = quote.get("statusReason", "Market quote unavailable; valued at cost basis fallback.")
        else:
            current_price = _d(quote.get("currentPrice", purchase_price))
            prev_close = _d(quote.get("previousClose", current_price))
            if is_stale:
                stale_tickers.add(ticker)
                quote_status = "STALE"
            else:
                quote_status = "LIVE"
            quote_reason = quote.get("statusReason", "Verified Finnhub market quote")

        lot_cost_basis = shares * purchase_price
        lot_market_value = shares * current_price
        lot_unrealized_gain = lot_market_value - lot_cost_basis
        lot_return_pct = (
            (lot_unrealized_gain / lot_cost_basis) * Decimal("100")
            if lot_cost_basis > Decimal("0")
            else Decimal("0")
        )
        lot_day_change = shares * (current_price - prev_close)

        total_market_value += lot_market_value
        total_cost_basis += lot_cost_basis
        total_day_change += lot_day_change

        acct_type = str(h.get("accountType", "INVESTMENT")).upper()
        if acct_type == "RETIREMENT":
            retirement_value += lot_market_value
        else:
            investment_value += lot_market_value

        acct_id = str(h.get("accountId", "default"))
        acct_name = str(h.get("accountName", "Account"))
        if acct_id not in account_map:
            account_map[acct_id] = {
                "accountId": acct_id,
                "accountName": acct_name,
                "accountType": acct_type,
                "marketValue": Decimal("0"),
                "costBasis": Decimal("0"),
                "unrealizedGain": Decimal("0"),
                "holdingsCount": 0,
            }
        account_map[acct_id]["marketValue"] += lot_market_value
        account_map[acct_id]["costBasis"] += lot_cost_basis
        account_map[acct_id]["unrealizedGain"] += lot_unrealized_gain
        account_map[acct_id]["holdingsCount"] += 1

        enriched_item = {
            "id": h.get("id", ""),
            "accountId": acct_id,
            "accountName": acct_name,
            "accountType": acct_type,
            "ticker": ticker,
            "companyName": quote.get("companyName", ticker),
            "sector": quote.get("sector", "Equity"),
            "shares": _round4(shares),
            "purchasePrice": _round2(purchase_price),
            "purchaseDate": h.get("purchaseDate", "2026-01-15"),
            "notes": h.get("notes", ""),
            "currentPrice": _round2(current_price),
            "previousClose": _round2(prev_close),
            "costBasis": _round2(lot_cost_basis),
            "marketValue": _round2(lot_market_value),
            "unrealizedGain": _round2(lot_unrealized_gain),
            "unrealizedGainPct": _round2(lot_return_pct),
            "dayChange": _round2(lot_day_change),
            "quoteTimestamp": quote.get("quoteTimestamp", ""),
            "quoteStatus": quote_status,
            "quoteReason": quote_reason,
            "source": quote.get("source", "FINNHUB_REST_V1"),
        }
        enriched_holdings.append(enriched_item)

        if ticker not in combined_map:
            combined_map[ticker] = {
                "ticker": ticker,
                "companyName": quote.get("companyName", ticker),
                "sector": quote.get("sector", "Equity"),
                "totalShares": Decimal("0"),
                "totalCostBasis": Decimal("0"),
                "totalMarketValue": Decimal("0"),
                "totalUnrealizedGain": Decimal("0"),
                "totalDayChange": Decimal("0"),
                "currentPrice": current_price,
                "quoteStatus": quote_status,
                "quoteTimestamp": quote.get("quoteTimestamp", ""),
                "accounts": [],
                "lotCount": 0,
            }
        c = combined_map[ticker]
        c["totalShares"] += shares
        c["totalCostBasis"] += lot_cost_basis
        c["totalMarketValue"] += lot_market_value
        c["totalUnrealizedGain"] += lot_unrealized_gain
        c["totalDayChange"] += lot_day_change
        c["lotCount"] += 1
        if acct_name not in c["accounts"]:
            c["accounts"].append(acct_name)

    # Second pass: compute portfolio weights and finalize combined positions
    for item in enriched_holdings:
        mv = _d(item["marketValue"])
        weight = (mv / total_market_value * Decimal("100")) if total_market_value > Decimal("0") else Decimal("0")
        item["portfolioWeightPct"] = _round2(weight)

    combined_positions: List[Dict[str, Any]] = []
    for ticker, c in combined_map.items():
        t_shares = c["totalShares"]
        t_cost = c["totalCostBasis"]
        t_mv = c["totalMarketValue"]
        t_gain = c["totalUnrealizedGain"]
        avg_cost = (t_cost / t_shares) if t_shares > Decimal("0") else Decimal("0")
        gain_pct = (t_gain / t_cost * Decimal("100")) if t_cost > Decimal("0") else Decimal("0")
        weight_pct = (t_mv / total_market_value * Decimal("100")) if total_market_value > Decimal("0") else Decimal("0")

        combined_positions.append({
            "ticker": ticker,
            "companyName": c["companyName"],
            "sector": c["sector"],
            "totalShares": _round4(t_shares),
            "weightedAvgCost": _round2(avg_cost),
            "currentPrice": _round2(c["currentPrice"]),
            "totalCostBasis": _round2(t_cost),
            "totalMarketValue": _round2(t_mv),
            "totalUnrealizedGain": _round2(t_gain),
            "totalUnrealizedGainPct": _round2(gain_pct),
            "totalDayChange": _round2(c["totalDayChange"]),
            "portfolioWeightPct": _round2(weight_pct),
            "isConcentrated": float(weight_pct) >= 25.0,
            "lotCount": c["lotCount"],
            "accounts": c["accounts"],
            "quoteStatus": c["quoteStatus"],
            "quoteTimestamp": c["quoteTimestamp"],
        })

    combined_positions.sort(key=lambda x: x["totalMarketValue"], reverse=True)
    enriched_holdings.sort(key=lambda x: x["marketValue"], reverse=True)

    account_summaries: List[Dict[str, Any]] = []
    for acct_id, a in account_map.items():
        mv = a["marketValue"]
        cb = a["costBasis"]
        ug = a["unrealizedGain"]
        ret_pct = (ug / cb * Decimal("100")) if cb > Decimal("0") else Decimal("0")
        alloc_pct = (mv / total_market_value * Decimal("100")) if total_market_value > Decimal("0") else Decimal("0")
        account_summaries.append({
            "accountId": acct_id,
            "accountName": a["accountName"],
            "accountType": a["accountType"],
            "marketValue": _round2(mv),
            "costBasis": _round2(cb),
            "unrealizedGain": _round2(ug),
            "returnPct": _round2(ret_pct),
            "allocationPct": _round2(alloc_pct),
            "holdingsCount": a["holdingsCount"],
        })

    total_unrealized_gain = total_market_value - total_cost_basis
    total_return_pct = (
        (total_unrealized_gain / total_cost_basis * Decimal("100"))
        if total_cost_basis > Decimal("0")
        else Decimal("0")
    )

    top_holding = combined_positions[0] if combined_positions else None
    inv_pct = (
        (investment_value / total_market_value * Decimal("100"))
        if total_market_value > Decimal("0")
        else Decimal("0")
    )
    ret_pct = (
        (retirement_value / total_market_value * Decimal("100"))
        if total_market_value > Decimal("0")
        else Decimal("0")
    )

    return {
        "summary": {
            "totalMarketValue": _round2(total_market_value),
            "totalCostBasis": _round2(total_cost_basis),
            "totalUnrealizedGain": _round2(total_unrealized_gain),
            "totalReturnPct": _round2(total_return_pct),
            "totalDayChange": _round2(total_day_change),
            "investmentValue": _round2(investment_value),
            "investmentAllocationPct": _round2(inv_pct),
            "retirementValue": _round2(retirement_value),
            "retirementAllocationPct": _round2(ret_pct),
            "topHoldingTicker": top_holding["ticker"] if top_holding else "NONE",
            "topHoldingWeightPct": top_holding["portfolioWeightPct"] if top_holding else 0.0,
            "totalPositionsCount": len(combined_positions),
            "totalLotsCount": len(enriched_holdings),
            "staleTickers": sorted(list(stale_tickers)),
            "unavailableTickers": sorted(list(unavailable_tickers)),
            "staleOrMissingCount": len(stale_tickers) + len(unavailable_tickers),
        },
        "combinedPositions": combined_positions,
        "holdings": enriched_holdings,
        "accountSummaries": account_summaries,
        "assumptions": CALCULATION_ASSUMPTIONS,
    }
