pub(crate) const SCHEMA_VERSION: u32 = 1;

pub(crate) const MIGRATION_1: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    schema_version INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS works (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS volumes (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    UNIQUE(work_id, position)
) STRICT;

CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    volume_id TEXT REFERENCES volumes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('planning', 'drafting', 'revising', 'final')),
    position INTEGER NOT NULL,
    current_revision INTEGER NOT NULL,
    non_whitespace_char_count INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    UNIQUE(work_id, volume_id, position)
) STRICT;

CREATE INDEX IF NOT EXISTS chapters_work_order
    ON chapters(work_id, volume_id, position);

CREATE TABLE IF NOT EXISTS chapter_revisions (
    chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('user', 'import', 'ai_accepted', 'restore')),
    restored_from_revision INTEGER,
    non_whitespace_char_count INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY(chapter_id, revision)
) STRICT;

INSERT INTO app_metadata(key, value)
VALUES ('schema_version', '1')
ON CONFLICT(key) DO NOTHING;
"#;
