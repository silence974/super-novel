from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT / "out" / "state_graph_spike.db"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def open_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def apply_schema(conn: sqlite3.Connection) -> bool:
    schema = (ROOT / "schema.sql").read_text(encoding="utf-8")
    conn.executescript(schema)

    fts_available = True
    try:
        conn.execute(
            "CREATE VIRTUAL TABLE chapter_fts USING fts5(chapter_id UNINDEXED, title, content)"
        )
    except sqlite3.OperationalError:
        fts_available = False
    return fts_available


def insert_many(conn: sqlite3.Connection, table: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    columns = list(rows[0].keys())
    placeholders = ", ".join("?" for _ in columns)
    column_sql = ", ".join(columns)
    values = [[row[column] for column in columns] for row in rows]
    conn.executemany(
        f"INSERT INTO {table} ({column_sql}) VALUES ({placeholders})", values
    )


def seed(conn: sqlite3.Connection, fts_available: bool) -> None:
    timestamp = now()
    insert_many(
        conn,
        "projects",
        [
            {
                "id": "project-1",
                "name": "State Graph Spike Novel",
                "schema_version": 1,
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        ],
    )
    insert_many(
        conn,
        "calendars",
        [
            {
                "id": "calendar-star",
                "project_id": "project-1",
                "name": "Star Calendar",
                "description": "Fictional calendar used by the spike.",
            }
        ],
    )
    insert_many(
        conn,
        "time_domains",
        [
            {
                "id": "domain-main",
                "project_id": "project-1",
                "calendar_id": "calendar-star",
                "parent_domain_id": None,
                "name": "Main World",
                "rate_to_parent": 1.0,
                "anchor_parent_tick": 0,
                "anchor_domain_tick": 0,
            },
            {
                "id": "domain-secret",
                "project_id": "project-1",
                "calendar_id": "calendar-star",
                "parent_domain_id": "domain-main",
                "name": "Secret Realm",
                "rate_to_parent": 0.1,
                "anchor_parent_tick": 1000,
                "anchor_domain_tick": 0,
            },
        ],
    )
    insert_many(
        conn,
        "entities",
        [
            {
                "id": "char-lin",
                "project_id": "project-1",
                "entity_type": "character",
                "name": "LinChe",
                "description": "Main character.",
                "status": "active",
            },
            {
                "id": "char-qin",
                "project_id": "project-1",
                "entity_type": "character",
                "name": "QinYuan",
                "description": "Secondary character.",
                "status": "active",
            },
            {
                "id": "loc-town",
                "project_id": "project-1",
                "entity_type": "location",
                "name": "QingshiTown",
                "description": "",
                "status": "active",
            },
            {
                "id": "loc-tower",
                "project_id": "project-1",
                "entity_type": "location",
                "name": "BlackTower",
                "description": "",
                "status": "active",
            },
            {
                "id": "item-key",
                "project_id": "project-1",
                "entity_type": "item",
                "name": "StarKey",
                "description": "",
                "status": "active",
            },
        ],
    )
    insert_many(
        conn,
        "chapters",
        [
            {
                "id": "chapter-1",
                "project_id": "project-1",
                "title": "Arrival",
                "order_index": 1,
                "content": "LinChe arrives in QingshiTown.",
                "status": "draft",
                "updated_at": timestamp,
            },
            {
                "id": "chapter-2",
                "project_id": "project-1",
                "title": "The Tower",
                "order_index": 2,
                "content": "The StarKey appears near the BlackTower.",
                "status": "draft",
                "updated_at": timestamp,
            },
            {
                "id": "chapter-3",
                "project_id": "project-1",
                "title": "Flashback",
                "order_index": 3,
                "content": "A flashback reveals an older promise.",
                "status": "draft",
                "updated_at": timestamp,
            },
        ],
    )
    if fts_available:
        conn.executemany(
            "INSERT INTO chapter_fts (chapter_id, title, content) VALUES (?, ?, ?)",
            [
                ("chapter-1", "Arrival", "LinChe arrives in QingshiTown."),
                ("chapter-2", "The Tower", "The StarKey appears near the BlackTower."),
                ("chapter-3", "Flashback", "A flashback reveals an older promise."),
            ],
        )
    insert_many(
        conn,
        "events",
        [
            {
                "id": "event-town",
                "project_id": "project-1",
                "title": "LinChe reaches QingshiTown",
                "description": "",
                "world_tick": 1000,
                "calendar_id": "calendar-star",
                "time_domain_id": "domain-main",
                "narrative_order": 1,
                "source_chapter_id": "chapter-1",
                "confirmation_status": "confirmed",
            },
            {
                "id": "event-tower",
                "project_id": "project-1",
                "title": "LinChe is also recorded at BlackTower",
                "description": "Intentional conflict for spike validation.",
                "world_tick": 1010,
                "calendar_id": "calendar-star",
                "time_domain_id": "domain-main",
                "narrative_order": 2,
                "source_chapter_id": "chapter-2",
                "confirmation_status": "confirmed",
            },
            {
                "id": "event-flashback",
                "project_id": "project-1",
                "title": "Earlier promise revealed later",
                "description": "Narrative order is later, world time is earlier.",
                "world_tick": 500,
                "calendar_id": "calendar-star",
                "time_domain_id": "domain-main",
                "narrative_order": 3,
                "source_chapter_id": "chapter-3",
                "confirmation_status": "confirmed",
            },
            {
                "id": "event-candidate",
                "project_id": "project-1",
                "title": "AI extracted unconfirmed ability",
                "description": "Candidate event should not affect confirmed checks.",
                "world_tick": 1030,
                "calendar_id": "calendar-star",
                "time_domain_id": "domain-secret",
                "narrative_order": 4,
                "source_chapter_id": "chapter-2",
                "confirmation_status": "candidate",
            },
        ],
    )
    insert_many(
        conn,
        "facts",
        [
            {
                "id": "fact-lin-town",
                "project_id": "project-1",
                "fact_type": "located_at",
                "subject_entity_id": "char-lin",
                "object_entity_id": "loc-town",
                "value_text": "",
                "valid_from_tick": 1000,
                "valid_to_tick": 1030,
                "source_event_id": "event-town",
                "status": "confirmed",
            },
            {
                "id": "fact-lin-tower",
                "project_id": "project-1",
                "fact_type": "located_at",
                "subject_entity_id": "char-lin",
                "object_entity_id": "loc-tower",
                "value_text": "",
                "valid_from_tick": 1010,
                "valid_to_tick": 1040,
                "source_event_id": "event-tower",
                "status": "confirmed",
            },
            {
                "id": "fact-lin-key",
                "project_id": "project-1",
                "fact_type": "holds",
                "subject_entity_id": "char-lin",
                "object_entity_id": "item-key",
                "value_text": "",
                "valid_from_tick": 1020,
                "valid_to_tick": 1050,
                "source_event_id": "event-tower",
                "status": "confirmed",
            },
            {
                "id": "fact-qin-key",
                "project_id": "project-1",
                "fact_type": "holds",
                "subject_entity_id": "char-qin",
                "object_entity_id": "item-key",
                "value_text": "",
                "valid_from_tick": 1025,
                "valid_to_tick": 1040,
                "source_event_id": "event-tower",
                "status": "confirmed",
            },
            {
                "id": "fact-candidate-ability",
                "project_id": "project-1",
                "fact_type": "ability_state",
                "subject_entity_id": "char-lin",
                "object_entity_id": None,
                "value_text": "Candidate bloodline awakening",
                "valid_from_tick": 1030,
                "valid_to_tick": None,
                "source_event_id": "event-candidate",
                "status": "candidate",
            },
        ],
    )
    insert_many(
        conn,
        "graph_edges",
        [
            {
                "id": "edge-lin-town",
                "project_id": "project-1",
                "edge_type": "LOCATED_AT",
                "from_entity_id": "char-lin",
                "to_entity_id": "loc-town",
                "valid_from_tick": 1000,
                "valid_to_tick": 1030,
                "source_event_id": "event-town",
                "status": "confirmed",
            },
            {
                "id": "edge-lin-tower",
                "project_id": "project-1",
                "edge_type": "LOCATED_AT",
                "from_entity_id": "char-lin",
                "to_entity_id": "loc-tower",
                "valid_from_tick": 1010,
                "valid_to_tick": 1040,
                "source_event_id": "event-tower",
                "status": "confirmed",
            },
        ],
    )
    insert_many(
        conn,
        "snapshots",
        [
            {
                "id": "snapshot-1",
                "project_id": "project-1",
                "label": "Initial spike snapshot",
                "description": "Logical marker for project-level rollback design.",
                "schema_version": 1,
                "created_at": timestamp,
            }
        ],
    )
    conn.commit()


def intervals_overlap(
    start_a: int, end_a: int | None, start_b: int, end_b: int | None
) -> bool:
    upper_a = end_a if end_a is not None else 2**63 - 1
    upper_b = end_b if end_b is not None else 2**63 - 1
    return start_a < upper_b and start_b < upper_a


def detect_location_conflicts(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
          f.id,
          f.subject_entity_id,
          subject.name AS subject_name,
          f.object_entity_id,
          object.name AS object_name,
          f.valid_from_tick,
          f.valid_to_tick,
          f.source_event_id
        FROM facts f
        JOIN entities subject ON subject.id = f.subject_entity_id
        JOIN entities object ON object.id = f.object_entity_id
        WHERE f.project_id = 'project-1'
          AND f.fact_type = 'located_at'
          AND f.status = 'confirmed'
        ORDER BY f.subject_entity_id, f.valid_from_tick
        """
    ).fetchall()

    conflicts: list[dict[str, Any]] = []
    for left_index, left in enumerate(rows):
        for right in rows[left_index + 1 :]:
            if left["subject_entity_id"] != right["subject_entity_id"]:
                continue
            if left["object_entity_id"] == right["object_entity_id"]:
                continue
            if intervals_overlap(
                left["valid_from_tick"],
                left["valid_to_tick"],
                right["valid_from_tick"],
                right["valid_to_tick"],
            ):
                conflicts.append(
                    {
                        "severity": "error",
                        "rule_id": "state.location.exclusive",
                        "message": (
                            f"{left['subject_name']} has overlapping locations: "
                            f"{left['object_name']} and {right['object_name']}."
                        ),
                        "subject_ref": left["subject_entity_id"],
                        "object_ref": f"{left['object_entity_id']},{right['object_entity_id']}",
                        "source_refs": f"{left['source_event_id']},{right['source_event_id']}",
                    }
                )
    return conflicts


def detect_item_holder_conflicts(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
          f.id,
          f.subject_entity_id,
          holder.name AS holder_name,
          f.object_entity_id,
          item.name AS item_name,
          f.valid_from_tick,
          f.valid_to_tick,
          f.source_event_id
        FROM facts f
        JOIN entities holder ON holder.id = f.subject_entity_id
        JOIN entities item ON item.id = f.object_entity_id
        WHERE f.project_id = 'project-1'
          AND f.fact_type = 'holds'
          AND f.status = 'confirmed'
        ORDER BY f.object_entity_id, f.valid_from_tick
        """
    ).fetchall()

    conflicts: list[dict[str, Any]] = []
    for left_index, left in enumerate(rows):
        for right in rows[left_index + 1 :]:
            if left["object_entity_id"] != right["object_entity_id"]:
                continue
            if left["subject_entity_id"] == right["subject_entity_id"]:
                continue
            if intervals_overlap(
                left["valid_from_tick"],
                left["valid_to_tick"],
                right["valid_from_tick"],
                right["valid_to_tick"],
            ):
                conflicts.append(
                    {
                        "severity": "error",
                        "rule_id": "state.item.single_holder",
                        "message": (
                            f"{left['item_name']} is held by both "
                            f"{left['holder_name']} and {right['holder_name']}."
                        ),
                        "subject_ref": left["object_entity_id"],
                        "object_ref": f"{left['subject_entity_id']},{right['subject_entity_id']}",
                        "source_refs": f"{left['source_event_id']},{right['source_event_id']}",
                    }
                )
    return conflicts


def write_check_results(
    conn: sqlite3.Connection, conflicts: list[dict[str, Any]]
) -> None:
    timestamp = now()
    rows = []
    for index, conflict in enumerate(conflicts, start=1):
        rows.append(
            {
                "id": f"check-{index}",
                "project_id": "project-1",
                "severity": conflict["severity"],
                "rule_id": conflict["rule_id"],
                "message": conflict["message"],
                "subject_ref": conflict["subject_ref"],
                "object_ref": conflict["object_ref"],
                "source_refs": conflict["source_refs"],
                "status": "open",
                "created_at": timestamp,
            }
        )
    insert_many(conn, "check_results", rows)
    conn.commit()


def location_chain(conn: sqlite3.Connection, character_name: str) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in conn.execute(
            """
            SELECT
              subject.name AS character,
              object.name AS location,
              f.valid_from_tick,
              f.valid_to_tick,
              f.source_event_id
            FROM facts f
            JOIN entities subject ON subject.id = f.subject_entity_id
            JOIN entities object ON object.id = f.object_entity_id
            WHERE f.fact_type = 'located_at'
              AND f.status = 'confirmed'
              AND subject.name = ?
            ORDER BY f.valid_from_tick
            """,
            (character_name,),
        ).fetchall()
    ]


def item_holder_chain(conn: sqlite3.Connection, item_name: str) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in conn.execute(
            """
            SELECT
              item.name AS item,
              holder.name AS holder,
              f.valid_from_tick,
              f.valid_to_tick,
              f.source_event_id
            FROM facts f
            JOIN entities holder ON holder.id = f.subject_entity_id
            JOIN entities item ON item.id = f.object_entity_id
            WHERE f.fact_type = 'holds'
              AND f.status = 'confirmed'
              AND item.name = ?
            ORDER BY f.valid_from_tick
            """,
            (item_name,),
        ).fetchall()
    ]


def narrative_order(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in conn.execute(
            """
            SELECT title, world_tick, narrative_order, confirmation_status
            FROM events
            ORDER BY narrative_order
            """
        ).fetchall()
    ]


def run(db_path: Path) -> dict[str, Any]:
    conn = open_db(db_path)
    try:
        fts_available = apply_schema(conn)
        seed(conn, fts_available)
        conflicts = detect_location_conflicts(conn) + detect_item_holder_conflicts(conn)
        write_check_results(conn, conflicts)
        candidate_fact_count = conn.execute(
            "SELECT COUNT(*) FROM facts WHERE status = 'candidate'"
        ).fetchone()[0]
        check_count = conn.execute("SELECT COUNT(*) FROM check_results").fetchone()[0]
        return {
            "database": str(db_path),
            "fts5_available": fts_available,
            "location_chain": location_chain(conn, "LinChe"),
            "item_holder_chain": item_holder_chain(conn, "StarKey"),
            "narrative_order": narrative_order(conn),
            "conflicts": conflicts,
            "check_results_written": check_count,
            "candidate_facts_ignored_by_checks": candidate_fact_count,
        }
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()

    result = run(args.db)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

