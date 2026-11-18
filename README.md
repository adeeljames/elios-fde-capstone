# Meridian Portfolio Ledger

**Elios Academy — Forward Deployed Engineer Capstone**

Meridian Portfolio Ledger is a live, multi-account stock portfolio tracker, deterministic cost-basis calculation engine, Finnhub market-data and price-history monitor, LangGraph + Groq portfolio analysis agent, and authenticated Model Context Protocol (MCP) server.

---

## 1. Client Brief & Problem Solved

> *"I own shares of Alphabet and Apple. I bought them at different prices and hold them across investment and retirement accounts. Let me sign in, enter my holdings, and understand how they are doing. I also want to follow favorite tickers and do basic research. Give me an agent that analyzes my portfolio and explains its recommendations, and let me work with my portfolio through an MCP-connected assistant."*

### Key Scoping Decisions & Documented Assumptions
1. **Base Currency (`USD`):** All equity share prices, tax-lot purchase prices, and portfolio valuations are strictly denominated in US Dollars (`$`).
2. **Cost-Basis Methodology:**
   - **Per-Account Lot Tracking:** Specific tax-lot identification (`shares * purchasePrice`) is preserved for each acquisition entry inside a specific account (`INVESTMENT` vs. `RETIREMENT`).
   - **Cross-Account Aggregation:** When the same ticker (e.g., `GOOGL` or `AAPL`) is held across multiple accounts at different purchase prices, the Python calculation engine computes the exact **weighted-average cost basis** ($\frac{\sum \text{shares}_i \times \text{price}_i}{\sum \text{shares}_i}$) alongside combined market value and unrealized gain/loss.
3. **Transaction Fees & Dividends:** Assumes `$0.00` brokerage commission per trade (standard US zero-commission schedule) and evaluates unrealized performance on a **price-return basis** (excluding cash dividend payouts or dividend reinvestment).
4. **Concentration Risk Threshold (`25.0%`):** Any single equity position representing $\ge 25.0\%$ of total portfolio market value is deterministically flagged as a single-stock concentration risk.
5. **Scope Boundary (No Trade Execution):** The LangGraph agent provides analytical commentary, concentration diagnostics, and tax-location observations (e.g., prioritizing rebalancing inside tax-advantaged Retirement accounts to avoid taxable capital gains), and explicitly states that trade execution is outside scope.

---

## 2. Architecture & Technology Stack

| Layer | Technology Choice | Rationale & Alternatives Considered |
| :--- | :--- | :--- |
| **Authentication & Tenant Isolation** | **Google OAuth 2.0 (Firebase Auth)** | Satisfies the requirement for OAuth-based sign-in rather than local username/password accounts. Every UI action, backend route, LangGraph run, and MCP JSON-RPC call verifies the signed OAuth Bearer ID token (`verifyIdToken`) and enforces strict per-user isolation (`userId == decoded.uid`). |
| **Backend & Agent Framework** | **Python 3.10 + LangGraph (`backend/agent.py`, `backend/calculations.py`)** | Implements the portfolio state machine (`StateGraph`), deterministic `Decimal` math engine, Finnhub quote manager, and MCP input validator in Python, bridged seamlessly with the web gateway (`server.ts`). |
| **LLM Provider** | **Groq (`llama-3.3-70b-versatile`)** | Delivers sub-second structured JSON inference at `temperature=0.1`. Paired with a deterministic institutional fallback so external LLM rate limits or outages never break user workflows. |
| **Market Data API** | **Finnhub Stock API v1 (`backend/market_data.py`)** | Fetches live quotes (`/api/v1/quote`), caches responses for 5 minutes to respect the 60 calls/min free-tier rate limit, persists historical closes in `price_history`, and flags quotes older than 15 minutes as `STALE` or unknown symbols as `UNAVAILABLE`. |
| **Persistent Database** | **Neon Serverless PostgreSQL (`backend/database.py`) + Firestore Enterprise + SQLite Price History** | Supports `NEON_DATABASE_URL` (PostgreSQL DDL in `backend/database.py`) alongside hardened zero-trust Firestore collections (`/users/{userId}/accounts`, `holdings`, `favorites`, `analyses`) and local SQLite `price_history` persistence. |
| **MCP Server** | **JSON-RPC 2.0 MCP Server (`/api/mcp` & `backend/mcp_server.py`)** | Exposes `get_portfolio_holdings`, `get_computed_metrics`, `get_latest_analysis`, and `upsert_holding` to any compatible MCP client with OAuth Bearer token enforcement. |

---

## 3. Data Model

1. **`accounts` (`/users/{userId}/accounts/{accountId}`)**
   - `userId` (`string`), `name` (`string`), `accountType` (`INVESTMENT` | `RETIREMENT`), `institution` (`string`), `currency` (`USD`), `createdAt`, `updatedAt`.
2. **`holdings` (`/users/{userId}/holdings/{holdingId}`)**
   - `userId` (`string`), `accountId` (`string`), `accountName` (`string`), `accountType` (`INVESTMENT` | `RETIREMENT`), `ticker` (`string`), `shares` (`number > 0`), `purchasePrice` (`number > 0`), `purchaseDate` (`YYYY-MM-DD`), `notes` (`string`), `createdAt`, `updatedAt`.
3. **`market_quotes` & `price_history` (`backend/database.py`)**
   - Stores latest quote (`current_price`, `previous_close`, `change_amount`, `change_pct`, `quote_timestamp`, `is_stale`, `is_unavailable`, `status_reason`) and historical daily closes (`ticker`, `price_date`, `close_price`).
4. **`favorites` (`/users/{userId}/favorites/{favoriteId}`)**
   - `userId` (`string`), `ticker` (`string`), `companyName` (`string`), `sector` (`string`), `thesisNotes` (`string`), `createdAt`, `updatedAt`.
5. **`analyses` (`/users/{userId}/analyses/{analysisId}`)**
   - `userId`, `periodKey` (idempotency key), `triggerType` (`MONTHLY` | `ON_DEMAND`), `modelUsed`, `totalValue`, `totalCostBasis`, `totalUnrealizedGain`, `totalReturnPct`, `topHoldingTicker`, `topHoldingWeightPct`, `staleOrMissingCount`, `executiveSummary`, `concentrationAnalysis`, `dataQualityNotice`, `recommendationsText`, `limitationsAndBasis`, `createdAt`, `updatedAt`.

---

## 4. Setup & Local Development

1. **Copy Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   Populate `GROQ_API_KEY`, `FINNHUB_API_KEY`, and optionally `NEON_DATABASE_URL`.
2. **Install Dependencies:**
   ```bash
   npm install
   pip install -r requirements.txt  # Optional when running standalone FastAPI
   ```
3. **Start the Full-Stack Application (Port 3000):**
   ```bash
   npm run dev
   ```
4. **Run the Evaluation Suite (`4/4` Cases):**
   ```bash
   python3 -m evals.run_evals
   ```

---

## 5. Instructions for Reviewers (Live Site, Agent & MCP)

### A. Signing Into the Live Application
1. Open the live application URL and click **Sign In with Google OAuth** in the top navigation bar or hero section.
2. Once signed in, click **Load Client Brief Portfolio (Alphabet & Apple Across Accounts)** on the empty-state screen to immediately populate 2 accounts (`Individual Brokerage` and `Roth IRA Retirement`), 4 tax lots of `GOOGL` and `AAPL` at different purchase prices, and 2 favorite tickers (`MSFT`, `VTI`).
3. Navigate to **Accounts & Lots** to add new investment/retirement accounts or add/update holdings.
4. Navigate to **Research** to inspect stock fundamentals, stored price history, and manage favorite tickers.

### B. Triggering the Managed LangGraph Agent On Demand
1. Navigate to **Agent Advisory** (or click **Run Agent Portfolio Review** on the Portfolio screen).
2. Click **Trigger On-Demand Review** or **Run Scheduled Monthly Analysis**.
3. Inspect the saved report covering performance, multi-account concentration, quote staleness/availability, reasoned recommendations, and scope limitations. Repeated clicks with unchanged holdings update the existing record via its deterministic `periodKey` rather than creating duplicate entries.

### C. Connecting Through MCP
1. Navigate to the **MCP & Eval** tab in the application.
2. Use the built-in **Interactive MCP Client Console** to invoke `get_computed_metrics`, `get_portfolio_holdings`, `get_latest_analysis`, or `upsert_holding`, or test the **401 Unauthenticated Reject** and **Invalid Input Guard** buttons.
3. To connect an external MCP client (Claude Desktop, Cursor, or `curl`), click **Copy My OAuth Bearer Token** in the **MCP & Eval** tab and call `POST /api/mcp`:
   ```bash
   curl -X POST "<LIVE_APP_URL>/api/mcp" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <YOUR_OAUTH_ID_TOKEN>" \
     -d '{
       "jsonrpc": "2.0",
       "id": 1,
       "method": "tools/call",
       "params": {
         "name": "get_computed_metrics",
         "arguments": {}
       }
     }'
   ```

---

## 6. Operating Costs, Provider Limits, Failure Handling & Handoff

- **Finnhub Market Data Limits:** Free tier allows **60 API calls/minute**. The backend caches quotes for 5 minutes and persists historical closes. If Finnhub is rate-limited or unreachable, the app serves the most recent cached exchange snapshot and clearly labels the quote status as `STALE` with the exact timestamp. If a user enters an unrecognized ticker symbol, the quote is marked `UNAVAILABLE` and valued at purchase cost basis so portfolio calculations never fail.
- **Groq LLM Limits & Failure Handling:** Groq free/developer tier enforces token-per-minute limits. If Groq returns a 429 or network timeout, the LangGraph synthesis node automatically falls back to a deterministic institutional report generator grounded in the exact same Python `Decimal` metrics.
- **Idempotency & Retries:**
  - Holding upserts match on `(accountId, ticker, purchaseDate, purchasePrice)` or `holdingId` so network retries never create duplicate tax lots.
  - Agent runs compute an idempotent `periodKey` (`YYYY-MM-MONTHLY` for monthly runs, `ON-DEMAND-YYYY-MM-DD-<sha256_hash>` for on-demand runs) so repeated clicks update in-place.
- **Evaluation Evidence:** Full evaluation cases, expected vs. observed outputs, and the model-swap validation protocol are documented in [`evals/EVALUATION_REPORT.md`](evals/EVALUATION_REPORT.md) and executable via `python3 -m evals.run_evals`.
