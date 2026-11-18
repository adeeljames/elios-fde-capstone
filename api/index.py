"""
Vercel Python Serverless ASGI Entrypoint (`api/index.py`)
Routes all `/api/*` requests directly to the Python FastAPI + LangGraph + MCP application (`backend.main:app`).
"""

from backend.main import app

__all__ = ["app"]
