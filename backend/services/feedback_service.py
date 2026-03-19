"""
Feedback service — stores user feedback on individual findings.
Uses aiosqlite for lightweight local storage.
Thread-safe initialization with asyncio.Lock.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Literal, Optional

import os

import aiosqlite

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get("FEEDBACK_DB_PATH", "feedback.db")
_initialized = False
_init_lock = asyncio.Lock()

MAX_COMMENT_LENGTH = 5000


async def _ensure_table():
    global _initialized
    async with _init_lock:
        if _initialized:
            return
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    address TEXT NOT NULL,
                    finding_type TEXT NOT NULL,
                    vote TEXT NOT NULL,
                    comment TEXT,
                    created_at TEXT NOT NULL
                )
            """)
            await db.commit()
        _initialized = True
        logger.info("Feedback table initialized at %s", DB_PATH)


async def save_feedback(
    address: str,
    finding_type: str,
    vote: Literal["up", "down"],
    comment: Optional[str] = None,
) -> int:
    """Save feedback and return the row ID."""
    # Validate comment length
    if comment and len(comment) > MAX_COMMENT_LENGTH:
        comment = comment[:MAX_COMMENT_LENGTH]

    await _ensure_table()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO feedback (address, finding_type, vote, comment, created_at) VALUES (?, ?, ?, ?, ?)",
            (address, finding_type, vote, comment, datetime.now(tz=timezone.utc).isoformat()),
        )
        await db.commit()
        row_id = cursor.lastrowid
    logger.info("Feedback saved: %s/%s → %s (id=%d)", address, finding_type, vote, row_id)
    return row_id


async def get_feedback_stats() -> dict:
    """Return aggregate feedback stats."""
    await _ensure_table()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM feedback")
        total = (await cursor.fetchone())[0]
        cursor = await db.execute("SELECT COUNT(*) FROM feedback WHERE vote='down'")
        down = (await cursor.fetchone())[0]
    return {"total": total, "thumbs_up": total - down, "thumbs_down": down}
