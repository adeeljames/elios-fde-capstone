# Evaluation Suite & Model Validation Evidence (`evals/EVALUATION_REPORT.md`)

**Elios Academy Forward Deployed Engineer Capstone**  
**Model & Agent Configuration:**
- **Framework:** Python LangGraph (`StateGraph` workflow in `backend/agent.py`)
- **Primary LLM Provider:** Groq API (`llama-3.3-70b-versatile`)
- **Decoding Parameters:** `temperature=0.1`, `response_format={"type": "json_object"}`
- **Deterministic Pre-Computation:** Python `Decimal` arithmetic (`backend/calculations.py`) with `ROUND_HALF_UP` to 2 decimal places before the LLM is invoked.

---

## 1. Separation of Numerical Correctness from Recommendation Quality

A common failure mode in financial LLM agents is allowing the language model to compute sums, weighted averages, or return percentages directly in token space. In **Meridian Portfolio Ledger**, the LangGraph state machine enforces a strict two-stage boundary:

1. **Stage 1: Deterministic Calculation Node (`validate_and_compute_node`)**  
   Computes exact tax-lot cost bases, weighted-average cost bases across Investment and Retirement accounts, unrealized dollar/percentage gains, portfolio concentration weights, and quote staleness flags in pure Python (`backend/calculations.py`).
2. **Stage 2: Grounded Synthesis Node (`groq_reasoned_synthesis`)**  
   Receives the verified JSON metrics dictionary and produces structured commentary (`executiveSummary`, `concentrationAnalysis`, `dataQualityNotice`, `recommendationsText`, `limitationsAndBasis`).

---

## 2. Documented Portfolio Evaluation Cases

You can reproduce all 4 evaluation cases at any time by running:
```bash
python3 -m evals.run_evals
```

### Case 1: Client Brief Baseline — Multi-Account Alphabet (`GOOGL`) & Apple (`AAPL`)

- **Portfolio & Market Inputs:**
  - **Individual Brokerage (`INVESTMENT`):**
    - `25` shares of `GOOGL` purchased at `$142.50` on `2025-04-10` (Lot cost basis: `$3,562.50`)
    - `30` shares of `AAPL` purchased at `$185.00` on `2025-02-14` (Lot cost basis: `$5,550.00`)
  - **Roth IRA (`RETIREMENT`):**
    - `40` shares of `GOOGL` purchased at `$158.00` on `2025-08-19` (Lot cost basis: `$6,320.00`)
    - `20` shares of `AAPL` purchased at `$210.00` on `2025-11-03` (Lot cost basis: `$4,200.00`)
  - **Finnhub Market Quotes:** `GOOGL = $184.60`, `AAPL = $231.40`
- **Expected Behavior & Why:**
  - Combined `GOOGL`: `65` shares, weighted-average cost `$152.04`, market value `$11,999.00`, unrealized gain `+$2,116.50` (`+21.42%`), portfolio weight `50.91%`.
  - Combined `AAPL`: `50` shares, weighted-average cost `$195.00`, market value `$11,570.00`, unrealized gain `+$1,820.00` (`+18.67%`), portfolio weight `49.09%`.
  - Total Portfolio Value: `$23,569.00`, Total Cost Basis: `$19,632.50`, Total Unrealized Gain: `+$3,936.50` (`+20.05%`).
  - The agent must flag that both `GOOGL` (`50.91%`) and `AAPL` (`49.09%`) exceed the `25.00%` single-stock concentration threshold, and recommend directing new contributions or rebalancing trims inside the **Roth IRA** (`$12,012.00`) first so rebalancing does not trigger taxable capital gains in the Individual Brokerage account (`$11,557.00`).
- **Observed Agent Output:**
  - Cited exact total value (`$23,569.00`), cost basis (`$19,632.50`), and unrealized gain (`+$3,936.50` / `+20.05%`).
  - Flagged both `GOOGL` (`50.91%`) and `AAPL` (`49.09%`) for single-stock concentration and explicitly differentiated tax-free Roth IRA reallocation from taxable brokerage lots.
- **Assessment:** **PASS** (100% numerical fidelity + sound tax-location reasoning).

---

### Case 2: Extreme Single-Stock Concentration (`NVDA` 87.69% vs. `VTI` 12.31%)

- **Portfolio & Market Inputs:**
  - **Individual Brokerage (`INVESTMENT`):** `150` shares `NVDA` @ `$95.00` (`$14,250.00` basis; quote `$138.50` -> `$20,775.00` value)
  - **Roth IRA (`RETIREMENT`):** `10` shares `VTI` @ `$280.00` (`$2,800.00` basis; quote `$291.75` -> `$2,917.50` value)
- **Expected Behavior & Why:**
  - Total value `$23,692.50`, total cost basis `$17,050.00`, unrealized gain `+$6,642.50` (`+38.96%`).
  - Must identify `NVDA` at `87.69%` portfolio concentration and warn against correlated single-issuer drawdown risk while noting `VTI` is well below the threshold at `12.31%`.
- **Observed Agent Output:**
  - Highlighted `NVDA` at `87.69%` weight (`$20,775.00` value, `+$6,525.00` unrealized gain) and recommended directing future retirement contributions into broad index ETFs (`VTI`) rather than adding to semiconductor exposure.
- **Assessment:** **PASS**.

---

### Case 3: Stale & Unavailable Market Data (`ACMECORP` Delisted/Unknown Symbol)

- **Portfolio & Market Inputs:**
  - **Individual Brokerage (`INVESTMENT`):**
    - `25` shares `GOOGL` @ `$142.50` (Live/Cached quote `$184.60` -> `$4,615.00` value)
    - `50` shares `ACMECORP` @ `$40.00` (Finnhub returns `$0.00` / unavailable -> valued deterministically at `$2,000.00` cost-basis fallback)
- **Expected Behavior & Why:**
  - The calculation engine must not crash or multiply by `$0.00` to wipe out the user's net worth, nor should the LLM invent a fictional stock price for `ACMECORP`.
  - Total value must equal `$6,615.00` (`$4,615.00` + `$2,000.00` fallback), and `dataQualityNotice` must explicitly alert the user that `ACMECORP` is unavailable and valued at cost basis.
- **Observed Agent Output:**
  - Reported `staleOrMissingCount: 1`, explicitly named `ACMECORP` in `dataQualityNotice` as unavailable on Finnhub, and advised verifying the ticker symbol or refreshing during market hours before acting on weight targets.
- **Assessment:** **PASS**.

---

### Case 4: Empty Portfolio Guard (0 Holdings)

- **Portfolio & Market Inputs:** `0` accounts, `0` holdings (`$0.00` value).
- **Expected Behavior & Why:**
  - Must short-circuit LLM speculation, avoid division-by-zero in return/weight formulas, and instruct the user to add their first holding.
- **Observed Agent Output:**
  - Returned `$0.00` across all metrics via the `deterministic-guard (empty-portfolio)` node and provided onboarding steps.
- **Assessment:** **PASS**.

---

## 3. Observed Problems During Iteration & Changes Made

1. **Initial Problem — LLM Arithmetic Drift:** In early prototyping, passing raw tax lots to an LLM prompt caused minor rounding discrepancies (off by `$0.02`–`$0.15` on weighted-average cost basis across accounts).
   - **Fix Implemented:** Moved 100% of arithmetic into `backend/calculations.py` using Python's `decimal.Decimal` with `ROUND_HALF_UP`. The LLM now receives pre-verified numbers and is instructed to cite them verbatim.
2. **Initial Problem — Duplicate Analysis Records on Repeated Button Clicks:** Clicking "Trigger On-Demand Review" multiple times in a row created redundant identical rows in the database.
   - **Fix Implemented:** Added `compute_idempotent_period_key()` in `backend/agent.py`, which hashes the portfolio state (`mv`, `cb`, `lots`, `topHoldingTicker`) with SHA-256 (`ON-DEMAND-YYYY-MM-DD-<8char_hash>`) and uses `YYYY-MM-MONTHLY` for scheduled monthly runs. Repeated runs upsert the existing document in-place.

---

## 4. Model Swap Validation Protocol: *"If you changed models tomorrow, how would you know the agent still works?"*

If we swapped `groq/llama-3.3-70b-versatile` for another model tomorrow (e.g., `llama-3.1-8b-instant`, `mixtral-8x7b`, or a newer frontier model), we validate the change in three steps without needing an expensive external judge:

1. **Rerun the 4 Canonical Fixtures (`python3 -m evals.run_evals`):**
   - Run Case 1 (Multi-Account AAPL/GOOGL), Case 2 (87% NVDA Concentration), Case 3 (Unavailable Ticker `ACMECORP`), and Case 4 (Empty Portfolio) at `temperature=0.1`.
2. **Automated Deterministic & Structural Comparison:**
   - **Schema Validity:** Does the new model return valid JSON containing all 5 required keys (`executiveSummary`, `concentrationAnalysis`, `dataQualityNotice`, `recommendationsText`, `limitationsAndBasis`)?
   - **Zero Numerical Hallucination:** Do every dollar figure and percentage appearing in the prose match the deterministic output of `compute_portfolio_metrics()` to 2 decimal places?
   - **Data Quality Disclosure:** In Case 3 (`ACMECORP`), does `dataQualityNotice` explicitly mention `ACMECORP` and cost-basis fallback?
   - **Tax-Location & Concentration Logic:** In Cases 1 and 2, does the output identify positions `>= 25%` and distinguish taxable `INVESTMENT` accounts from tax-advantaged `RETIREMENT` accounts?
3. **Accept / Reject Criteria:**
   - **Reject Immediately** if the candidate model invents any price/return number, fails to flag `ACMECORP` as unavailable, recommends autonomous trade execution, or exceeds a 10-second p95 latency budget.
   - **Accept** only if all 4 cases pass 100% of deterministic and qualitative assertions in `evals/run_evals.py`.
