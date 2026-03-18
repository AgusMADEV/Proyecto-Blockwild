from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "minecraft_isometrico.sqlite3"

app = Flask(__name__)


def db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db_connection() as conn:
        conn.executescript(
            """
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS game_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                mode TEXT NOT NULL DEFAULT 'creative',
                started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ended_at TEXT,
                result TEXT,
                blocks_placed INTEGER NOT NULL DEFAULT 0,
                blocks_destroyed INTEGER NOT NULL DEFAULT 0,
                playtime_seconds INTEGER NOT NULL DEFAULT 0,
                world_seed INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (player_id) REFERENCES players(id)
            );

            CREATE TABLE IF NOT EXISTS game_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                event_value INTEGER NOT NULL DEFAULT 0,
                payload_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES game_sessions(id)
            );
            """
        )


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "db": str(DB_PATH.name)})


@app.route("/api/player/register", methods=["POST"])
def register_player():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()[:40]
    if len(name) < 3:
        return jsonify({"ok": False, "error": "Nombre demasiado corto"}), 400

    with db_connection() as conn:
        conn.execute(
            """
            INSERT INTO players (name) VALUES (?)
            ON CONFLICT(name) DO UPDATE SET last_seen=CURRENT_TIMESTAMP
            """,
            (name,),
        )
        row = conn.execute(
            "SELECT id, name, created_at, last_seen FROM players WHERE name = ?",
            (name,),
        ).fetchone()

    return jsonify({"ok": True, "player": row_to_dict(row)})


@app.route("/api/session/start", methods=["POST"])
def start_session():
    payload = request.get_json(silent=True) or {}
    player_id = payload.get("player_id")
    mode = payload.get("mode", "creative")
    world_seed = payload.get("world_seed", 0)

    if not player_id:
        return jsonify({"ok": False, "error": "player_id requerido"}), 400

    with db_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO game_sessions (player_id, mode, world_seed)
            VALUES (?, ?, ?)
            """,
            (player_id, mode, world_seed),
        )
        session_id = cursor.lastrowid
        row = conn.execute(
            "SELECT * FROM game_sessions WHERE id = ?", (session_id,)
        ).fetchone()

    return jsonify({"ok": True, "session": row_to_dict(row)})


@app.route("/api/session/event", methods=["POST"])
def log_event():
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("session_id")
    event_type = payload.get("event_type", "")
    event_value = payload.get("event_value", 0)
    payload_json = json.dumps(payload.get("payload", {}))

    if not session_id or not event_type:
        return jsonify({"ok": False, "error": "session_id y event_type requeridos"}), 400

    with db_connection() as conn:
        conn.execute(
            """
            INSERT INTO game_events (session_id, event_type, event_value, payload_json)
            VALUES (?, ?, ?, ?)
            """,
            (session_id, event_type, event_value, payload_json),
        )

    return jsonify({"ok": True})


@app.route("/api/session/end", methods=["POST"])
def end_session():
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("session_id")
    result = payload.get("result", "quit")
    blocks_placed = payload.get("blocks_placed", 0)
    blocks_destroyed = payload.get("blocks_destroyed", 0)
    playtime_seconds = payload.get("playtime_seconds", 0)

    if not session_id:
        return jsonify({"ok": False, "error": "session_id requerido"}), 400

    with db_connection() as conn:
        conn.execute(
            """
            UPDATE game_sessions 
            SET ended_at = CURRENT_TIMESTAMP,
                result = ?,
                blocks_placed = ?,
                blocks_destroyed = ?,
                playtime_seconds = ?
            WHERE id = ?
            """,
            (result, blocks_placed, blocks_destroyed, playtime_seconds, session_id),
        )

    return jsonify({"ok": True})


@app.route("/api/leaderboard")
def leaderboard():
    limit = request.args.get("limit", 10, type=int)

    with db_connection() as conn:
        rows = conn.execute(
            """
            SELECT 
                p.name,
                gs.blocks_placed,
                gs.blocks_destroyed,
                gs.playtime_seconds,
                gs.started_at
            FROM game_sessions gs
            JOIN players p ON gs.player_id = p.id
            WHERE gs.ended_at IS NOT NULL
            ORDER BY gs.blocks_placed DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return jsonify({"ok": True, "leaderboard": [row_to_dict(r) for r in rows]})


@app.route("/api/player/<int:player_id>/history")
def player_history(player_id: int):
    with db_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM game_sessions 
            WHERE player_id = ?
            ORDER BY started_at DESC
            LIMIT 20
            """,
            (player_id,),
        ).fetchall()

    return jsonify({"ok": True, "history": [row_to_dict(r) for r in rows]})


@app.route("/api/stats")
def stats():
    with db_connection() as conn:
        total_players = conn.execute("SELECT COUNT(*) as c FROM players").fetchone()["c"]
        total_sessions = conn.execute("SELECT COUNT(*) as c FROM game_sessions").fetchone()["c"]
        total_blocks = conn.execute(
            "SELECT SUM(blocks_placed) as total FROM game_sessions"
        ).fetchone()["total"] or 0

    return jsonify({
        "ok": True,
        "stats": {
            "total_players": total_players,
            "total_sessions": total_sessions,
            "total_blocks_placed": total_blocks,
        }
    })


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5090, debug=True)
