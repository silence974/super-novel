use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};

#[derive(Serialize)]
struct ChainRow {
    subject: String,
    object: String,
    valid_from_tick: i64,
    valid_to_tick: Option<i64>,
    source_event_id: String,
}

#[derive(Serialize)]
struct NarrativeEvent {
    title: String,
    world_tick: i64,
    narrative_order: i64,
    confirmation_status: String,
}

#[derive(Serialize)]
struct ConflictResult {
    severity: String,
    rule_id: String,
    message: String,
    subject_ref: String,
    object_ref: String,
    source_refs: String,
}

#[derive(Serialize)]
struct StateGraphSpikeReport {
    database_path: String,
    database_persistent: bool,
    project_seeded: bool,
    sqlite_version: String,
    fts5_available: bool,
    chapter_count: i64,
    location_chain: Vec<ChainRow>,
    item_holder_chain: Vec<ChainRow>,
    narrative_order: Vec<NarrativeEvent>,
    conflicts: Vec<ConflictResult>,
    check_results_written: usize,
    candidate_facts_ignored_by_checks: i64,
}

#[derive(Serialize)]
struct IncrementalCheckReport {
    database_path: String,
    preview_only: bool,
    changed_fact_id: String,
    patch_description: String,
    affected_entity_ids: Vec<String>,
    affected_event_ids: Vec<String>,
    affected_chapter_ids: Vec<String>,
    affected_fact_ids: Vec<String>,
    affected_rule_ids: Vec<String>,
    before_conflicts: Vec<ConflictResult>,
    after_scope_conflicts: Vec<ConflictResult>,
    remaining_global_conflicts: Vec<ConflictResult>,
    resolved_conflict_count: usize,
}

#[derive(Serialize)]
struct SnapshotRestoreReport {
    database_path: String,
    snapshot_path: String,
    snapshot_size_bytes: u64,
    chapter_title_before_damage: String,
    chapter_title_after_damage: String,
    chapter_title_after_restore: String,
    conflicts_before_damage: usize,
    conflicts_after_damage: usize,
    conflicts_after_restore: usize,
    restore_succeeded: bool,
}

#[derive(Clone)]
struct FactScopeRow {
    id: String,
    subject_entity_id: String,
    object_entity_id: Option<String>,
    valid_from_tick: i64,
    valid_to_tick: Option<i64>,
    source_event_id: Option<String>,
}

const SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  content TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  world_tick INTEGER NOT NULL,
  narrative_order INTEGER NOT NULL,
  source_chapter_id TEXT REFERENCES chapters(id),
  confirmation_status TEXT NOT NULL CHECK (confirmation_status IN ('candidate', 'confirmed'))
);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  fact_type TEXT NOT NULL,
  subject_entity_id TEXT NOT NULL REFERENCES entities(id),
  object_entity_id TEXT REFERENCES entities(id),
  value_text TEXT NOT NULL DEFAULT '',
  valid_from_tick INTEGER NOT NULL,
  valid_to_tick INTEGER,
  source_event_id TEXT REFERENCES events(id),
  status TEXT NOT NULL CHECK (status IN ('candidate', 'confirmed', 'deprecated'))
);

CREATE TABLE IF NOT EXISTS check_results (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning', 'notice')),
  rule_id TEXT NOT NULL,
  message TEXT NOT NULL,
  subject_ref TEXT NOT NULL DEFAULT '',
  object_ref TEXT NOT NULL DEFAULT '',
  source_refs TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE INDEX IF NOT EXISTS idx_facts_lookup
ON facts(fact_type, subject_entity_id, object_entity_id, valid_from_tick, valid_to_tick, status);

CREATE INDEX IF NOT EXISTS idx_check_results_status
ON check_results(severity, status);
"#;

#[tauri::command]
fn run_state_graph_spike() -> Result<StateGraphSpikeReport, String> {
    let conn = Connection::open_in_memory().map_err(|error| error.to_string())?;
    run_state_graph_report(&conn, ":memory:".into(), false)
}

#[tauri::command]
fn run_project_database_spike() -> Result<StateGraphSpikeReport, String> {
    let db_path = default_project_db_path()?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let conn = Connection::open(&db_path).map_err(|error| error.to_string())?;
    run_state_graph_report(&conn, db_path.display().to_string(), true)
}

#[tauri::command]
fn run_incremental_check_spike() -> Result<IncrementalCheckReport, String> {
    let db_path = default_project_db_path()?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let conn = Connection::open(&db_path).map_err(|error| error.to_string())?;
    run_incremental_check_at(&conn, db_path.display().to_string())
}

#[tauri::command]
fn run_snapshot_restore_spike() -> Result<SnapshotRestoreReport, String> {
    let db_path = default_project_db_path()?;
    run_snapshot_restore_at(&db_path)
}

fn run_state_graph_report(
    conn: &Connection,
    database_path: String,
    database_persistent: bool,
) -> Result<StateGraphSpikeReport, String> {
    conn.execute_batch(SCHEMA)
        .map_err(|error| error.to_string())?;
    let fts5_available = create_fts_table(&conn)?;
    let project_seeded = ensure_seeded(conn)?;

    conn.execute("DELETE FROM check_results", [])
        .map_err(|error| error.to_string())?;
    let mut conflicts = detect_location_conflicts(&conn)?;
    conflicts.extend(detect_item_holder_conflicts(&conn)?);
    write_check_results(&conn, &conflicts)?;

    let sqlite_version = conn
        .query_row("SELECT sqlite_version()", [], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    let check_results_written = conn
        .query_row("SELECT COUNT(*) FROM check_results", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| error.to_string())? as usize;
    let candidate_facts_ignored_by_checks = conn
        .query_row(
            "SELECT COUNT(*) FROM facts WHERE status = 'candidate'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?;
    let chapter_count = conn
        .query_row("SELECT COUNT(*) FROM chapters", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| error.to_string())?;

    Ok(StateGraphSpikeReport {
        database_path,
        database_persistent,
        project_seeded,
        sqlite_version,
        fts5_available,
        chapter_count,
        location_chain: location_chain(&conn, "LinChe")?,
        item_holder_chain: item_holder_chain(&conn, "StarKey")?,
        narrative_order: narrative_order(&conn)?,
        conflicts,
        check_results_written,
        candidate_facts_ignored_by_checks,
    })
}

fn run_snapshot_restore_at(db_path: &Path) -> Result<SnapshotRestoreReport, String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    {
        let conn = Connection::open(db_path).map_err(|error| error.to_string())?;
        conn.execute_batch(SCHEMA)
            .map_err(|error| error.to_string())?;
        let _ = create_fts_table(&conn)?;
        let _ = ensure_seeded(&conn)?;
        reset_demo_conflict_state(&conn)?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
            .map_err(|error| error.to_string())?;
    }

    let snapshot_path = snapshot_path_for(db_path, "demo-snapshot")?;
    if let Some(parent) = snapshot_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(db_path, &snapshot_path).map_err(|error| error.to_string())?;
    let snapshot_size_bytes = fs::metadata(&snapshot_path)
        .map_err(|error| error.to_string())?
        .len();

    let chapter_title_before_damage = {
        let conn = Connection::open(db_path).map_err(|error| error.to_string())?;
        chapter_title(&conn, "chapter-1")?
    };
    let conflicts_before_damage = conflict_count_for_file(db_path)?;

    {
        let conn = Connection::open(db_path).map_err(|error| error.to_string())?;
        conn.execute(
            "UPDATE chapters SET title = 'DAMAGED CHAPTER' WHERE id = 'chapter-1'",
            [],
        )
        .map_err(|error| error.to_string())?;
        conn.execute("DELETE FROM facts WHERE id = 'fact-qin-key'", [])
            .map_err(|error| error.to_string())?;
    }

    let chapter_title_after_damage = {
        let conn = Connection::open(db_path).map_err(|error| error.to_string())?;
        chapter_title(&conn, "chapter-1")?
    };
    let conflicts_after_damage = conflict_count_for_file(db_path)?;

    fs::copy(&snapshot_path, db_path).map_err(|error| error.to_string())?;

    let chapter_title_after_restore = {
        let conn = Connection::open(db_path).map_err(|error| error.to_string())?;
        chapter_title(&conn, "chapter-1")?
    };
    let conflicts_after_restore = conflict_count_for_file(db_path)?;
    let restore_succeeded = chapter_title_after_restore == chapter_title_before_damage
        && conflicts_after_restore == conflicts_before_damage;

    Ok(SnapshotRestoreReport {
        database_path: db_path.display().to_string(),
        snapshot_path: snapshot_path.display().to_string(),
        snapshot_size_bytes,
        chapter_title_before_damage,
        chapter_title_after_damage,
        chapter_title_after_restore,
        conflicts_before_damage,
        conflicts_after_damage,
        conflicts_after_restore,
        restore_succeeded,
    })
}

fn snapshot_path_for(db_path: &Path, label: &str) -> Result<PathBuf, String> {
    let project_dir = db_path
        .parent()
        .ok_or_else(|| "database path has no parent directory".to_string())?;
    Ok(project_dir
        .join("snapshots")
        .join(format!("{label}.project.db")))
}

fn chapter_title(conn: &Connection, chapter_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT title FROM chapters WHERE id = ?1",
        [chapter_id],
        |row| row.get::<_, String>(0),
    )
    .map_err(|error| error.to_string())
}

fn conflict_count_for_file(db_path: &Path) -> Result<usize, String> {
    let conn = Connection::open(db_path).map_err(|error| error.to_string())?;
    let mut conflicts = detect_location_conflicts(&conn)?;
    conflicts.extend(detect_item_holder_conflicts(&conn)?);
    Ok(conflicts.len())
}

fn run_incremental_check_at(
    conn: &Connection,
    database_path: String,
) -> Result<IncrementalCheckReport, String> {
    conn.execute_batch(SCHEMA)
        .map_err(|error| error.to_string())?;
    let _ = create_fts_table(conn)?;
    let _ = ensure_seeded(conn)?;

    conn.execute_batch("SAVEPOINT incremental_preview")
        .map_err(|error| error.to_string())?;

    let result = (|| {
        reset_demo_conflict_state(conn)?;

        let changed_fact_id = "fact-lin-town";
        let scope = location_impact_scope(conn, changed_fact_id)?;
        let before_conflicts = filter_conflicts_for_scope(detect_location_conflicts(conn)?, &scope);

        // Preview patch: LinChe leaves QingshiTown exactly when the BlackTower event starts.
        conn.execute(
            "UPDATE facts SET valid_to_tick = 1010 WHERE id = ?1",
            [changed_fact_id],
        )
        .map_err(|error| error.to_string())?;

        let after_scope_conflicts =
            filter_conflicts_for_scope(detect_location_conflicts(conn)?, &scope);
        let mut remaining_global_conflicts = detect_location_conflicts(conn)?;
        remaining_global_conflicts.extend(detect_item_holder_conflicts(conn)?);
        let resolved_conflict_count = before_conflicts
            .len()
            .saturating_sub(after_scope_conflicts.len());

        Ok(IncrementalCheckReport {
            database_path,
            preview_only: true,
            changed_fact_id: changed_fact_id.into(),
            patch_description: "Preview patch: set fact-lin-town.valid_to_tick from 1030 to 1010."
                .into(),
            affected_entity_ids: scope.affected_entity_ids.into_iter().collect(),
            affected_event_ids: scope.affected_event_ids.into_iter().collect(),
            affected_chapter_ids: scope.affected_chapter_ids.into_iter().collect(),
            affected_fact_ids: scope.affected_fact_ids.into_iter().collect(),
            affected_rule_ids: scope.affected_rule_ids.into_iter().collect(),
            before_conflicts,
            after_scope_conflicts,
            remaining_global_conflicts,
            resolved_conflict_count,
        })
    })();

    conn.execute_batch("ROLLBACK TO incremental_preview; RELEASE incremental_preview")
        .map_err(|error| error.to_string())?;
    result
}

struct ImpactScope {
    affected_entity_ids: BTreeSet<String>,
    affected_event_ids: BTreeSet<String>,
    affected_chapter_ids: BTreeSet<String>,
    affected_fact_ids: BTreeSet<String>,
    affected_rule_ids: BTreeSet<String>,
}

fn reset_demo_conflict_state(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
UPDATE facts SET valid_from_tick = 1000, valid_to_tick = 1030, status = 'confirmed'
WHERE id = 'fact-lin-town';

UPDATE facts SET valid_from_tick = 1010, valid_to_tick = 1040, status = 'confirmed'
WHERE id = 'fact-lin-tower';

UPDATE facts SET valid_from_tick = 1020, valid_to_tick = 1050, status = 'confirmed'
WHERE id = 'fact-lin-key';

UPDATE facts SET valid_from_tick = 1025, valid_to_tick = 1040, status = 'confirmed'
WHERE id = 'fact-qin-key';
"#,
    )
    .map_err(|error| error.to_string())
}

fn location_impact_scope(conn: &Connection, changed_fact_id: &str) -> Result<ImpactScope, String> {
    let changed = fact_scope_row(conn, changed_fact_id)?;
    let candidates = facts_for_subject(conn, "located_at", &changed.subject_entity_id)?;

    let mut affected_entity_ids = BTreeSet::new();
    let mut affected_event_ids = BTreeSet::new();
    let mut affected_chapter_ids = BTreeSet::new();
    let mut affected_fact_ids = BTreeSet::new();
    let mut affected_rule_ids = BTreeSet::from(["state.location.exclusive".into()]);

    affected_entity_ids.insert(changed.subject_entity_id.clone());

    for fact in candidates {
        let should_include = fact.id == changed.id
            || intervals_overlap(
                changed.valid_from_tick,
                changed.valid_to_tick,
                fact.valid_from_tick,
                fact.valid_to_tick,
            );
        if !should_include {
            continue;
        }

        affected_fact_ids.insert(fact.id);
        affected_entity_ids.insert(fact.subject_entity_id);
        if let Some(object_id) = fact.object_entity_id {
            affected_entity_ids.insert(object_id);
        }
        if let Some(event_id) = fact.source_event_id {
            affected_event_ids.insert(event_id.clone());
            if let Some(chapter_id) = chapter_for_event(conn, &event_id)? {
                affected_chapter_ids.insert(chapter_id);
            }
        }
    }

    Ok(ImpactScope {
        affected_entity_ids,
        affected_event_ids,
        affected_chapter_ids,
        affected_fact_ids,
        affected_rule_ids: std::mem::take(&mut affected_rule_ids),
    })
}

fn fact_scope_row(conn: &Connection, fact_id: &str) -> Result<FactScopeRow, String> {
    conn.query_row(
        r#"
SELECT id, subject_entity_id, object_entity_id, valid_from_tick, valid_to_tick, source_event_id
FROM facts
WHERE id = ?1
"#,
        [fact_id],
        |row| {
            Ok(FactScopeRow {
                id: row.get(0)?,
                subject_entity_id: row.get(1)?,
                object_entity_id: row.get(2)?,
                valid_from_tick: row.get(3)?,
                valid_to_tick: row.get(4)?,
                source_event_id: row.get(5)?,
            })
        },
    )
    .map_err(|error| error.to_string())
}

fn facts_for_subject(
    conn: &Connection,
    fact_type: &str,
    subject_entity_id: &str,
) -> Result<Vec<FactScopeRow>, String> {
    let mut statement = conn
        .prepare(
            r#"
SELECT id, subject_entity_id, object_entity_id, valid_from_tick, valid_to_tick, source_event_id
FROM facts
WHERE fact_type = ?1
  AND subject_entity_id = ?2
  AND status = 'confirmed'
ORDER BY valid_from_tick
"#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map((fact_type, subject_entity_id), |row| {
            Ok(FactScopeRow {
                id: row.get(0)?,
                subject_entity_id: row.get(1)?,
                object_entity_id: row.get(2)?,
                valid_from_tick: row.get(3)?,
                valid_to_tick: row.get(4)?,
                source_event_id: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn chapter_for_event(conn: &Connection, event_id: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT source_chapter_id FROM events WHERE id = ?1",
        [event_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .map(|row| row.flatten())
    .map_err(|error| error.to_string())
}

fn filter_conflicts_for_scope(
    conflicts: Vec<ConflictResult>,
    scope: &ImpactScope,
) -> Vec<ConflictResult> {
    conflicts
        .into_iter()
        .filter(|conflict| {
            scope.affected_rule_ids.contains(&conflict.rule_id)
                && conflict
                    .source_refs
                    .split(',')
                    .any(|source_ref| scope.affected_event_ids.contains(source_ref))
        })
        .collect()
}

fn default_project_db_path() -> Result<PathBuf, String> {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    Ok(base
        .join("super-novel-tauri-spike")
        .join("projects")
        .join("demo-work")
        .join("project.db"))
}

fn create_fts_table(conn: &Connection) -> Result<bool, String> {
    match conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS chapter_fts USING fts5(chapter_id UNINDEXED, title, content)",
        [],
    ) {
        Ok(_) => Ok(true),
        Err(error) => {
            let message = error.to_string();
            if message.to_lowercase().contains("fts5") {
                Ok(false)
            } else {
                Err(message)
            }
        }
    }
}

fn ensure_seeded(conn: &Connection) -> Result<bool, String> {
    let entity_count = conn
        .query_row("SELECT COUNT(*) FROM entities", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| error.to_string())?;

    let seeded = entity_count == 0;
    seed_state_graph(conn)?;
    Ok(seeded)
}

fn seed_state_graph(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
INSERT OR IGNORE INTO entities (id, entity_type, name) VALUES
  ('char-lin', 'character', 'LinChe'),
  ('char-qin', 'character', 'QinYuan'),
  ('loc-town', 'location', 'QingshiTown'),
  ('loc-tower', 'location', 'BlackTower'),
  ('item-key', 'item', 'StarKey');

INSERT OR IGNORE INTO chapters (id, title, order_index, content) VALUES
  ('chapter-1', 'Arrival', 1, 'LinChe arrives in QingshiTown.'),
  ('chapter-2', 'The Tower', 2, 'The StarKey appears near the BlackTower.'),
  ('chapter-3', 'Flashback', 3, 'A flashback reveals an older promise.');

INSERT OR IGNORE INTO events (
  id, title, world_tick, narrative_order, source_chapter_id, confirmation_status
) VALUES
  ('event-town', 'LinChe reaches QingshiTown', 1000, 1, 'chapter-1', 'confirmed'),
  ('event-tower', 'LinChe is also recorded at BlackTower', 1010, 2, 'chapter-2', 'confirmed'),
  ('event-flashback', 'Earlier promise revealed later', 500, 3, 'chapter-3', 'confirmed'),
  ('event-candidate', 'AI extracted unconfirmed ability', 1030, 4, 'chapter-2', 'candidate');

INSERT OR IGNORE INTO facts (
  id, fact_type, subject_entity_id, object_entity_id, value_text,
  valid_from_tick, valid_to_tick, source_event_id, status
) VALUES
  ('fact-lin-town', 'located_at', 'char-lin', 'loc-town', '', 1000, 1030, 'event-town', 'confirmed'),
  ('fact-lin-tower', 'located_at', 'char-lin', 'loc-tower', '', 1010, 1040, 'event-tower', 'confirmed'),
  ('fact-lin-key', 'holds', 'char-lin', 'item-key', '', 1020, 1050, 'event-tower', 'confirmed'),
  ('fact-qin-key', 'holds', 'char-qin', 'item-key', '', 1025, 1040, 'event-tower', 'confirmed'),
  ('fact-candidate-ability', 'ability_state', 'char-lin', NULL, 'Candidate bloodline awakening', 1030, NULL, 'event-candidate', 'candidate');
"#,
    )
    .map_err(|error| error.to_string())?;

    if table_exists(conn, "chapter_fts")? && fts_row_count(conn)? == 0 {
        conn.execute_batch(
            r#"
INSERT INTO chapter_fts (chapter_id, title, content) VALUES
  ('chapter-1', 'Arrival', 'LinChe arrives in QingshiTown.'),
  ('chapter-2', 'The Tower', 'The StarKey appears near the BlackTower.'),
  ('chapter-3', 'Flashback', 'A flashback reveals an older promise.');
"#,
        )
        .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn fts_row_count(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT COUNT(*) FROM chapter_fts", [], |row| {
        row.get::<_, i64>(0)
    })
    .map_err(|error| error.to_string())
}

fn table_exists(conn: &Connection, table_name: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [table_name],
        |_| Ok(()),
    )
    .optional()
    .map(|row| row.is_some())
    .map_err(|error| error.to_string())
}

fn detect_location_conflicts(conn: &Connection) -> Result<Vec<ConflictResult>, String> {
    let mut statement = conn
        .prepare(
            r#"
SELECT
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
WHERE f.fact_type = 'located_at'
  AND f.status = 'confirmed'
ORDER BY f.subject_entity_id, f.valid_from_tick
"#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(FactInterval {
                subject_entity_id: row.get(0)?,
                subject_name: row.get(1)?,
                object_entity_id: row.get(2)?,
                object_name: row.get(3)?,
                valid_from_tick: row.get(4)?,
                valid_to_tick: row.get(5)?,
                source_event_id: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut conflicts = Vec::new();
    for left_index in 0..rows.len() {
        for right in rows.iter().skip(left_index + 1) {
            let left = &rows[left_index];
            if left.subject_entity_id != right.subject_entity_id {
                continue;
            }
            if left.object_entity_id == right.object_entity_id {
                continue;
            }
            if intervals_overlap(
                left.valid_from_tick,
                left.valid_to_tick,
                right.valid_from_tick,
                right.valid_to_tick,
            ) {
                conflicts.push(ConflictResult {
                    severity: "error".into(),
                    rule_id: "state.location.exclusive".into(),
                    message: format!(
                        "{} has overlapping locations: {} and {}.",
                        left.subject_name, left.object_name, right.object_name
                    ),
                    subject_ref: left.subject_entity_id.clone(),
                    object_ref: format!("{},{}", left.object_entity_id, right.object_entity_id),
                    source_refs: format!("{},{}", left.source_event_id, right.source_event_id),
                });
            }
        }
    }
    Ok(conflicts)
}

fn detect_item_holder_conflicts(conn: &Connection) -> Result<Vec<ConflictResult>, String> {
    let mut statement = conn
        .prepare(
            r#"
SELECT
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
WHERE f.fact_type = 'holds'
  AND f.status = 'confirmed'
ORDER BY f.object_entity_id, f.valid_from_tick
"#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(FactInterval {
                subject_entity_id: row.get(0)?,
                subject_name: row.get(1)?,
                object_entity_id: row.get(2)?,
                object_name: row.get(3)?,
                valid_from_tick: row.get(4)?,
                valid_to_tick: row.get(5)?,
                source_event_id: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut conflicts = Vec::new();
    for left_index in 0..rows.len() {
        for right in rows.iter().skip(left_index + 1) {
            let left = &rows[left_index];
            if left.object_entity_id != right.object_entity_id {
                continue;
            }
            if left.subject_entity_id == right.subject_entity_id {
                continue;
            }
            if intervals_overlap(
                left.valid_from_tick,
                left.valid_to_tick,
                right.valid_from_tick,
                right.valid_to_tick,
            ) {
                conflicts.push(ConflictResult {
                    severity: "error".into(),
                    rule_id: "state.item.single_holder".into(),
                    message: format!(
                        "{} is held by both {} and {}.",
                        left.object_name, left.subject_name, right.subject_name
                    ),
                    subject_ref: left.object_entity_id.clone(),
                    object_ref: format!("{},{}", left.subject_entity_id, right.subject_entity_id),
                    source_refs: format!("{},{}", left.source_event_id, right.source_event_id),
                });
            }
        }
    }
    Ok(conflicts)
}

#[derive(Clone)]
struct FactInterval {
    subject_entity_id: String,
    subject_name: String,
    object_entity_id: String,
    object_name: String,
    valid_from_tick: i64,
    valid_to_tick: Option<i64>,
    source_event_id: String,
}

fn intervals_overlap(start_a: i64, end_a: Option<i64>, start_b: i64, end_b: Option<i64>) -> bool {
    let upper_a = end_a.unwrap_or(i64::MAX);
    let upper_b = end_b.unwrap_or(i64::MAX);
    start_a < upper_b && start_b < upper_a
}

fn write_check_results(conn: &Connection, conflicts: &[ConflictResult]) -> Result<(), String> {
    for (index, conflict) in conflicts.iter().enumerate() {
        conn.execute(
            r#"
INSERT INTO check_results (
  id, severity, rule_id, message, subject_ref, object_ref, source_refs, status
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open')
"#,
            (
                format!("check-{}", index + 1),
                &conflict.severity,
                &conflict.rule_id,
                &conflict.message,
                &conflict.subject_ref,
                &conflict.object_ref,
                &conflict.source_refs,
            ),
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn location_chain(conn: &Connection, character_name: &str) -> Result<Vec<ChainRow>, String> {
    chain_query(
        conn,
        r#"
SELECT
  subject.name AS subject,
  object.name AS object,
  f.valid_from_tick,
  f.valid_to_tick,
  f.source_event_id
FROM facts f
JOIN entities subject ON subject.id = f.subject_entity_id
JOIN entities object ON object.id = f.object_entity_id
WHERE f.fact_type = 'located_at'
  AND f.status = 'confirmed'
  AND subject.name = ?1
ORDER BY f.valid_from_tick
"#,
        character_name,
    )
}

fn item_holder_chain(conn: &Connection, item_name: &str) -> Result<Vec<ChainRow>, String> {
    chain_query(
        conn,
        r#"
SELECT
  item.name AS subject,
  holder.name AS object,
  f.valid_from_tick,
  f.valid_to_tick,
  f.source_event_id
FROM facts f
JOIN entities holder ON holder.id = f.subject_entity_id
JOIN entities item ON item.id = f.object_entity_id
WHERE f.fact_type = 'holds'
  AND f.status = 'confirmed'
  AND item.name = ?1
ORDER BY f.valid_from_tick
"#,
        item_name,
    )
}

fn chain_query(conn: &Connection, sql: &str, parameter: &str) -> Result<Vec<ChainRow>, String> {
    let mut statement = conn.prepare(sql).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([parameter], |row| {
            Ok(ChainRow {
                subject: row.get(0)?,
                object: row.get(1)?,
                valid_from_tick: row.get(2)?,
                valid_to_tick: row.get(3)?,
                source_event_id: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn narrative_order(conn: &Connection) -> Result<Vec<NarrativeEvent>, String> {
    let mut statement = conn
        .prepare(
            r#"
SELECT title, world_tick, narrative_order, confirmation_status
FROM events
ORDER BY narrative_order
"#,
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(NarrativeEvent {
                title: row.get(0)?,
                world_tick: row.get(1)?,
                narrative_order: row.get(2)?,
                confirmation_status: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_graph_spike_returns_expected_report() {
        let report = run_state_graph_spike().expect("state graph spike should run");

        assert!(report.fts5_available);
        assert!(!report.database_persistent);
        assert_eq!(report.database_path, ":memory:");
        assert_eq!(report.chapter_count, 3);
        assert_eq!(report.location_chain.len(), 2);
        assert_eq!(report.item_holder_chain.len(), 2);
        assert_eq!(report.conflicts.len(), 2);
        assert_eq!(report.check_results_written, 2);
        assert_eq!(report.candidate_facts_ignored_by_checks, 1);
        assert_eq!(report.narrative_order[2].world_tick, 500);
        assert_eq!(report.narrative_order[2].narrative_order, 3);
    }

    #[test]
    fn persistent_project_database_can_be_reopened() {
        let db_path = std::env::temp_dir().join(format!(
            "super-novel-tauri-spike-test-{}.db",
            std::process::id()
        ));
        let _ = fs::remove_file(&db_path);

        let first = run_project_database_at(&db_path).expect("first open should seed database");
        let second = run_project_database_at(&db_path).expect("second open should reuse database");

        assert!(first.database_persistent);
        assert!(first.project_seeded);
        assert!(!second.project_seeded);
        assert_eq!(second.chapter_count, 3);
        assert_eq!(second.check_results_written, 2);

        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn incremental_check_reports_affected_scope_without_persisting_patch() {
        let db_path = std::env::temp_dir().join(format!(
            "super-novel-tauri-spike-incremental-test-{}.db",
            std::process::id()
        ));
        let _ = fs::remove_file(&db_path);

        let conn = Connection::open(&db_path).expect("test database should open");
        let report =
            run_incremental_check_at(&conn, db_path.display().to_string()).expect("report");

        assert!(report.preview_only);
        assert_eq!(report.changed_fact_id, "fact-lin-town");
        assert_eq!(report.before_conflicts.len(), 1);
        assert_eq!(report.after_scope_conflicts.len(), 0);
        assert_eq!(report.remaining_global_conflicts.len(), 1);
        assert_eq!(report.resolved_conflict_count, 1);
        assert!(report.affected_entity_ids.contains(&"char-lin".to_string()));
        assert!(report
            .affected_fact_ids
            .contains(&"fact-lin-town".to_string()));
        assert!(report
            .affected_fact_ids
            .contains(&"fact-lin-tower".to_string()));

        let persisted_report = run_state_graph_report(&conn, db_path.display().to_string(), true)
            .expect("state report should still see original persisted conflict");
        assert_eq!(persisted_report.conflicts.len(), 2);

        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn snapshot_restore_recovers_project_database_file() {
        let db_path = std::env::temp_dir().join(format!(
            "super-novel-tauri-spike-snapshot-test-{}.db",
            std::process::id()
        ));
        let _ = fs::remove_file(&db_path);
        let _ = fs::remove_dir_all(db_path.parent().unwrap().join("snapshots"));

        let report = run_snapshot_restore_at(&db_path).expect("snapshot restore should run");

        assert!(report.restore_succeeded);
        assert_eq!(report.chapter_title_before_damage, "Arrival");
        assert_eq!(report.chapter_title_after_damage, "DAMAGED CHAPTER");
        assert_eq!(report.chapter_title_after_restore, "Arrival");
        assert_eq!(report.conflicts_before_damage, 2);
        assert_eq!(report.conflicts_after_damage, 1);
        assert_eq!(report.conflicts_after_restore, 2);
        assert!(report.snapshot_size_bytes > 0);

        let _ = fs::remove_file(&db_path);
        let _ = fs::remove_dir_all(db_path.parent().unwrap().join("snapshots"));
    }
}

#[cfg(test)]
fn run_project_database_at(db_path: &Path) -> Result<StateGraphSpikeReport, String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let conn = Connection::open(db_path).map_err(|error| error.to_string())?;
    run_state_graph_report(&conn, db_path.display().to_string(), true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            run_state_graph_spike,
            run_project_database_spike,
            run_incremental_check_spike,
            run_snapshot_restore_spike
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
