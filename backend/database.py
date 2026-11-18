"""
Meridian Portfolio Ledger — Database Layer (Neon Serverless PostgreSQL + SQLite Fallback)
Elios Academy Forward Deployed Engineer Capstone

Provides deterministic persistence for:
- Accounts (Investment vs Retirement)
- Holdings (Tax lots with purchase price, quantity, acquisition date)
- Quote Cache & Price History (Finnhub market data with staleness tracking)
- Favorites & Research Notes
- Saved Agent Analyses (Monthly & On-Demand runs with idempotency keys)
"""

import os
import json
import sqlite3
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("meridian.db")

NEON_DATABASE_URL = os.environ.get("NEON_DATABASE_URL", "")
LOCAL_SQLITE_PATH = os.environ.get("LOCAL_SQLITE_PATH", "/tmp/meridian_portfolio.db")

# Optional SQLAlchemy / psycopg2 driver for Neon Serverless PostgreSQL when installed
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False


POSTGRES_DDL = """
CREATE TABLE IF NOT EXISTS users (
    uid VARCHAR(128) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('INVESTMENT', 'RETIREMENT')),
    institution VARCHAR(80) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS holdings (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    account_id VARCHAR(128) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    account_name VARCHAR(80) NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('INVESTMENT', 'RETIREMENT')),
    ticker VARCHAR(12) NOT NULL,
    shares NUMERIC(18, 6) NOT NULL CHECK (shares > 0),
    purchase_price NUMERIC(18, 4) NOT NULL CHECK (purchase_price > 0),
    purchase_date VARCHAR(10) NOT NULL,
    notes VARCHAR(240) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, account_id, ticker, purchase_date, purchase_price)
);

CREATE TABLE IF NOT EXISTS market_quotes (
    ticker VARCHAR(12) PRIMARY KEY,
    company_name VARCHAR(120) NOT NULL,
    sector VARCHAR(80) NOT NULL,
    current_price NUMERIC(18, 4) NOT NULL,
    previous_close NUMERIC(18, 4) NOT NULL,
    change_amount NUMERIC(18, 4) NOT NULL,
    change_pct NUMERIC(10, 4) NOT NULL,
    high_price NUMERIC(18, 4) NOT NULL,
    low_price NUMERIC(18, 4) NOT NULL,
    market_cap_b NUMERIC(18, 2) NOT NULL DEFAULT 0,
    pe_ratio NUMERIC(10, 2) NOT NULL DEFAULT 0,
    dividend_yield_pct NUMERIC(8, 2) NOT NULL DEFAULT 0,
    week_52_high NUMERIC(18, 4) NOT NULL DEFAULT 0,
    week_52_low NUMERIC(18, 4) NOT NULL DEFAULT 0,
    quote_timestamp TIMESTAMPTZ NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source VARCHAR(40) NOT NULL DEFAULT 'FINNHUB_REST_V1',
    is_stale BOOLEAN NOT NULL DEFAULT FALSE,
    is_unavailable BOOLEAN NOT NULL DEFAULT FALSE,
    status_reason VARCHAR(240) NOT NULL DEFAULT 'Fresh real-time market quote'
);

CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(12) NOT NULL,
    price_date VARCHAR(10) NOT NULL,
    close_price NUMERIC(18, 4) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ticker, price_date)
);

CREATE TABLE IF NOT EXISTS favorites (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    ticker VARCHAR(12) NOT NULL,
    company_name VARCHAR(120) NOT NULL,
    sector VARCHAR(80) NOT NULL,
    thesis_notes VARCHAR(500) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, ticker)
);

CREATE TABLE IF NOT EXISTS agent_analyses (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    period_key VARCHAR(64) NOT NULL,
    trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('MONTHLY', 'ON_DEMAND')),
    model_used VARCHAR(80) NOT NULL,
    total_value NUMERIC(18, 2) NOT NULL,
    total_cost_basis NUMERIC(18, 2) NOT NULL,
    total_unrealized_gain NUMERIC(18, 2) NOT NULL,
    total_return_pct NUMERIC(10, 2) NOT NULL,
    top_holding_ticker VARCHAR(12) NOT NULL,
    top_holding_weight_pct NUMERIC(10, 2) NOT NULL,
    stale_or_missing_count INTEGER NOT NULL DEFAULT 0,
    executive_summary TEXT NOT NULL,
    concentration_analysis TEXT NOT NULL,
    data_quality_notice TEXT NOT NULL,
    recommendations_text TEXT NOT NULL,
    limitations_and_basis TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, period_key)
);
"""


SQLITE_DDL = """
CREATE TABLE IF NOT EXISTS market_quotes (
    ticker TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    sector TEXT NOT NULL,
    current_price REAL NOT NULL,
    previous_close REAL NOT NULL,
    change_amount REAL NOT NULL,
    change_pct REAL NOT NULL,
    high_price REAL NOT NULL,
    low_price REAL NOT NULL,
    market_cap_b REAL NOT NULL DEFAULT 0,
    pe_ratio REAL NOT NULL DEFAULT 0,
    dividend_yield_pct REAL NOT NULL DEFAULT 0,
    week_52_high REAL NOT NULL DEFAULT 0,
    week_52_low REAL NOT NULL DEFAULT 0,
    quote_timestamp TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    source TEXT NOT NULL,
    is_stale INTEGER NOT NULL DEFAULT 0,
    is_unavailable INTEGER NOT NULL DEFAULT 0,
    status_reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_history (
    ticker TEXT NOT NULL,
    price_date TEXT NOT NULL,
    close_price REAL NOT NULL,
    recorded_at TEXT NOT NULL,
    PRIMARY KEY (ticker, price_date)
);
"""


def get_sqlite_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(LOCAL_SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SQLITE_DDL)
    return conn


def init_db() -> Dict[str, Any]:
    """Initialize Neon PostgreSQL schema if NEON_DATABASE_URL is configured, plus local SQLite quote history store."""
    conn = get_sqlite_conn()
    conn.close()
    if NEON_DATABASE_URL and HAS_PSYCOPG2:
        try:
            with psycopg2.connect(NEON_DATABASE_URL) as pg_conn:
                with pg_conn.cursor() as cur:
                    cur.execute(POSTGRES_DDL)
                pg_conn.commit()
            return {"engine": "NEON_POSTGRESQL", "status": "initialized"}
        except Exception as exc:
            logger.warning("Neon PostgreSQL connection failed, falling back to local + Firestore store: %s", exc)
    return {"engine": "FIRESTORE_AND_SQLITE_HYBRID", "status": "initialized"}
