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

#[derive(Serialize)]
struct VectorSearchHit {
    entry_id: String,
    source_type: String,
    source_id: String,
    chunk_text: String,
    similarity: f32,
}

#[derive(Serialize)]
struct VectorSearchReport {
    database_path: String,
    embedding_model: String,
    query: String,
    entries_written: usize,
    before_update_hits: Vec<VectorSearchHit>,
    updated_source_id: String,
    updated_chunk_text: String,
    after_update_hits: Vec<VectorSearchHit>,
    initial_index_rebuilt: bool,
}

#[derive(Serialize)]
struct OpenAiProviderAdapterReport {
    provider_name: String,
    text_generation_api: String,
    embedding_api: String,
    api_key_env_var: String,
    api_key_present: bool,
    request_kind: String,
    model: String,
    context_scope: Vec<String>,
    redacted_request_summary: String,
    candidate_status: String,
    response_would_be_candidate: bool,
    writes_to_fact_store: bool,
    logs_include_api_key: bool,
}

#[derive(Serialize)]
struct RelationshipPathReport {
    database_path: String,
    start_entity_id: String,
    target_entity_id: String,
    world_tick: i64,
    max_depth: i64,
    path_found: bool,
    hop_count: usize,
    entity_path: Vec<String>,
    edge_path: Vec<String>,
    source_event_ids: Vec<String>,
    path_summary: String,
}

#[derive(Serialize)]
struct TimeScaleRuleRow {
    rule_id: String,
    source_domain_id: String,
    target_domain_id: String,
    source_anchor_tick: i64,
    target_anchor_tick: i64,
    source_tick_span: i64,
    target_tick_span: i64,
    summary: String,
}

#[derive(Serialize)]
struct TimeDomainEventRow {
    event_id: String,
    title: String,
    time_domain_id: String,
    time_domain_name: String,
    local_tick: i64,
    canonical_world_tick: i64,
    narrative_order: i64,
    affects_current_timeline: bool,
}

#[derive(Serialize)]
struct TimeDomainReport {
    database_path: String,
    primary_domain_id: String,
    scale_rules: Vec<TimeScaleRuleRow>,
    mapped_events: Vec<TimeDomainEventRow>,
    query_domain_id: String,
    query_domain_tick: i64,
    query_world_tick: i64,
    affected_event_ids: Vec<String>,
    affected_world_tick_start: i64,
    affected_world_tick_end: i64,
    narrative_order_separate: bool,
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

CREATE TABLE IF NOT EXISTS graph_edges (
  id TEXT PRIMARY KEY,
  edge_type TEXT NOT NULL,
  from_entity_id TEXT NOT NULL REFERENCES entities(id),
  to_entity_id TEXT NOT NULL REFERENCES entities(id),
  valid_from_tick INTEGER NOT NULL,
  valid_to_tick INTEGER,
  source_event_id TEXT REFERENCES events(id),
  status TEXT NOT NULL CHECK (status IN ('candidate', 'confirmed', 'deprecated'))
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_lookup
ON graph_edges(from_entity_id, to_entity_id, edge_type, valid_from_tick, valid_to_tick, status);

CREATE TABLE IF NOT EXISTS vector_entries (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding BLOB NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vector_entries_source
ON vector_entries(source_type, source_id, embedding_model);

CREATE TABLE IF NOT EXISTS time_domains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_primary INTEGER NOT NULL CHECK (is_primary IN (0, 1)),
  allows_nested INTEGER NOT NULL CHECK (allows_nested IN (0, 1)),
  allows_irreversible_jump INTEGER NOT NULL CHECK (allows_irreversible_jump IN (0, 1))
);

CREATE TABLE IF NOT EXISTS time_scale_rules (
  id TEXT PRIMARY KEY,
  source_domain_id TEXT NOT NULL REFERENCES time_domains(id),
  target_domain_id TEXT NOT NULL REFERENCES time_domains(id),
  source_anchor_tick INTEGER NOT NULL,
  target_anchor_tick INTEGER NOT NULL,
  source_tick_span INTEGER NOT NULL CHECK (source_tick_span > 0),
  target_tick_span INTEGER NOT NULL CHECK (target_tick_span > 0),
  status TEXT NOT NULL CHECK (status IN ('candidate', 'confirmed', 'deprecated'))
);

CREATE INDEX IF NOT EXISTS idx_time_scale_rules_lookup
ON time_scale_rules(source_domain_id, target_domain_id, status);

CREATE TABLE IF NOT EXISTS time_domain_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  time_domain_id TEXT NOT NULL REFERENCES time_domains(id),
  local_tick INTEGER NOT NULL,
  narrative_order INTEGER NOT NULL,
  source_event_id TEXT REFERENCES events(id),
  affects_current_timeline INTEGER NOT NULL CHECK (affects_current_timeline IN (0, 1)),
  confirmation_status TEXT NOT NULL CHECK (confirmation_status IN ('candidate', 'confirmed'))
);

CREATE INDEX IF NOT EXISTS idx_time_domain_events_lookup
ON time_domain_events(time_domain_id, local_tick, confirmation_status);
"#;

const LOCAL_VECTOR_MODEL: &str = "local-keyword-hash-v1";
const VECTOR_DIMENSIONS: usize = 32;

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

#[tauri::command]
fn run_vector_search_spike() -> Result<VectorSearchReport, String> {
    let db_path = default_project_db_path()?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let conn = Connection::open(&db_path).map_err(|error| error.to_string())?;
    run_vector_search_at(&conn, db_path.display().to_string())
}

#[tauri::command]
fn run_openai_provider_adapter_spike() -> Result<OpenAiProviderAdapterReport, String> {
    run_openai_provider_adapter_report()
}

#[tauri::command]
fn run_relationship_path_spike() -> Result<RelationshipPathReport, String> {
    let db_path = default_project_db_path()?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let conn = Connection::open(&db_path).map_err(|error| error.to_string())?;
    run_relationship_path_at(&conn, db_path.display().to_string())
}

#[tauri::command]
fn run_time_domain_spike() -> Result<TimeDomainReport, String> {
    let db_path = default_project_db_path()?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let conn = Connection::open(&db_path).map_err(|error| error.to_string())?;
    run_time_domain_at(&conn, db_path.display().to_string())
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

fn run_openai_provider_adapter_report() -> Result<OpenAiProviderAdapterReport, String> {
    let request = ProviderRequestDraft {
        request_kind: "generate_repair_patch".into(),
        model: "configured-openai-text-model".into(),
        context_scope: vec![
            "chapter:chapter-2".into(),
            "event:event-tower".into(),
            "check_result:state.location.exclusive".into(),
        ],
        user_visible_task: "Generate a candidate repair patch for one selected location conflict."
            .into(),
    };
    let api_key_present = std::env::var_os("OPENAI_API_KEY").is_some();

    Ok(OpenAiProviderAdapterReport {
        provider_name: "openai".into(),
        text_generation_api: "Responses API".into(),
        embedding_api: "Embeddings API".into(),
        api_key_env_var: "OPENAI_API_KEY".into(),
        api_key_present,
        request_kind: request.request_kind,
        model: request.model,
        context_scope: request.context_scope,
        redacted_request_summary: format!(
            "{} Context items: 3. API key omitted from report and logs.",
            request.user_visible_task
        ),
        candidate_status: "candidate".into(),
        response_would_be_candidate: true,
        writes_to_fact_store: false,
        logs_include_api_key: false,
    })
}

fn run_relationship_path_at(
    conn: &Connection,
    database_path: String,
) -> Result<RelationshipPathReport, String> {
    conn.execute_batch(SCHEMA)
        .map_err(|error| error.to_string())?;
    let _ = create_fts_table(conn)?;
    let _ = ensure_seeded(conn)?;

    let start_entity_id = "char-lin";
    let target_entity_id = "item-key";
    let world_tick = 1030;
    let max_depth = 4;
    let result = relationship_path(
        conn,
        start_entity_id,
        target_entity_id,
        world_tick,
        max_depth,
    )?;

    Ok(RelationshipPathReport {
        database_path,
        start_entity_id: start_entity_id.into(),
        target_entity_id: target_entity_id.into(),
        world_tick,
        max_depth,
        path_found: result.is_some(),
        hop_count: result
            .as_ref()
            .map(|path| path.edge_path.len())
            .unwrap_or(0),
        entity_path: result
            .as_ref()
            .map(|path| path.entity_path.clone())
            .unwrap_or_default(),
        edge_path: result
            .as_ref()
            .map(|path| path.edge_path.clone())
            .unwrap_or_default(),
        source_event_ids: result
            .as_ref()
            .map(|path| path.source_event_ids.clone())
            .unwrap_or_default(),
        path_summary: result
            .map(|path| path.summary())
            .unwrap_or_else(|| "No relationship path found.".into()),
    })
}

#[derive(Clone)]
struct RelationshipPath {
    entity_path: Vec<String>,
    edge_path: Vec<String>,
    source_event_ids: Vec<String>,
}

impl RelationshipPath {
    fn summary(&self) -> String {
        if self.entity_path.is_empty() {
            return "No relationship path found.".into();
        }

        let mut summary = self.entity_path[0].clone();
        for (index, edge_type) in self.edge_path.iter().enumerate() {
            if let Some(next_entity) = self.entity_path.get(index + 1) {
                summary.push_str(&format!(" -[{edge_type}]-> {next_entity}"));
            }
        }
        summary
    }
}

fn relationship_path(
    conn: &Connection,
    start_entity_id: &str,
    target_entity_id: &str,
    world_tick: i64,
    max_depth: i64,
) -> Result<Option<RelationshipPath>, String> {
    conn.query_row(
        r#"
WITH RECURSIVE relationship_path(
  depth,
  current_entity_id,
  entity_ids,
  entity_names,
  edge_types,
  source_event_ids
) AS (
  SELECT
    0,
    e.id,
    '|' || e.id || '|',
    e.name,
    '',
    ''
  FROM entities e
  WHERE e.id = ?1

  UNION ALL

  SELECT
    relationship_path.depth + 1,
    edge.to_entity_id,
    relationship_path.entity_ids || edge.to_entity_id || '|',
    relationship_path.entity_names || '|' || target.name,
    CASE
      WHEN relationship_path.edge_types = '' THEN edge.edge_type
      ELSE relationship_path.edge_types || '|' || edge.edge_type
    END,
    CASE
      WHEN relationship_path.source_event_ids = '' THEN COALESCE(edge.source_event_id, '')
      ELSE relationship_path.source_event_ids || '|' || COALESCE(edge.source_event_id, '')
    END
  FROM relationship_path
  JOIN graph_edges edge ON edge.from_entity_id = relationship_path.current_entity_id
  JOIN entities target ON target.id = edge.to_entity_id
  WHERE relationship_path.depth < ?4
    AND edge.status = 'confirmed'
    AND edge.valid_from_tick <= ?3
    AND (edge.valid_to_tick IS NULL OR ?3 < edge.valid_to_tick)
    AND instr(relationship_path.entity_ids, '|' || edge.to_entity_id || '|') = 0
)
SELECT entity_names, edge_types, source_event_ids
FROM relationship_path
WHERE current_entity_id = ?2
  AND depth > 0
ORDER BY depth
LIMIT 1
"#,
        (start_entity_id, target_entity_id, world_tick, max_depth),
        |row| {
            let entity_names: String = row.get(0)?;
            let edge_types: String = row.get(1)?;
            let source_event_ids: String = row.get(2)?;
            Ok(RelationshipPath {
                entity_path: split_path(&entity_names),
                edge_path: split_path(&edge_types),
                source_event_ids: split_path(&source_event_ids),
            })
        },
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn split_path(value: &str) -> Vec<String> {
    value
        .split('|')
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

fn run_time_domain_at(
    conn: &Connection,
    database_path: String,
) -> Result<TimeDomainReport, String> {
    conn.execute_batch(SCHEMA)
        .map_err(|error| error.to_string())?;
    let _ = create_fts_table(conn)?;
    let _ = ensure_seeded(conn)?;

    let primary_domain_id = primary_time_domain_id(conn)?;
    let scale_rules = time_scale_rules(conn)?;
    let mapped_events = mapped_time_domain_events(conn, &primary_domain_id)?;
    let query_domain_id = "mirror-realm".to_string();
    let query_domain_tick = 45;
    let query_world_tick = map_tick_to_primary(
        conn,
        &query_domain_id,
        query_domain_tick,
        &primary_domain_id,
    )?;
    let affected_events: Vec<&TimeDomainEventRow> = mapped_events
        .iter()
        .filter(|event| event.time_domain_id == query_domain_id)
        .collect();
    let affected_event_ids = affected_events
        .iter()
        .map(|event| event.event_id.clone())
        .collect::<Vec<_>>();
    let affected_world_tick_start = affected_events
        .iter()
        .map(|event| event.canonical_world_tick)
        .min()
        .unwrap_or(query_world_tick);
    let affected_world_tick_end = affected_events
        .iter()
        .map(|event| event.canonical_world_tick)
        .max()
        .unwrap_or(query_world_tick);
    let narrative_order_separate = mapped_events
        .windows(2)
        .any(|events| events[1].canonical_world_tick < events[0].canonical_world_tick);

    Ok(TimeDomainReport {
        database_path,
        primary_domain_id,
        scale_rules,
        mapped_events,
        query_domain_id,
        query_domain_tick,
        query_world_tick,
        affected_event_ids,
        affected_world_tick_start,
        affected_world_tick_end,
        narrative_order_separate,
    })
}

fn primary_time_domain_id(conn: &Connection) -> Result<String, String> {
    conn.query_row(
        "SELECT id FROM time_domains WHERE is_primary = 1 LIMIT 1",
        [],
        |row| row.get::<_, String>(0),
    )
    .map_err(|error| error.to_string())
}

fn time_scale_rules(conn: &Connection) -> Result<Vec<TimeScaleRuleRow>, String> {
    let mut statement = conn
        .prepare(
            r#"
SELECT
  rule.id,
  rule.source_domain_id,
  source.name,
  rule.target_domain_id,
  target.name,
  rule.source_anchor_tick,
  rule.target_anchor_tick,
  rule.source_tick_span,
  rule.target_tick_span
FROM time_scale_rules rule
JOIN time_domains source ON source.id = rule.source_domain_id
JOIN time_domains target ON target.id = rule.target_domain_id
WHERE rule.status = 'confirmed'
ORDER BY rule.id
"#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let rule_id: String = row.get(0)?;
            let source_domain_id: String = row.get(1)?;
            let source_name: String = row.get(2)?;
            let target_domain_id: String = row.get(3)?;
            let target_name: String = row.get(4)?;
            let source_anchor_tick: i64 = row.get(5)?;
            let target_anchor_tick: i64 = row.get(6)?;
            let source_tick_span: i64 = row.get(7)?;
            let target_tick_span: i64 = row.get(8)?;

            Ok(TimeScaleRuleRow {
                rule_id,
                source_domain_id,
                target_domain_id,
                source_anchor_tick,
                target_anchor_tick,
                source_tick_span,
                target_tick_span,
                summary: format!(
                    "{source_tick_span} ticks in {source_name} map to {target_tick_span} ticks in {target_name}"
                ),
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn mapped_time_domain_events(
    conn: &Connection,
    primary_domain_id: &str,
) -> Result<Vec<TimeDomainEventRow>, String> {
    let mut statement = conn
        .prepare(
            r#"
SELECT
  event.id,
  event.title,
  event.time_domain_id,
  domain.name,
  event.local_tick,
  event.narrative_order,
  event.affects_current_timeline
FROM time_domain_events event
JOIN time_domains domain ON domain.id = event.time_domain_id
WHERE event.confirmation_status = 'confirmed'
ORDER BY event.narrative_order
"#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    rows.into_iter()
        .map(
            |(
                event_id,
                title,
                time_domain_id,
                time_domain_name,
                local_tick,
                narrative_order,
                affects_current_timeline,
            )| {
                Ok(TimeDomainEventRow {
                    event_id,
                    title,
                    canonical_world_tick: map_tick_to_primary(
                        conn,
                        &time_domain_id,
                        local_tick,
                        primary_domain_id,
                    )?,
                    time_domain_id,
                    time_domain_name,
                    local_tick,
                    narrative_order,
                    affects_current_timeline: affects_current_timeline == 1,
                })
            },
        )
        .collect()
}

fn map_tick_to_primary(
    conn: &Connection,
    source_domain_id: &str,
    source_tick: i64,
    primary_domain_id: &str,
) -> Result<i64, String> {
    if source_domain_id == primary_domain_id {
        return Ok(source_tick);
    }

    let rule = conn
        .query_row(
            r#"
SELECT source_anchor_tick, target_anchor_tick, source_tick_span, target_tick_span
FROM time_scale_rules
WHERE source_domain_id = ?1
  AND target_domain_id = ?2
  AND status = 'confirmed'
LIMIT 1
"#,
            (source_domain_id, primary_domain_id),
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| {
            format!("missing time scale rule from {source_domain_id} to {primary_domain_id}")
        })?;

    let (source_anchor_tick, target_anchor_tick, source_tick_span, target_tick_span) = rule;
    let scaled_delta = (source_tick - source_anchor_tick) * target_tick_span;
    if scaled_delta % source_tick_span != 0 {
        return Err(format!(
            "non-integer time mapping for {source_domain_id}:{source_tick}"
        ));
    }

    Ok(target_anchor_tick + scaled_delta / source_tick_span)
}

struct ProviderRequestDraft {
    request_kind: String,
    model: String,
    context_scope: Vec<String>,
    user_visible_task: String,
}

fn run_vector_search_at(
    conn: &Connection,
    database_path: String,
) -> Result<VectorSearchReport, String> {
    conn.execute_batch(SCHEMA)
        .map_err(|error| error.to_string())?;
    let _ = create_fts_table(conn)?;
    let _ = ensure_seeded(conn)?;

    conn.execute(
        "UPDATE chapters SET content = 'The StarKey appears near the BlackTower.' WHERE id = 'chapter-2'",
        [],
    )
    .map_err(|error| error.to_string())?;

    rebuild_vector_index(conn)?;
    let query = "StarKey BlackTower".to_string();
    let before_update_hits = semantic_search(conn, &query, 8)?;

    let updated_chunk_text = "A sealed relic is hidden under the old well.".to_string();
    conn.execute_batch("SAVEPOINT vector_update_preview")
        .map_err(|error| error.to_string())?;

    let after_update_result = (|| {
        conn.execute(
            "UPDATE chapters SET content = ?1 WHERE id = 'chapter-2'",
            [&updated_chunk_text],
        )
        .map_err(|error| error.to_string())?;
        upsert_vector_entry(conn, "chapter", "chapter-2", &updated_chunk_text)?;
        semantic_search(conn, &query, 8)
    })();

    conn.execute_batch("ROLLBACK TO vector_update_preview; RELEASE vector_update_preview")
        .map_err(|error| error.to_string())?;

    let after_update_hits = after_update_result?;
    let entries_written = conn
        .query_row(
            "SELECT COUNT(*) FROM vector_entries WHERE embedding_model = ?1",
            [LOCAL_VECTOR_MODEL],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())? as usize;

    Ok(VectorSearchReport {
        database_path,
        embedding_model: LOCAL_VECTOR_MODEL.into(),
        query,
        entries_written,
        before_update_hits,
        updated_source_id: "chapter-2".into(),
        updated_chunk_text,
        after_update_hits,
        initial_index_rebuilt: true,
    })
}

fn rebuild_vector_index(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM vector_entries WHERE embedding_model = ?1",
        [LOCAL_VECTOR_MODEL],
    )
    .map_err(|error| error.to_string())?;

    for (source_type, source_id, chunk_text) in vector_source_rows(conn)? {
        upsert_vector_entry(conn, &source_type, &source_id, &chunk_text)?;
    }

    Ok(())
}

fn vector_source_rows(conn: &Connection) -> Result<Vec<(String, String, String)>, String> {
    let mut rows = Vec::new();

    {
        let mut statement = conn
            .prepare("SELECT id, title, content FROM chapters ORDER BY order_index")
            .map_err(|error| error.to_string())?;
        let chapter_rows = statement
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let title: String = row.get(1)?;
                let content: String = row.get(2)?;
                Ok(("chapter".into(), id, format!("{title}. {content}")))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        rows.extend(chapter_rows);
    }

    {
        let mut statement = conn
            .prepare(
                "SELECT id, title FROM events WHERE confirmation_status = 'confirmed' ORDER BY narrative_order",
            )
            .map_err(|error| error.to_string())?;
        let event_rows = statement
            .query_map([], |row| {
                Ok((
                    "event".into(),
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                ))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        rows.extend(event_rows);
    }

    {
        let mut statement = conn
            .prepare("SELECT id, entity_type, name FROM entities ORDER BY id")
            .map_err(|error| error.to_string())?;
        let entity_rows = statement
            .query_map([], |row| {
                let entity_type: String = row.get(1)?;
                let name: String = row.get(2)?;
                Ok((
                    "entity".into(),
                    row.get::<_, String>(0)?,
                    format!("{entity_type} profile: {name}"),
                ))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        rows.extend(entity_rows);
    }

    {
        let mut statement = conn
            .prepare(
                r#"
SELECT
  f.id,
  f.fact_type,
  subject.name AS subject_name,
  COALESCE(object.name, f.value_text) AS object_name,
  COALESCE(event.title, '') AS event_title
FROM facts f
JOIN entities subject ON subject.id = f.subject_entity_id
LEFT JOIN entities object ON object.id = f.object_entity_id
LEFT JOIN events event ON event.id = f.source_event_id
WHERE f.status = 'confirmed'
ORDER BY f.id
"#,
            )
            .map_err(|error| error.to_string())?;
        let fact_rows = statement
            .query_map([], |row| {
                let fact_type: String = row.get(1)?;
                let subject_name: String = row.get(2)?;
                let object_name: String = row.get(3)?;
                let event_title: String = row.get(4)?;
                Ok((
                    "fact".into(),
                    row.get::<_, String>(0)?,
                    format!("{subject_name} {fact_type} {object_name}. {event_title}"),
                ))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        rows.extend(fact_rows);
    }

    Ok(rows)
}

fn upsert_vector_entry(
    conn: &Connection,
    source_type: &str,
    source_id: &str,
    chunk_text: &str,
) -> Result<(), String> {
    let entry_id = format!("{source_type}-{source_id}");
    let embedding = embedding_to_bytes(&keyword_embedding(chunk_text));
    conn.execute(
        r#"
INSERT INTO vector_entries (
  id, source_type, source_id, chunk_text, embedding_model, embedding, updated_at
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
ON CONFLICT(source_type, source_id, embedding_model) DO UPDATE SET
  chunk_text = excluded.chunk_text,
  embedding = excluded.embedding,
  updated_at = excluded.updated_at
"#,
        (
            entry_id,
            source_type,
            source_id,
            chunk_text,
            LOCAL_VECTOR_MODEL,
            embedding,
        ),
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn semantic_search(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<VectorSearchHit>, String> {
    let query_embedding = keyword_embedding(query);
    let mut statement = conn
        .prepare(
            r#"
SELECT id, source_type, source_id, chunk_text, embedding
FROM vector_entries
WHERE embedding_model = ?1
"#,
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([LOCAL_VECTOR_MODEL], |row| {
            let bytes: Vec<u8> = row.get(4)?;
            Ok(VectorSearchHit {
                entry_id: row.get(0)?,
                source_type: row.get(1)?,
                source_id: row.get(2)?,
                chunk_text: row.get(3)?,
                similarity: cosine_similarity(&query_embedding, &embedding_from_bytes(&bytes)),
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut hits = rows;
    hits.sort_by(|left, right| {
        right
            .similarity
            .total_cmp(&left.similarity)
            .then_with(|| left.entry_id.cmp(&right.entry_id))
    });
    hits.truncate(limit);
    Ok(hits)
}

fn keyword_embedding(text: &str) -> [f32; VECTOR_DIMENSIONS] {
    let mut embedding = [0.0; VECTOR_DIMENSIONS];
    for token in tokenize_ascii(text) {
        let index = stable_token_hash(&token) % VECTOR_DIMENSIONS;
        embedding[index] += 1.0;
    }
    embedding
}

fn tokenize_ascii(text: &str) -> Vec<String> {
    text.split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|token| !token.is_empty())
        .map(|token| token.to_ascii_lowercase())
        .collect()
}

fn stable_token_hash(token: &str) -> usize {
    token.bytes().fold(2166136261usize, |hash, byte| {
        (hash ^ byte as usize).wrapping_mul(16777619usize)
    })
}

fn cosine_similarity(left: &[f32; VECTOR_DIMENSIONS], right: &[f32]) -> f32 {
    if right.len() != VECTOR_DIMENSIONS {
        return 0.0;
    }

    let mut dot = 0.0;
    let mut left_norm = 0.0;
    let mut right_norm = 0.0;
    for index in 0..VECTOR_DIMENSIONS {
        dot += left[index] * right[index];
        left_norm += left[index] * left[index];
        right_norm += right[index] * right[index];
    }

    if left_norm == 0.0 || right_norm == 0.0 {
        0.0
    } else {
        dot / (left_norm.sqrt() * right_norm.sqrt())
    }
}

fn embedding_to_bytes(embedding: &[f32; VECTOR_DIMENSIONS]) -> Vec<u8> {
    embedding
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect()
}

fn embedding_from_bytes(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
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
  ('item-key', 'item', 'StarKey'),
  ('org-star-guard', 'organization', 'StarGuard');

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

INSERT OR IGNORE INTO graph_edges (
  id, edge_type, from_entity_id, to_entity_id, valid_from_tick, valid_to_tick, source_event_id, status
) VALUES
  ('edge-lin-knows-qin', 'KNOWS', 'char-lin', 'char-qin', 900, NULL, 'event-flashback', 'confirmed'),
  ('edge-qin-member-guard', 'MEMBER_OF', 'char-qin', 'org-star-guard', 950, NULL, 'event-flashback', 'confirmed'),
  ('edge-guard-owns-key', 'OWNS', 'org-star-guard', 'item-key', 960, NULL, 'event-tower', 'confirmed'),
  ('edge-lin-located-town', 'LOCATED_AT', 'char-lin', 'loc-town', 1000, 1030, 'event-town', 'confirmed'),
  ('edge-lin-located-tower', 'LOCATED_AT', 'char-lin', 'loc-tower', 1010, 1040, 'event-tower', 'confirmed');

INSERT OR IGNORE INTO time_domains (
  id, name, is_primary, allows_nested, allows_irreversible_jump
) VALUES
  ('prime-world', 'Prime World', 1, 1, 0),
  ('mirror-realm', 'Mirror Realm', 0, 0, 0);

INSERT OR IGNORE INTO time_scale_rules (
  id, source_domain_id, target_domain_id, source_anchor_tick, target_anchor_tick,
  source_tick_span, target_tick_span, status
) VALUES
  ('rule-mirror-prime', 'mirror-realm', 'prime-world', 0, 1010, 30, 10, 'confirmed');

INSERT OR IGNORE INTO time_domain_events (
  id, title, time_domain_id, local_tick, narrative_order, source_event_id,
  affects_current_timeline, confirmation_status
) VALUES
  ('time-event-town', 'LinChe reaches QingshiTown', 'prime-world', 1000, 1, 'event-town', 1, 'confirmed'),
  ('time-event-realm-entry', 'LinChe enters Mirror Realm', 'mirror-realm', 0, 2, 'event-tower', 1, 'confirmed'),
  ('time-event-realm-duel', 'Mirror Realm duel resolves', 'mirror-realm', 45, 3, 'event-tower', 1, 'confirmed'),
  ('time-event-realm-exit', 'LinChe exits Mirror Realm', 'mirror-realm', 60, 4, 'event-tower', 1, 'confirmed'),
  ('time-event-flashback', 'Earlier promise revealed later', 'prime-world', 500, 5, 'event-flashback', 1, 'confirmed');
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

    #[test]
    fn vector_search_writes_updates_and_queries_index() {
        let db_path = std::env::temp_dir().join(format!(
            "super-novel-tauri-spike-vector-test-{}.db",
            std::process::id()
        ));
        let _ = fs::remove_file(&db_path);

        let conn = Connection::open(&db_path).expect("test database should open");
        let report = run_vector_search_at(&conn, db_path.display().to_string())
            .expect("vector search spike should run");

        assert_eq!(report.embedding_model, LOCAL_VECTOR_MODEL);
        assert!(report.initial_index_rebuilt);
        assert!(report.entries_written >= 15);
        assert_eq!(report.query, "StarKey BlackTower");
        assert_eq!(report.updated_source_id, "chapter-2");
        assert_eq!(
            report.updated_chunk_text,
            "A sealed relic is hidden under the old well."
        );
        let before_chapter_hit = report
            .before_update_hits
            .iter()
            .find(|hit| hit.source_id == "chapter-2")
            .expect("chapter-2 should be searchable before update");
        let after_chapter_hit = report
            .after_update_hits
            .iter()
            .find(|hit| hit.source_id == "chapter-2")
            .expect("chapter-2 should still be searchable after update");
        assert!(before_chapter_hit.similarity > after_chapter_hit.similarity);
        assert!(report
            .after_update_hits
            .iter()
            .any(|hit| hit.source_id == "fact-lin-key"));
        let persisted_chapter_text: String = conn
            .query_row(
                "SELECT content FROM chapters WHERE id = 'chapter-2'",
                [],
                |row| row.get(0),
            )
            .expect("chapter content should be readable");
        assert_eq!(
            persisted_chapter_text,
            "The StarKey appears near the BlackTower."
        );

        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn openai_provider_adapter_report_keeps_security_boundary() {
        let report =
            run_openai_provider_adapter_report().expect("provider adapter spike should run");

        assert_eq!(report.provider_name, "openai");
        assert_eq!(report.text_generation_api, "Responses API");
        assert_eq!(report.embedding_api, "Embeddings API");
        assert_eq!(report.api_key_env_var, "OPENAI_API_KEY");
        assert_eq!(report.request_kind, "generate_repair_patch");
        assert_eq!(report.candidate_status, "candidate");
        assert!(report.response_would_be_candidate);
        assert!(!report.writes_to_fact_store);
        assert!(!report.logs_include_api_key);
        assert!(report.redacted_request_summary.contains("API key omitted"));
        assert_eq!(report.context_scope.len(), 3);
    }

    #[test]
    fn relationship_path_finds_multi_hop_relation() {
        let db_path = std::env::temp_dir().join(format!(
            "super-novel-tauri-spike-relationship-path-test-{}.db",
            std::process::id()
        ));
        let _ = fs::remove_file(&db_path);

        let conn = Connection::open(&db_path).expect("test database should open");
        let report = run_relationship_path_at(&conn, db_path.display().to_string())
            .expect("relationship path spike should run");

        assert!(report.path_found);
        assert_eq!(report.start_entity_id, "char-lin");
        assert_eq!(report.target_entity_id, "item-key");
        assert_eq!(report.hop_count, 3);
        assert_eq!(
            report.entity_path,
            vec!["LinChe", "QinYuan", "StarGuard", "StarKey"]
        );
        assert_eq!(report.edge_path, vec!["KNOWS", "MEMBER_OF", "OWNS"]);
        assert!(report.source_event_ids.contains(&"event-tower".to_string()));
        assert!(report.path_summary.contains("LinChe -[KNOWS]-> QinYuan"));

        let missing_path = relationship_path(&conn, "item-key", "char-lin", 1030, 4)
            .expect("reverse path query should run");
        assert!(missing_path.is_none());

        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn time_domain_maps_local_ticks_to_primary_world_time() {
        let db_path = std::env::temp_dir().join(format!(
            "super-novel-tauri-spike-time-domain-test-{}.db",
            std::process::id()
        ));
        let _ = fs::remove_file(&db_path);

        let conn = Connection::open(&db_path).expect("test database should open");
        let report =
            run_time_domain_at(&conn, db_path.display().to_string()).expect("time domain report");

        assert_eq!(report.primary_domain_id, "prime-world");
        assert_eq!(report.query_domain_id, "mirror-realm");
        assert_eq!(report.query_domain_tick, 45);
        assert_eq!(report.query_world_tick, 1025);
        assert_eq!(report.affected_world_tick_start, 1010);
        assert_eq!(report.affected_world_tick_end, 1030);
        assert!(report.narrative_order_separate);
        assert!(report
            .affected_event_ids
            .contains(&"time-event-realm-duel".to_string()));
        assert!(report
            .scale_rules
            .iter()
            .any(|rule| rule.rule_id == "rule-mirror-prime"));

        let flashback = report
            .mapped_events
            .iter()
            .find(|event| event.event_id == "time-event-flashback")
            .expect("flashback event should be mapped");
        assert_eq!(flashback.canonical_world_tick, 500);
        assert_eq!(flashback.narrative_order, 5);

        let _ = fs::remove_file(&db_path);
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
            run_snapshot_restore_spike,
            run_vector_search_spike,
            run_openai_provider_adapter_spike,
            run_relationship_path_spike,
            run_time_domain_spike
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
