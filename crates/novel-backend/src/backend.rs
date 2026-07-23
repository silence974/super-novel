use std::{path::Path, str::FromStr, sync::Mutex};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Transaction, params};

use crate::{
    BackendError, Chapter, ChapterCheckpoint, ChapterCheckpointSummary, ChapterId, ChapterStatus,
    ChapterSummary, CheckpointId, CheckpointSource, CreateChapter, CreateCheckpoint, CreateVolume,
    Outline, Project, ProjectId, RestoreCheckpoint, Result, SaveWorkingDraft, VolumeId, VolumeNode,
    WorkId,
    schema::{MIGRATION_1, SCHEMA_VERSION},
    sqlite_value::{from_sql_i64, to_sql_i64},
};

const POSITION_STEP: i64 = 1_024;
const MAX_TITLE_CHARS: usize = 200;

pub struct NovelBackend {
    connection: Mutex<Connection>,
}

impl NovelBackend {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let connection = Connection::open(path)?;
        Self::from_connection(connection)
    }

    fn from_connection(connection: Connection) -> Result<Self> {
        let journal_mode: String =
            connection.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;
        if !journal_mode.eq_ignore_ascii_case("wal") {
            return Err(BackendError::CorruptData(format!(
                "journal_mode must be wal, got {journal_mode}"
            )));
        }

        connection.execute_batch("PRAGMA foreign_keys = ON;")?;
        let foreign_keys: i64 =
            connection.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
        if foreign_keys != 1 {
            return Err(BackendError::CorruptData(format!(
                "foreign_keys must be 1, got {foreign_keys}"
            )));
        }

        connection.execute_batch(MIGRATION_1)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn initialize_project(&self, name: impl Into<String>) -> Result<Project> {
        let name = validated_title(name.into(), "project name")?;
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;

        if project_exists(&transaction)? {
            return Err(BackendError::AlreadyInitialized);
        }

        let project_id = ProjectId::new();
        let work_id = WorkId::new();
        let now = now_ms();

        transaction.execute(
            "INSERT INTO projects(id, name, created_at_ms, updated_at_ms, schema_version)
             VALUES (?1, ?2, ?3, ?3, ?4)",
            params![project_id.as_str(), name, now, SCHEMA_VERSION],
        )?;
        transaction.execute(
            "INSERT INTO works(id, project_id, title, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![work_id.as_str(), project_id.as_str(), name, now],
        )?;
        transaction.commit()?;

        Ok(Project {
            id: project_id,
            name,
            work_id,
            created_at_ms: now,
            updated_at_ms: now,
            schema_version: SCHEMA_VERSION,
        })
    }

    pub fn project(&self) -> Result<Project> {
        let connection = self.lock()?;
        load_project(&connection)?.ok_or(BackendError::NotInitialized)
    }

    pub fn create_volume(&self, input: CreateVolume) -> Result<VolumeNode> {
        let title = validated_title(input.title, "volume title")?;
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let work_id = require_work_id(&transaction)?;
        let position = next_position(&transaction, "volumes", "work_id", work_id.as_str())?;
        let volume_id = VolumeId::new();
        let now = now_ms();

        transaction.execute(
            "INSERT INTO volumes(id, work_id, title, position, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![volume_id.as_str(), work_id.as_str(), title, position, now],
        )?;
        touch_project(&transaction, now)?;
        transaction.commit()?;

        Ok(VolumeNode {
            id: volume_id,
            title,
            position,
            chapters: Vec::new(),
        })
    }

    pub fn create_chapter(&self, input: CreateChapter) -> Result<Chapter> {
        let title = validated_title(input.title, "chapter title")?;
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let work_id = require_work_id(&transaction)?;

        if let Some(volume_id) = &input.volume_id {
            ensure_volume_in_work(&transaction, volume_id, &work_id)?;
        }

        let position = next_chapter_position(&transaction, &work_id, input.volume_id.as_ref())?;
        let chapter_id = ChapterId::new();
        let now = now_ms();

        transaction.execute(
            "INSERT INTO chapters(
                id, work_id, volume_id, title, status, position,
                non_whitespace_char_count, created_at_ms, updated_at_ms
             ) VALUES (?1, ?2, ?3, ?4, 'planning', ?5, 0, ?6, ?6)",
            params![
                chapter_id.as_str(),
                work_id.as_str(),
                input.volume_id.as_ref().map(VolumeId::as_str),
                title,
                position,
                now
            ],
        )?;
        transaction.execute(
            "INSERT INTO chapter_drafts(
                chapter_id, content, edit_revision, checkpointed_edit_revision, updated_at_ms
             ) VALUES (?1, '', 0, NULL, ?2)",
            params![chapter_id.as_str(), now],
        )?;
        touch_project(&transaction, now)?;
        transaction.commit()?;

        Ok(Chapter {
            id: chapter_id,
            volume_id: input.volume_id,
            title,
            status: ChapterStatus::Planning,
            position,
            content: String::new(),
            edit_revision: 0,
            non_whitespace_char_count: 0,
            created_at_ms: now,
            updated_at_ms: now,
        })
    }

    pub fn chapter(&self, chapter_id: &ChapterId) -> Result<Chapter> {
        let connection = self.lock()?;
        load_chapter(&connection, chapter_id)?.ok_or_else(|| BackendError::NotFound {
            resource: "chapter",
            id: chapter_id.to_string(),
        })
    }

    pub fn save_working_draft(&self, input: SaveWorkingDraft) -> Result<Chapter> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let current = current_edit_revision(&transaction, &input.chapter_id)?;
        if current != input.expected_edit_revision {
            return Err(BackendError::RevisionConflict {
                expected: input.expected_edit_revision,
                current,
            });
        }
        let next = current
            .checked_add(1)
            .ok_or_else(|| BackendError::CorruptData("edit_revision overflow".into()))?;
        let char_count = count_non_whitespace(&input.content);
        let now = now_ms();
        transaction.execute(
            "UPDATE chapter_drafts
             SET content = ?2, edit_revision = ?3, updated_at_ms = ?4
             WHERE chapter_id = ?1",
            params![
                input.chapter_id.as_str(),
                input.content,
                to_sql_i64(next, "edit_revision")?,
                now
            ],
        )?;
        update_chapter_after_draft(&transaction, &input.chapter_id, char_count, now)?;
        let chapter = load_chapter(&transaction, &input.chapter_id)?.ok_or_else(|| {
            BackendError::NotFound {
                resource: "chapter",
                id: input.chapter_id.to_string(),
            }
        })?;
        transaction.commit()?;
        Ok(chapter)
    }

    pub fn create_checkpoint(&self, input: CreateCheckpoint) -> Result<ChapterCheckpoint> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let draft = load_draft(&transaction, &input.chapter_id)?;
        if draft.edit_revision != input.expected_edit_revision {
            return Err(BackendError::RevisionConflict {
                expected: input.expected_edit_revision,
                current: draft.edit_revision,
            });
        }

        if draft.checkpointed_edit_revision == Some(draft.edit_revision) {
            let checkpoint =
                load_latest_checkpoint(&transaction, &input.chapter_id)?.ok_or_else(|| {
                    BackendError::CorruptData(format!(
                        "chapter {} records checkpointed edit revision {} without a checkpoint",
                        input.chapter_id, draft.edit_revision
                    ))
                })?;
            transaction.commit()?;
            return Ok(checkpoint);
        }

        let checkpoint = insert_checkpoint(
            &transaction,
            &input.chapter_id,
            &input.source,
            draft.edit_revision,
            None,
            &draft.content,
        )?;
        transaction.execute(
            "UPDATE chapter_drafts
             SET checkpointed_edit_revision = ?2
             WHERE chapter_id = ?1",
            params![
                input.chapter_id.as_str(),
                to_sql_i64(draft.edit_revision, "checkpointed_edit_revision")?
            ],
        )?;
        transaction.commit()?;
        Ok(checkpoint)
    }

    pub fn list_checkpoints(
        &self,
        chapter_id: &ChapterId,
    ) -> Result<Vec<ChapterCheckpointSummary>> {
        let connection = self.lock()?;
        if !chapter_exists(&connection, chapter_id)? {
            return Err(BackendError::NotFound {
                resource: "chapter",
                id: chapter_id.to_string(),
            });
        }

        let mut statement = connection.prepare(
            "SELECT id, chapter_id, source, source_edit_revision,
                    restored_from_checkpoint_id,
                    non_whitespace_char_count, created_at_ms
             FROM chapter_checkpoints
             WHERE chapter_id = ?1
             ORDER BY created_at_ms DESC, id DESC",
        )?;
        let rows = statement.query_map([chapter_id.as_str()], |row| {
            let source: String = row.get(2)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                source,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
            ))
        })?;

        rows.map(|row| {
            let (
                id,
                chapter_id,
                source,
                source_edit_revision,
                restored_from_checkpoint_id,
                char_count,
                created_at_ms,
            ) = row?;
            Ok(ChapterCheckpointSummary {
                id: CheckpointId::from_stored(id),
                chapter_id: ChapterId::from_stored(chapter_id),
                source: parse_checkpoint_source(&source)?,
                source_edit_revision: from_sql_i64(source_edit_revision, "source_edit_revision")?,
                restored_from_checkpoint_id: restored_from_checkpoint_id
                    .map(CheckpointId::from_stored),
                non_whitespace_char_count: from_sql_i64(char_count, "non_whitespace_char_count")?,
                created_at_ms,
            })
        })
        .collect()
    }

    pub fn checkpoint(&self, checkpoint_id: &CheckpointId) -> Result<ChapterCheckpoint> {
        let connection = self.lock()?;
        load_checkpoint(&connection, checkpoint_id)?.ok_or_else(|| BackendError::NotFound {
            resource: "chapter checkpoint",
            id: checkpoint_id.to_string(),
        })
    }

    pub fn restore_checkpoint(&self, input: RestoreCheckpoint) -> Result<Chapter> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let current = current_edit_revision(&transaction, &input.chapter_id)?;
        if current != input.expected_edit_revision {
            return Err(BackendError::RevisionConflict {
                expected: input.expected_edit_revision,
                current,
            });
        }
        let checkpoint =
            load_checkpoint_for_chapter(&transaction, &input.checkpoint_id, &input.chapter_id)?
                .ok_or_else(|| BackendError::NotFound {
                    resource: "chapter checkpoint",
                    id: input.checkpoint_id.to_string(),
                })?;
        let next = current
            .checked_add(1)
            .ok_or_else(|| BackendError::CorruptData("edit_revision overflow".into()))?;
        let now = now_ms();
        transaction.execute(
            "UPDATE chapter_drafts
             SET content = ?2, edit_revision = ?3, checkpointed_edit_revision = ?3,
                 updated_at_ms = ?4
             WHERE chapter_id = ?1",
            params![
                input.chapter_id.as_str(),
                checkpoint.content,
                to_sql_i64(next, "edit_revision")?,
                now
            ],
        )?;
        update_chapter_after_draft(
            &transaction,
            &input.chapter_id,
            checkpoint.non_whitespace_char_count,
            now,
        )?;
        insert_checkpoint(
            &transaction,
            &input.chapter_id,
            &CheckpointSource::Restore,
            next,
            Some(&input.checkpoint_id),
            &checkpoint.content,
        )?;
        let chapter = load_chapter(&transaction, &input.chapter_id)?.ok_or_else(|| {
            BackendError::NotFound {
                resource: "chapter",
                id: input.chapter_id.to_string(),
            }
        })?;
        transaction.commit()?;
        Ok(chapter)
    }

    pub fn outline(&self) -> Result<Outline> {
        let connection = self.lock()?;
        let work_id = require_work_id(&connection)?;

        let mut volumes_statement = connection.prepare(
            "SELECT id, title, position FROM volumes WHERE work_id = ?1 ORDER BY position, id",
        )?;
        let volume_rows = volumes_statement.query_map([work_id.as_str()], |row| {
            Ok(VolumeNode {
                id: VolumeId::from_stored(row.get(0)?),
                title: row.get(1)?,
                position: row.get(2)?,
                chapters: Vec::new(),
            })
        })?;
        let mut volumes = volume_rows.collect::<std::result::Result<Vec<_>, _>>()?;

        let mut chapters_statement = connection.prepare(
            "SELECT c.id, c.volume_id, c.title, c.status, c.position, d.edit_revision,
                    c.non_whitespace_char_count, c.updated_at_ms
             FROM chapters c
             JOIN chapter_drafts d ON d.chapter_id = c.id
             WHERE c.work_id = ?1
             ORDER BY CASE WHEN c.volume_id IS NULL THEN 0 ELSE 1 END, c.position, c.id",
        )?;
        let chapter_rows = chapters_statement.query_map([work_id.as_str()], |row| {
            let status: String = row.get(3)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                status,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, i64>(7)?,
            ))
        })?;

        let mut ungrouped_chapters = Vec::new();
        for row in chapter_rows {
            let (id, volume_id, title, status, position, revision, char_count, updated_at_ms) =
                row?;
            let summary = ChapterSummary {
                id: ChapterId::from_stored(id),
                title,
                status: parse_chapter_status(&status)?,
                position,
                edit_revision: from_sql_i64(revision, "edit_revision")?,
                non_whitespace_char_count: from_sql_i64(char_count, "non_whitespace_char_count")?,
                updated_at_ms,
            };

            match volume_id {
                None => ungrouped_chapters.push(summary),
                Some(volume_id) => {
                    let volume = volumes
                        .iter_mut()
                        .find(|volume| volume.id.as_str() == volume_id)
                        .ok_or_else(|| {
                            BackendError::CorruptData(format!(
                                "chapter {} references missing volume {volume_id}",
                                summary.id
                            ))
                        })?;
                    volume.chapters.push(summary);
                }
            }
        }

        Ok(Outline {
            work_id,
            volumes,
            ungrouped_chapters,
        })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|_| BackendError::LockPoisoned)
    }
}

fn current_edit_revision(connection: &Connection, chapter_id: &ChapterId) -> Result<u64> {
    connection
        .query_row(
            "SELECT edit_revision FROM chapter_drafts WHERE chapter_id = ?1",
            [chapter_id.as_str()],
            |row| row.get::<_, i64>(0),
        )
        .optional()?
        .map(|revision| from_sql_i64(revision, "edit_revision"))
        .transpose()?
        .ok_or_else(|| BackendError::NotFound {
            resource: "chapter",
            id: chapter_id.to_string(),
        })
}

struct DraftState {
    content: String,
    edit_revision: u64,
    checkpointed_edit_revision: Option<u64>,
}

fn load_draft(connection: &Connection, chapter_id: &ChapterId) -> Result<DraftState> {
    connection
        .query_row(
            "SELECT content, edit_revision, checkpointed_edit_revision
             FROM chapter_drafts
             WHERE chapter_id = ?1",
            [chapter_id.as_str()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                ))
            },
        )
        .optional()?
        .map(
            |(content, edit_revision, checkpointed_edit_revision)| -> Result<DraftState> {
                Ok(DraftState {
                    content,
                    edit_revision: from_sql_i64(edit_revision, "edit_revision")?,
                    checkpointed_edit_revision: checkpointed_edit_revision
                        .map(|revision| from_sql_i64(revision, "checkpointed_edit_revision"))
                        .transpose()?,
                })
            },
        )
        .transpose()?
        .ok_or_else(|| BackendError::NotFound {
            resource: "chapter",
            id: chapter_id.to_string(),
        })
}

fn insert_checkpoint(
    transaction: &Transaction<'_>,
    chapter_id: &ChapterId,
    source: &CheckpointSource,
    source_edit_revision: u64,
    restored_from_checkpoint_id: Option<&CheckpointId>,
    content: &str,
) -> Result<ChapterCheckpoint> {
    let checkpoint_id = CheckpointId::new();
    let char_count = count_non_whitespace(content);
    let now = now_ms();
    transaction.execute(
        "INSERT INTO chapter_checkpoints(
            id, chapter_id, source, source_edit_revision, restored_from_checkpoint_id, content,
            non_whitespace_char_count, created_at_ms
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            checkpoint_id.as_str(),
            chapter_id.as_str(),
            source.as_str(),
            to_sql_i64(source_edit_revision, "source_edit_revision")?,
            restored_from_checkpoint_id.map(CheckpointId::as_str),
            content,
            to_sql_i64(char_count, "non_whitespace_char_count")?,
            now
        ],
    )?;

    Ok(ChapterCheckpoint {
        id: checkpoint_id,
        chapter_id: chapter_id.clone(),
        source: source.clone(),
        source_edit_revision,
        restored_from_checkpoint_id: restored_from_checkpoint_id.cloned(),
        content: content.to_owned(),
        non_whitespace_char_count: char_count,
        created_at_ms: now,
    })
}

type StoredCheckpoint = (
    String,
    String,
    String,
    i64,
    Option<String>,
    String,
    i64,
    i64,
);

fn load_checkpoint(
    connection: &Connection,
    checkpoint_id: &CheckpointId,
) -> Result<Option<ChapterCheckpoint>> {
    let stored = connection
        .query_row(
            "SELECT id, chapter_id, source, source_edit_revision,
                    restored_from_checkpoint_id, content,
                    non_whitespace_char_count, created_at_ms
             FROM chapter_checkpoints
             WHERE id = ?1",
            [checkpoint_id.as_str()],
            stored_checkpoint_from_row,
        )
        .optional()?;
    stored.map(checkpoint_from_stored).transpose()
}

fn load_checkpoint_for_chapter(
    connection: &Connection,
    checkpoint_id: &CheckpointId,
    chapter_id: &ChapterId,
) -> Result<Option<ChapterCheckpoint>> {
    let stored = connection
        .query_row(
            "SELECT id, chapter_id, source, source_edit_revision,
                    restored_from_checkpoint_id, content,
                    non_whitespace_char_count, created_at_ms
             FROM chapter_checkpoints
             WHERE id = ?1 AND chapter_id = ?2",
            params![checkpoint_id.as_str(), chapter_id.as_str()],
            stored_checkpoint_from_row,
        )
        .optional()?;
    stored.map(checkpoint_from_stored).transpose()
}

fn load_latest_checkpoint(
    connection: &Connection,
    chapter_id: &ChapterId,
) -> Result<Option<ChapterCheckpoint>> {
    let stored = connection
        .query_row(
            "SELECT id, chapter_id, source, source_edit_revision,
                    restored_from_checkpoint_id, content,
                    non_whitespace_char_count, created_at_ms
             FROM chapter_checkpoints
             WHERE chapter_id = ?1
             ORDER BY created_at_ms DESC, id DESC
             LIMIT 1",
            [chapter_id.as_str()],
            stored_checkpoint_from_row,
        )
        .optional()?;
    stored.map(checkpoint_from_stored).transpose()
}

fn stored_checkpoint_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredCheckpoint> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
    ))
}

fn checkpoint_from_stored(
    (
        id,
        chapter_id,
        source,
        source_edit_revision,
        restored_from_checkpoint_id,
        content,
        char_count,
        created_at_ms,
    ): StoredCheckpoint,
) -> Result<ChapterCheckpoint> {
    Ok(ChapterCheckpoint {
        id: CheckpointId::from_stored(id),
        chapter_id: ChapterId::from_stored(chapter_id),
        source: parse_checkpoint_source(&source)?,
        source_edit_revision: from_sql_i64(source_edit_revision, "source_edit_revision")?,
        restored_from_checkpoint_id: restored_from_checkpoint_id.map(CheckpointId::from_stored),
        content,
        non_whitespace_char_count: from_sql_i64(char_count, "non_whitespace_char_count")?,
        created_at_ms,
    })
}

fn update_chapter_after_draft(
    transaction: &Transaction<'_>,
    chapter_id: &ChapterId,
    char_count: u64,
    now: i64,
) -> Result<()> {
    transaction.execute(
        "UPDATE chapters
         SET non_whitespace_char_count = ?2,
             status = CASE WHEN status = 'planning' THEN 'drafting' ELSE status END,
             updated_at_ms = ?3
         WHERE id = ?1",
        params![
            chapter_id.as_str(),
            to_sql_i64(char_count, "non_whitespace_char_count")?,
            now
        ],
    )?;
    touch_project(transaction, now)?;
    Ok(())
}

fn load_project(connection: &Connection) -> Result<Option<Project>> {
    connection
        .query_row(
            "SELECT p.id, p.name, w.id, p.created_at_ms, p.updated_at_ms, p.schema_version
             FROM projects p
             JOIN works w ON w.project_id = p.id
             LIMIT 1",
            [],
            |row| {
                Ok(Project {
                    id: ProjectId::from_stored(row.get(0)?),
                    name: row.get(1)?,
                    work_id: WorkId::from_stored(row.get(2)?),
                    created_at_ms: row.get(3)?,
                    updated_at_ms: row.get(4)?,
                    schema_version: row.get(5)?,
                })
            },
        )
        .optional()
        .map_err(Into::into)
}

fn load_chapter(connection: &Connection, chapter_id: &ChapterId) -> Result<Option<Chapter>> {
    let stored = connection
        .query_row(
            "SELECT c.id, c.volume_id, c.title, c.status, c.position, d.content,
                    d.edit_revision, c.non_whitespace_char_count,
                    c.created_at_ms, c.updated_at_ms
             FROM chapters c
             JOIN chapter_drafts d ON d.chapter_id = c.id
             WHERE c.id = ?1",
            [chapter_id.as_str()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, i64>(9)?,
                ))
            },
        )
        .optional()?;

    stored
        .map(
            |(
                id,
                volume_id,
                title,
                status,
                position,
                content,
                revision,
                char_count,
                created,
                updated,
            )| {
                Ok(Chapter {
                    id: ChapterId::from_stored(id),
                    volume_id: volume_id.map(VolumeId::from_stored),
                    title,
                    status: parse_chapter_status(&status)?,
                    position,
                    content,
                    edit_revision: from_sql_i64(revision, "edit_revision")?,
                    non_whitespace_char_count: from_sql_i64(
                        char_count,
                        "non_whitespace_char_count",
                    )?,
                    created_at_ms: created,
                    updated_at_ms: updated,
                })
            },
        )
        .transpose()
}

fn project_exists(connection: &Connection) -> Result<bool> {
    Ok(
        connection.query_row("SELECT EXISTS(SELECT 1 FROM projects)", [], |row| {
            row.get(0)
        })?,
    )
}

fn chapter_exists(connection: &Connection, chapter_id: &ChapterId) -> Result<bool> {
    Ok(connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM chapters WHERE id = ?1)",
        [chapter_id.as_str()],
        |row| row.get(0),
    )?)
}

fn require_work_id(connection: &Connection) -> Result<WorkId> {
    connection
        .query_row("SELECT id FROM works LIMIT 1", [], |row| {
            row.get::<_, String>(0)
        })
        .optional()?
        .map(WorkId::from_stored)
        .ok_or(BackendError::NotInitialized)
}

fn ensure_volume_in_work(
    connection: &Connection,
    volume_id: &VolumeId,
    work_id: &WorkId,
) -> Result<()> {
    let exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM volumes WHERE id = ?1 AND work_id = ?2)",
        params![volume_id.as_str(), work_id.as_str()],
        |row| row.get(0),
    )?;
    if exists {
        Ok(())
    } else {
        Err(BackendError::NotFound {
            resource: "volume",
            id: volume_id.to_string(),
        })
    }
}

fn next_position(
    connection: &Connection,
    table: &str,
    owner_column: &str,
    owner_id: &str,
) -> Result<i64> {
    debug_assert!(matches!((table, owner_column), ("volumes", "work_id")));
    let sql = format!(
        "SELECT COALESCE(MAX(position), 0) + {POSITION_STEP} FROM {table} WHERE {owner_column} = ?1"
    );
    Ok(connection.query_row(&sql, [owner_id], |row| row.get(0))?)
}

fn next_chapter_position(
    connection: &Connection,
    work_id: &WorkId,
    volume_id: Option<&VolumeId>,
) -> Result<i64> {
    let position = match volume_id {
        Some(volume_id) => connection.query_row(
            "SELECT COALESCE(MAX(position), 0) + ?3
             FROM chapters WHERE work_id = ?1 AND volume_id = ?2",
            params![work_id.as_str(), volume_id.as_str(), POSITION_STEP],
            |row| row.get(0),
        )?,
        None => connection.query_row(
            "SELECT COALESCE(MAX(position), 0) + ?2
             FROM chapters WHERE work_id = ?1 AND volume_id IS NULL",
            params![work_id.as_str(), POSITION_STEP],
            |row| row.get(0),
        )?,
    };
    Ok(position)
}

fn touch_project(connection: &Connection, now: i64) -> Result<()> {
    connection.execute("UPDATE projects SET updated_at_ms = ?1", [now])?;
    connection.execute("UPDATE works SET updated_at_ms = ?1", [now])?;
    Ok(())
}

fn validated_title(value: String, field: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(BackendError::Validation(format!("{field} cannot be empty")));
    }
    if trimmed.chars().count() > MAX_TITLE_CHARS {
        return Err(BackendError::Validation(format!(
            "{field} cannot exceed {MAX_TITLE_CHARS} characters"
        )));
    }
    Ok(trimmed.to_owned())
}

fn parse_chapter_status(value: &str) -> Result<ChapterStatus> {
    ChapterStatus::from_str(value).map_err(BackendError::CorruptData)
}

fn parse_checkpoint_source(value: &str) -> Result<CheckpointSource> {
    CheckpointSource::from_str(value).map_err(BackendError::CorruptData)
}

fn count_non_whitespace(content: &str) -> u64 {
    content
        .chars()
        .filter(|character| !character.is_whitespace())
        .count() as u64
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::NovelBackend;
    use crate::BackendError;
    use tempfile::tempdir;

    #[test]
    fn rejects_connections_that_cannot_enable_wal() {
        let error = match NovelBackend::open(":memory:") {
            Ok(_) => panic!("in-memory connection must not be accepted"),
            Err(error) => error,
        };

        assert!(matches!(error, BackendError::CorruptData(message)
            if message.contains("journal_mode") && message.contains("memory")));
    }

    #[test]
    fn file_connection_enables_wal_and_foreign_keys() {
        let directory = tempdir().expect("temporary directory");
        let backend = NovelBackend::open(directory.path().join("project.db"))
            .expect("open file-backed backend");
        let connection = backend.connection.lock().expect("lock backend connection");
        let journal_mode: String = connection
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .expect("read journal mode");
        let foreign_keys: i64 = connection
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .expect("read foreign key setting");

        assert_eq!(journal_mode, "wal");
        assert_eq!(foreign_keys, 1);
    }
}
