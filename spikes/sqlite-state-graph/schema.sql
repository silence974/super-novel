PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE calendars (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE time_domains (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  parent_domain_id TEXT REFERENCES time_domains(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  rate_to_parent REAL NOT NULL DEFAULT 1.0,
  anchor_parent_tick INTEGER NOT NULL DEFAULT 0,
  anchor_domain_tick INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  updated_at TEXT NOT NULL
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  world_tick INTEGER NOT NULL,
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  time_domain_id TEXT NOT NULL REFERENCES time_domains(id) ON DELETE CASCADE,
  narrative_order INTEGER NOT NULL,
  source_chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  confirmation_status TEXT NOT NULL CHECK (confirmation_status IN ('draft', 'candidate', 'confirmed', 'superseded', 'deprecated'))
);

CREATE TABLE facts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fact_type TEXT NOT NULL,
  subject_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  object_entity_id TEXT REFERENCES entities(id) ON DELETE CASCADE,
  value_text TEXT NOT NULL DEFAULT '',
  valid_from_tick INTEGER NOT NULL,
  valid_to_tick INTEGER,
  source_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('candidate', 'confirmed', 'deprecated'))
);

CREATE TABLE graph_edges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL,
  from_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  valid_from_tick INTEGER NOT NULL,
  valid_to_tick INTEGER,
  source_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('candidate', 'confirmed', 'deprecated'))
);

CREATE TABLE check_results (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning', 'notice')),
  rule_id TEXT NOT NULL,
  message TEXT NOT NULL,
  subject_ref TEXT NOT NULL DEFAULT '',
  object_ref TEXT NOT NULL DEFAULT '',
  source_refs TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE vector_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding_model TEXT NOT NULL DEFAULT '',
  embedding BLOB,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_events_time ON events(project_id, world_tick, narrative_order);
CREATE INDEX idx_facts_lookup ON facts(project_id, fact_type, subject_entity_id, valid_from_tick, valid_to_tick, status);
CREATE INDEX idx_facts_object_lookup ON facts(project_id, fact_type, object_entity_id, valid_from_tick, valid_to_tick, status);
CREATE INDEX idx_edges_lookup ON graph_edges(project_id, edge_type, from_entity_id, to_entity_id, valid_from_tick, valid_to_tick, status);
CREATE INDEX idx_check_results_status ON check_results(project_id, severity, status);

