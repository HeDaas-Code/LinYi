"""Local-database-backed hybrid memory store (Design.md §8 / §14).

This module implements a *local-first* hybrid memory backend using SQLite.
It supports four storage modalities aligned with Design.md:

* **Document store**: full fragments and traces.
* **Vector store**: embeddings stored as JSON blobs with in-process cosine
  similarity (no external vector DB).
* **Graph store**: typed edges between memory entities (fragment → trace,
  trace → trace, fragment → fragment).
* **Time-series store**: event stream indexed by timestamp.

The store is intentionally dependency-free (only the Python stdlib) so it
runs anywhere the rest of the prototype runs.
"""

from __future__ import annotations

import json
import math
import sqlite3
import time
from collections import defaultdict
from typing import Any

from src.novelist_brain.models import Fragment, SocialTrace, Trace
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass


class HybridMemoryStore:
    """SQLite-backed hybrid memory store.

    Parameters
    ----------
    db_path:
        Path to the SQLite database file. Defaults to an in-memory database
        for testing; production should use a file path.
    embedding_dim:
        Expected embedding dimension. Used to validate / pad stored vectors.
    """

    def __init__(
        self,
        db_path: str = ":memory:",
        embedding_dim: int = 1536,
    ) -> None:
        self._db_path = db_path
        self._embedding_dim = embedding_dim
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._ensure_schema()

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------
    def _ensure_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS fragments (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                source TEXT NOT NULL,
                modality TEXT NOT NULL,
                valence REAL NOT NULL,
                arousal REAL NOT NULL,
                salience REAL NOT NULL,
                timestamp REAL NOT NULL,
                tags TEXT NOT NULL,        -- JSON list
                embedding TEXT,            -- JSON list or NULL
                data TEXT NOT NULL         -- full JSON dict
            );

            CREATE INDEX IF NOT EXISTS idx_fragments_timestamp
                ON fragments(timestamp);
            CREATE INDEX IF NOT EXISTS idx_fragments_source
                ON fragments(source);

            CREATE TABLE IF NOT EXISTS traces (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                narrative_role TEXT NOT NULL,
                importance REAL NOT NULL,
                recency REAL NOT NULL,
                relevance REAL NOT NULL,
                emotional_weight REAL NOT NULL,
                timestamp REAL NOT NULL DEFAULT 0,
                tags TEXT NOT NULL,        -- JSON list
                fragment_ids TEXT NOT NULL,-- JSON list
                data TEXT NOT NULL,        -- full JSON dict
                is_social INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_traces_importance
                ON traces(importance);
            CREATE INDEX IF NOT EXISTS idx_traces_timestamp
                ON traces(timestamp);

            CREATE TABLE IF NOT EXISTS edges (
                source_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                edge_type TEXT NOT NULL,
                weight REAL NOT NULL DEFAULT 1.0,
                timestamp REAL NOT NULL,
                data TEXT,
                PRIMARY KEY (source_id, target_id, edge_type)
            );

            CREATE INDEX IF NOT EXISTS idx_edges_source
                ON edges(source_id);
            CREATE INDEX IF NOT EXISTS idx_edges_target
                ON edges(target_id);

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                entity_id TEXT,
                timestamp REAL NOT NULL,
                payload TEXT NOT NULL     -- JSON dict
            );

            CREATE INDEX IF NOT EXISTS idx_events_type_time
                ON events(event_type, timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_entity
                ON events(entity_id);
            """
        )
        self._conn.commit()

    # ------------------------------------------------------------------
    # Fragment operations
    # ------------------------------------------------------------------
    def save_fragment(self, fragment: Fragment) -> None:
        """Insert or replace a fragment."""
        data = dataclass_to_dict(fragment)
        embedding_json = json.dumps(fragment.embedding) if fragment.embedding else None
        self._conn.execute(
            """
            INSERT OR REPLACE INTO fragments
            (id, content, source, modality, valence, arousal, salience,
             timestamp, tags, embedding, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fragment.id,
                fragment.content,
                fragment.source,
                fragment.modality,
                fragment.valence,
                fragment.arousal,
                fragment.salience,
                fragment.timestamp,
                json.dumps(fragment.tags, ensure_ascii=False),
                embedding_json,
                json.dumps(data, ensure_ascii=False),
            ),
        )
        self._conn.commit()
        self._log_event("fragment.stored", fragment.id, {"source": fragment.source})

    def get_fragment(self, fragment_id: str) -> Fragment | None:
        row = self._conn.execute(
            "SELECT data FROM fragments WHERE id = ?", (fragment_id,)
        ).fetchone()
        if row is None:
            return None
        return reconstruct_dataclass(Fragment, json.loads(row["data"]))

    def list_fragments(
        self,
        source: str | None = None,
        since: float | None = None,
        limit: int = 1000,
    ) -> list[Fragment]:
        query = "SELECT data FROM fragments WHERE 1=1"
        params: list[Any] = []
        if source is not None:
            query += " AND source = ?"
            params.append(source)
        if since is not None:
            query += " AND timestamp >= ?"
            params.append(since)
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        rows = self._conn.execute(query, params).fetchall()
        return [reconstruct_dataclass(Fragment, json.loads(r["data"])) for r in rows]

    def fragment_count(self) -> int:
        row = self._conn.execute("SELECT COUNT(*) AS c FROM fragments").fetchone()
        return int(row["c"]) if row else 0

    # ------------------------------------------------------------------
    # Trace operations
    # ------------------------------------------------------------------
    def save_trace(self, trace: Trace) -> None:
        """Insert or replace a trace."""
        data = dataclass_to_dict(trace)
        is_social = 1 if isinstance(trace, SocialTrace) else 0
        self._conn.execute(
            """
            INSERT OR REPLACE INTO traces
            (id, content, narrative_role, importance, recency, relevance,
             emotional_weight, timestamp, tags, fragment_ids, data, is_social)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                trace.id,
                trace.content,
                trace.narrative_role,
                trace.importance,
                trace.recency,
                trace.relevance,
                trace.emotional_weight,
                data.get("timestamp", 0.0),
                json.dumps(trace.tags, ensure_ascii=False),
                json.dumps(trace.fragment_ids, ensure_ascii=False),
                json.dumps(data, ensure_ascii=False),
                is_social,
            ),
        )
        self._conn.commit()
        self._log_event("trace.created", trace.id, {"is_social": is_social})

    def get_trace(self, trace_id: str) -> Trace | None:
        row = self._conn.execute(
            "SELECT data, is_social FROM traces WHERE id = ?", (trace_id,)
        ).fetchone()
        if row is None:
            return None
        cls = SocialTrace if row["is_social"] else Trace
        return reconstruct_dataclass(cls, json.loads(row["data"]))

    def list_traces(
        self,
        min_importance: float | None = None,
        narrative_role: str | None = None,
        limit: int = 1000,
    ) -> list[Trace]:
        query = "SELECT data, is_social FROM traces WHERE 1=1"
        params: list[Any] = []
        if min_importance is not None:
            query += " AND importance >= ?"
            params.append(min_importance)
        if narrative_role is not None:
            query += " AND narrative_role = ?"
            params.append(narrative_role)
        query += " ORDER BY importance DESC, recency DESC LIMIT ?"
        params.append(limit)
        rows = self._conn.execute(query, params).fetchall()
        return [
            reconstruct_dataclass(
                SocialTrace if r["is_social"] else Trace, json.loads(r["data"])
            )
            for r in rows
        ]

    def trace_count(self) -> int:
        row = self._conn.execute("SELECT COUNT(*) AS c FROM traces").fetchone()
        return int(row["c"]) if row else 0

    # ------------------------------------------------------------------
    # Vector similarity
    # ------------------------------------------------------------------
    def find_similar_fragments(
        self,
        query_embedding: list[float],
        top_k: int = 5,
        min_score: float = 0.0,
    ) -> list[tuple[Fragment, float]]:
        """Return fragments sorted by cosine similarity to ``query_embedding``."""
        rows = self._conn.execute(
            "SELECT data, embedding FROM fragments WHERE embedding IS NOT NULL"
        ).fetchall()
        scored: list[tuple[float, Fragment]] = []
        for row in rows:
            emb = json.loads(row["embedding"])
            if not emb:
                continue
            score = _cosine_similarity(query_embedding, emb)
            if score >= min_score:
                scored.append((score, reconstruct_dataclass(Fragment, json.loads(row["data"]))))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [(frag, score) for score, frag in scored[:top_k]]

    # ------------------------------------------------------------------
    # Graph operations
    # ------------------------------------------------------------------
    def add_edge(
        self,
        source_id: str,
        target_id: str,
        edge_type: str,
        weight: float = 1.0,
        data: dict[str, Any] | None = None,
    ) -> None:
        self._conn.execute(
            """
            INSERT OR REPLACE INTO edges
            (source_id, target_id, edge_type, weight, timestamp, data)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                source_id,
                target_id,
                edge_type,
                weight,
                time.time(),
                json.dumps(data or {}, ensure_ascii=False),
            ),
        )
        self._conn.commit()

    def get_neighbors(
        self,
        entity_id: str,
        edge_type: str | None = None,
        direction: str = "outgoing",
    ) -> list[tuple[str, str, float]]:
        """Return (neighbor_id, edge_type, weight) tuples."""
        results: list[tuple[str, str, float]] = []
        if direction in ("outgoing", "both"):
            query = "SELECT target_id AS nid, edge_type, weight FROM edges WHERE source_id = ?"
            params: list[Any] = [entity_id]
            if edge_type is not None:
                query += " AND edge_type = ?"
                params.append(edge_type)
            for row in self._conn.execute(query, params).fetchall():
                results.append((row["nid"], row["edge_type"], row["weight"]))
        if direction in ("incoming", "both"):
            query = "SELECT source_id AS nid, edge_type, weight FROM edges WHERE target_id = ?"
            params = [entity_id]
            if edge_type is not None:
                query += " AND edge_type = ?"
                params.append(edge_type)
            for row in self._conn.execute(query, params).fetchall():
                results.append((row["nid"], row["edge_type"], row["weight"]))
        return results

    def graph_rank(
        self,
        entity_ids: list[str],
        edge_type: str | None = None,
        iterations: int = 10,
        damping: float = 0.85,
    ) -> dict[str, float]:
        """Run a tiny PageRank over the subgraph induced by ``entity_ids``."""
        if not entity_ids:
            return {}
        id_set = set(entity_ids)
        scores = {eid: 1.0 / len(entity_ids) for eid in entity_ids}

        for _ in range(iterations):
            new_scores: dict[str, float] = defaultdict(float)
            for eid in entity_ids:
                neighbors = self.get_neighbors(eid, edge_type=edge_type, direction="outgoing")
                valid = [(n, w) for n, _, w in neighbors if n in id_set]
                total = sum(w for _, w in valid) or 1.0
                for n, w in valid:
                    new_scores[n] += damping * scores[eid] * (w / total)
            # Re-insert random jump.
            jump = (1.0 - damping) / len(entity_ids)
            for eid in entity_ids:
                scores[eid] = jump + new_scores.get(eid, 0.0)
        return scores

    # ------------------------------------------------------------------
    # Time-series operations
    # ------------------------------------------------------------------
    def _log_event(
        self,
        event_type: str,
        entity_id: str | None,
        payload: dict[str, Any],
    ) -> None:
        self._conn.execute(
            """
            INSERT INTO events (event_type, entity_id, timestamp, payload)
            VALUES (?, ?, ?, ?)
            """,
            (
                event_type,
                entity_id,
                time.time(),
                json.dumps(payload, ensure_ascii=False),
            ),
        )
        self._conn.commit()

    def query_events(
        self,
        event_type: str | None = None,
        entity_id: str | None = None,
        since: float | None = None,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM events WHERE 1=1"
        params: list[Any] = []
        if event_type is not None:
            query += " AND event_type = ?"
            params.append(event_type)
        if entity_id is not None:
            query += " AND entity_id = ?"
            params.append(entity_id)
        if since is not None:
            query += " AND timestamp >= ?"
            params.append(since)
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        rows = self._conn.execute(query, params).fetchall()
        return [
            {
                "id": r["id"],
                "event_type": r["event_type"],
                "entity_id": r["entity_id"],
                "timestamp": r["timestamp"],
                "payload": json.loads(r["payload"]),
            }
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------
    def close(self) -> None:
        self._conn.close()

    def clear(self) -> None:
        """Drop all data. Useful for tests."""
        self._conn.executescript(
            """
            DELETE FROM fragments;
            DELETE FROM traces;
            DELETE FROM edges;
            DELETE FROM events;
            """
        )
        self._conn.commit()


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two equal-length vectors."""
    if len(a) != len(b):
        # Pad shorter vector with zeros rather than rejecting.
        dim = max(len(a), len(b))
        a = list(a) + [0.0] * (dim - len(a))
        b = list(b) + [0.0] * (dim - len(b))
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)
