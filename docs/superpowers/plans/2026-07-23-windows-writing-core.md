# Windows Writing Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable Windows desktop application that creates and opens directory-based novel projects, edits plain-text chapters with reliable autosave, and previews or restores immutable checkpoints.

**Architecture:** Keep the domain and SQLite use cases in the Tauri-independent `novel-backend` crate. Add a Tauri v2 adapter that owns one active project session and exposes typed commands, then build a React/TypeScript three-pane workbench on those commands.

**Tech Stack:** Rust 1.95 / edition 2024, rusqlite 0.39, Tauri 2.11, React 19.2, TypeScript 7.0, Vite 8.1, Vitest 4.1, SQLite, WebView2, NSIS.

## Global Constraints

- The editor stores and edits plain text only.
- Autosave starts 800ms after input becomes idle.
- Periodic checkpoints are due after 5 minutes of continued editing.
- Each project lives in a user-selected directory containing `super-novel.toml` and `.super-novel/project.db`.
- One application window owns at most one active project session.
- SQLite foreign keys and WAL are enabled for every project connection.
- Stale `expectedEditRevision` values return `revision_conflict`; they never overwrite newer text.
- The first installer is an unsigned NSIS bundle with no auto-update support.
- Scene blocks, canonical manuscript, project commits, snapshots, branches, AI, sync, and collaboration remain out of scope.

---

## File Map

### Backend

- `Cargo.toml`: workspace members and shared dependencies.
- `crates/novel-backend/src/backend.rs`: public `NovelBackend` facade and transactional writing use cases.
- `crates/novel-backend/src/error.rs`: stable backend error variants.
- `crates/novel-backend/src/manifest.rs`: project manifest parsing and atomic directory lifecycle.
- `crates/novel-backend/src/model.rs`: IDs, enums, inputs, and serializable output models.
- `crates/novel-backend/src/schema.rs`: schema v1 and connection initialization.
- `crates/novel-backend/src/sqlite_value.rs`: checked unsigned/integer conversion at the SQLite boundary.
- `crates/novel-backend/tests/project_lifecycle.rs`: project directory create/open/recovery integration tests.
- `crates/novel-backend/tests/writing_flow.rs`: outline, draft, checkpoint, restore, and conflict integration tests.

### Desktop adapter

- `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`: Tauri build and NSIS configuration.
- `src-tauri/capabilities/default.json`: minimum dialog and core permissions.
- `src-tauri/src/error.rs`: safe command error mapping.
- `src-tauri/src/session.rs`: one-project application session.
- `src-tauri/src/commands.rs`: typed Tauri command adapter.
- `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`: application assembly and entry point.

### Frontend

- `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`: React/Vite toolchain.
- `src/contracts.ts`: shared frontend DTO and error types.
- `src/api.ts`: the only frontend module that invokes Tauri.
- `src/useDraftAutosave.ts`: deterministic autosave/checkpoint state machine.
- `src/App.tsx`: startup/workspace routing.
- `src/components/StartScreen.tsx`: create/open project flow.
- `src/components/OutlinePane.tsx`: volume/chapter tree.
- `src/components/EditorPane.tsx`: plain-text editor and save status.
- `src/components/HistoryPane.tsx`: checkpoint list, preview, and restore.
- `src/components/Workspace.tsx`: three-pane orchestration.
- `src/styles.css`: approved warm-neutral desktop layout.
- `src/test/setup.ts` and `src/**/*.test.tsx`: frontend behavior tests.

---

### Task 1: Recover a trustworthy backend baseline

**Files:**
- Modify: `Cargo.toml`
- Modify: `crates/novel-backend/Cargo.toml`
- Modify: `crates/novel-backend/src/backend.rs`
- Modify: `crates/novel-backend/src/error.rs`
- Modify: `crates/novel-backend/src/lib.rs`
- Modify: `crates/novel-backend/src/model.rs`
- Create: `crates/novel-backend/src/sqlite_value.rs`
- Modify: `crates/novel-backend/tests/writing_flow.rs`

**Interfaces:**
- Consumes: the existing uncommitted `NovelBackend` prototype and its three writing-flow tests.
- Produces: `sqlite_value::{to_sql_i64, from_sql_i64}` and a compiling backend baseline whose current tests pass.

- [ ] **Step 1: Add failing conversion tests before changing SQLite calls**

Add this unit test module to the new `sqlite_value.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::{from_sql_i64, to_sql_i64};
    use crate::BackendError;

    #[test]
    fn rejects_unsigned_values_larger_than_sqlite_integer() {
        let error = to_sql_i64(u64::MAX, "edit_revision").unwrap_err();
        assert!(matches!(error, BackendError::CorruptData(message)
            if message.contains("edit_revision")));
    }

    #[test]
    fn rejects_negative_sqlite_values_for_unsigned_fields() {
        let error = from_sql_i64(-1, "character_count").unwrap_err();
        assert!(matches!(error, BackendError::CorruptData(message)
            if message.contains("character_count")));
    }
}
```

- [ ] **Step 2: Run the backend tests and record the expected failure**

Run:

```powershell
cargo test -p novel-backend
```

Expected: compilation fails because `sqlite_value` is not yet declared and the existing backend passes `u64` directly to `rusqlite`.

- [ ] **Step 3: Implement checked SQLite integer conversion and use it at every revision/count boundary**

Create `crates/novel-backend/src/sqlite_value.rs`:

```rust
use crate::{BackendError, Result};

pub(crate) fn to_sql_i64(value: u64, field: &'static str) -> Result<i64> {
    i64::try_from(value).map_err(|_| {
        BackendError::CorruptData(format!("{field} exceeds SQLite INTEGER range"))
    })
}

pub(crate) fn from_sql_i64(value: i64, field: &'static str) -> Result<u64> {
    u64::try_from(value).map_err(|_| {
        BackendError::CorruptData(format!("{field} must not be negative"))
    })
}
```

Declare it in `lib.rs`:

```rust
mod sqlite_value;
```

In `backend.rs`, read SQLite integer columns as `i64`, convert them with
`from_sql_i64`, and convert all revision/count parameters with `to_sql_i64`
before constructing `params!`. Keep IDs as strings and timestamps/positions as
`i64`.

Also restore the Chinese test strings in `writing_flow.rs` as valid UTF-8:

```rust
let project = backend.initialize_project("长夜书").expect("initialize project");
let saved = backend.save_chapter(SaveChapter {
    chapter_id: chapter.id.clone(),
    expected_revision: 0,
    content: "雨落在长街上。\n林澈推开门。".into(),
    source: SaveSource::User,
}).expect("save draft");
assert_eq!(saved.content, "雨落在长街上。\n林澈推开门。");
```

- [ ] **Step 4: Verify the recovered baseline**

Run:

```powershell
cargo fmt --all --check
cargo test -p novel-backend
cargo clippy -p novel-backend --all-targets -- -D warnings
```

Expected: all three existing writing-flow tests and the two conversion tests pass with no warnings.

- [ ] **Step 5: Commit the backend baseline**

```powershell
git add Cargo.toml Cargo.lock crates/novel-backend
git commit -m "feat: establish reliable writing backend baseline"
```

---

### Task 2: Separate mutable drafts from immutable checkpoints

**Files:**
- Modify: `crates/novel-backend/src/schema.rs`
- Modify: `crates/novel-backend/src/model.rs`
- Modify: `crates/novel-backend/src/backend.rs`
- Modify: `crates/novel-backend/src/lib.rs`
- Replace: `crates/novel-backend/tests/writing_flow.rs`

**Interfaces:**
- Consumes: `NovelBackend::open_in_memory`, outline CRUD, checked SQLite integer conversion.
- Produces:
  - `save_working_draft(SaveWorkingDraft) -> Chapter`
  - `create_checkpoint(CreateCheckpoint) -> ChapterCheckpoint`
  - `list_checkpoints(&ChapterId) -> Vec<ChapterCheckpointSummary>`
  - `checkpoint(&CheckpointId) -> ChapterCheckpoint`
  - `restore_checkpoint(RestoreCheckpoint) -> Chapter`

- [ ] **Step 1: Replace revision tests with failing draft/checkpoint behavior tests**

Use these cases in `crates/novel-backend/tests/writing_flow.rs`:

```rust
#[test]
fn autosave_updates_one_working_draft_without_creating_history() {
    let (backend, chapter) = chapter_fixture();
    let saved = backend.save_working_draft(SaveWorkingDraft {
        chapter_id: chapter.id.clone(),
        expected_edit_revision: 0,
        content: "第一份草稿".into(),
    }).unwrap();

    assert_eq!(saved.edit_revision, 1);
    assert_eq!(saved.content, "第一份草稿");
    assert!(backend.list_checkpoints(&chapter.id).unwrap().is_empty());
}

#[test]
fn stale_autosave_never_overwrites_newer_text() {
    let (backend, chapter) = chapter_fixture();
    backend.save_working_draft(SaveWorkingDraft {
        chapter_id: chapter.id.clone(),
        expected_edit_revision: 0,
        content: "新内容".into(),
    }).unwrap();

    let error = backend.save_working_draft(SaveWorkingDraft {
        chapter_id: chapter.id.clone(),
        expected_edit_revision: 0,
        content: "旧窗口内容".into(),
    }).unwrap_err();

    assert!(matches!(error, BackendError::RevisionConflict {
        expected: 0, current: 1
    }));
    assert_eq!(backend.chapter(&chapter.id).unwrap().content, "新内容");
}

#[test]
fn unchanged_draft_reuses_latest_checkpoint() {
    let (backend, chapter) = saved_chapter_fixture("不会重复");
    let first = backend.create_checkpoint(CreateCheckpoint {
        chapter_id: chapter.id.clone(),
        expected_edit_revision: 1,
        source: CheckpointSource::Manual,
    }).unwrap();
    let second = backend.create_checkpoint(CreateCheckpoint {
        chapter_id: chapter.id,
        expected_edit_revision: 1,
        source: CheckpointSource::Periodic,
    }).unwrap();

    assert_eq!(second.id, first.id);
}

#[test]
fn restore_copies_old_text_and_appends_an_audit_checkpoint() {
    let (backend, chapter) = saved_chapter_fixture("旧稿");
    let old = backend.create_checkpoint(CreateCheckpoint {
        chapter_id: chapter.id.clone(),
        expected_edit_revision: 1,
        source: CheckpointSource::Manual,
    }).unwrap();
    backend.save_working_draft(SaveWorkingDraft {
        chapter_id: chapter.id.clone(),
        expected_edit_revision: 1,
        content: "新稿".into(),
    }).unwrap();

    let restored = backend.restore_checkpoint(RestoreCheckpoint {
        chapter_id: chapter.id.clone(),
        checkpoint_id: old.id.clone(),
        expected_edit_revision: 2,
    }).unwrap();

    assert_eq!(restored.content, "旧稿");
    assert_eq!(restored.edit_revision, 3);
    let history = backend.list_checkpoints(&chapter.id).unwrap();
    assert_eq!(history[0].source, CheckpointSource::Restore);
    assert_eq!(history[0].restored_from_checkpoint_id, Some(old.id));
}
```

- [ ] **Step 2: Verify the new behavior is absent**

Run:

```powershell
cargo test -p novel-backend --test writing_flow
```

Expected: compilation fails on the new draft/checkpoint input types and methods.

- [ ] **Step 3: Implement the schema and domain API**

Replace `chapter_revisions` with:

```sql
CREATE TABLE chapter_drafts (
    chapter_id TEXT PRIMARY KEY REFERENCES chapters(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    edit_revision INTEGER NOT NULL CHECK(edit_revision >= 0),
    checkpointed_edit_revision INTEGER,
    updated_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE chapter_checkpoints (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK(source IN (
        'manual', 'periodic', 'chapter_switch', 'project_close', 'restore'
    )),
    source_edit_revision INTEGER NOT NULL CHECK(source_edit_revision >= 0),
    restored_from_checkpoint_id TEXT REFERENCES chapter_checkpoints(id),
    content TEXT NOT NULL,
    non_whitespace_char_count INTEGER NOT NULL CHECK(non_whitespace_char_count >= 0),
    created_at_ms INTEGER NOT NULL
) STRICT;

CREATE INDEX chapter_checkpoints_chapter_time
    ON chapter_checkpoints(chapter_id, created_at_ms DESC, id DESC);
```

Define the public models exactly:

```rust
id_type!(CheckpointId);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckpointSource {
    Manual,
    Periodic,
    ChapterSwitch,
    ProjectClose,
    Restore,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWorkingDraft {
    pub chapter_id: ChapterId,
    pub expected_edit_revision: u64,
    pub content: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCheckpoint {
    pub chapter_id: ChapterId,
    pub expected_edit_revision: u64,
    pub source: CheckpointSource,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreCheckpoint {
    pub chapter_id: ChapterId,
    pub checkpoint_id: CheckpointId,
    pub expected_edit_revision: u64,
}
```

Change `Chapter.current_revision` to `Chapter.edit_revision`. On chapter creation,
insert an empty `chapter_drafts` row with `edit_revision = 0` and
`checkpointed_edit_revision = NULL`.

Implement `save_working_draft` with one transaction:

```rust
let current = current_edit_revision(&transaction, &input.chapter_id)?;
if current != input.expected_edit_revision {
    return Err(BackendError::RevisionConflict {
        expected: input.expected_edit_revision,
        current,
    });
}
let next = current.checked_add(1)
    .ok_or_else(|| BackendError::CorruptData("edit_revision overflow".into()))?;
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
```

Implement `create_checkpoint` by checking both revisions. If
`checkpointed_edit_revision == edit_revision`, load and return the latest
checkpoint; otherwise insert the current draft and update
`checkpointed_edit_revision` in the same transaction.

Implement `restore_checkpoint` by loading the checkpoint, verifying the current
edit revision, updating the draft to `current + 1`, and inserting a `restore`
checkpoint that references the restored checkpoint ID in the same transaction.

- [ ] **Step 4: Verify draft and checkpoint behavior**

Run:

```powershell
cargo fmt --all --check
cargo test -p novel-backend
cargo clippy -p novel-backend --all-targets -- -D warnings
```

Expected: conversion, outline, autosave, conflict, checkpoint deduplication, and restore tests all pass.

- [ ] **Step 5: Commit draft/checkpoint persistence**

```powershell
git add crates/novel-backend
git commit -m "feat: add autosaved drafts and immutable checkpoints"
```

---

### Task 3: Add directory-based project creation and opening

**Files:**
- Modify: `Cargo.toml`
- Modify: `crates/novel-backend/Cargo.toml`
- Create: `crates/novel-backend/src/manifest.rs`
- Modify: `crates/novel-backend/src/backend.rs`
- Modify: `crates/novel-backend/src/error.rs`
- Modify: `crates/novel-backend/src/lib.rs`
- Create: `crates/novel-backend/tests/project_lifecycle.rs`

**Interfaces:**
- Consumes: schema initialization and `NovelBackend` project/outline methods.
- Produces:
  - `NovelBackend::create_project(directory, name) -> Result<NovelBackend>`
  - `NovelBackend::open_project(directory) -> Result<NovelBackend>`
  - `NovelBackend::workspace() -> Result<Workspace>`
  - `ProjectManifest { format_version, project_id, name }`

- [ ] **Step 1: Write failing project lifecycle tests**

Create `crates/novel-backend/tests/project_lifecycle.rs`:

```rust
use novel_backend::{BackendError, NovelBackend};
use tempfile::tempdir;

#[test]
fn creates_and_reopens_a_directory_project() {
    let root = tempdir().unwrap();
    let project_dir = root.path().join("长夜书");
    std::fs::create_dir(&project_dir).unwrap();

    let backend = NovelBackend::create_project(&project_dir, "长夜书").unwrap();
    let project_id = backend.project().unwrap().id;
    drop(backend);

    assert!(project_dir.join("super-novel.toml").is_file());
    assert!(project_dir.join(".super-novel/project.db").is_file());
    let reopened = NovelBackend::open_project(&project_dir).unwrap();
    assert_eq!(reopened.project().unwrap().id, project_id);
}

#[test]
fn rejects_a_manifest_database_identity_mismatch() {
    let root = tempdir().unwrap();
    let first = root.path().join("first");
    let second = root.path().join("second");
    std::fs::create_dir(&first).unwrap();
    std::fs::create_dir(&second).unwrap();
    drop(NovelBackend::create_project(&first, "甲").unwrap());
    drop(NovelBackend::create_project(&second, "乙").unwrap());
    std::fs::copy(
        first.join("super-novel.toml"),
        second.join("super-novel.toml"),
    ).unwrap();

    let error = NovelBackend::open_project(&second).unwrap_err();
    assert!(matches!(error, BackendError::InvalidProject(_)));
}

#[test]
fn failed_creation_does_not_leave_a_partial_project() {
    let root = tempdir().unwrap();
    let project_dir = root.path().join("broken");
    std::fs::create_dir(&project_dir).unwrap();
    std::fs::write(project_dir.join("super-novel.toml"), "occupied").unwrap();

    assert!(NovelBackend::create_project(&project_dir, "不会覆盖").is_err());
    assert!(!project_dir.join(".super-novel").exists());
    assert_eq!(
        std::fs::read_to_string(project_dir.join("super-novel.toml")).unwrap(),
        "occupied"
    );
}
```

- [ ] **Step 2: Verify directory lifecycle APIs are absent**

Run:

```powershell
cargo test -p novel-backend --test project_lifecycle
```

Expected: compilation fails because `create_project`, `open_project`, and `InvalidProject` do not exist.

- [ ] **Step 3: Implement manifest validation and atomic creation**

Add `toml = "1.1.3"` to workspace dependencies and the backend crate.

Create `manifest.rs`:

```rust
use serde::{Deserialize, Serialize};

use crate::ProjectId;

pub(crate) const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct ProjectManifest {
    pub format_version: u32,
    pub project_id: ProjectId,
    pub name: String,
}
```

Add the aggregate returned to desktop consumers:

```rust
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub project: Project,
    pub outline: Outline,
    pub last_opened_chapter_id: Option<ChapterId>,
}
```

`NovelBackend::workspace()` loads all three values while holding the connection
mutex once. Export `Workspace` from `lib.rs`.

Add error variants:

```rust
#[error("invalid project: {0}")]
InvalidProject(String),

#[error("project requires schema version {required}, found {found}")]
MigrationRequired { required: u32, found: u32 },

#[error("project path is already in use")]
ProjectLocked,

#[error("file operation failed: {0}")]
Io(#[from] std::io::Error),

#[error("manifest serialization failed: {0}")]
Manifest(#[from] toml::ser::Error),

#[error("manifest parsing failed: {0}")]
ManifestParse(#[from] toml::de::Error),
```

Implement `create_project` with exact sibling temporary targets:

```text
.super-novel.tmp-<uuid>/
super-novel.toml.tmp-<uuid>
```

Reject an existing final manifest or `.super-novel` directory. Initialize and
close the temporary database, serialize the manifest, write the temporary
manifest, rename the internal directory to `.super-novel`, then rename the
manifest last. On failure, remove only the two resolved temporary targets and a
newly renamed `.super-novel` created by this call.

Implement `open_project` to parse the manifest, require format version 1, open
`.super-novel/project.db`, run `PRAGMA quick_check`, compare the manifest project
ID with the database project ID, and reject mismatches.

- [ ] **Step 4: Verify project persistence and safety**

Run:

```powershell
cargo fmt --all --check
cargo test -p novel-backend
cargo clippy -p novel-backend --all-targets -- -D warnings
```

Expected: all backend tests pass, including create/reopen, mismatch rejection, and no partial project.

- [ ] **Step 5: Commit the project lifecycle**

```powershell
git add Cargo.toml Cargo.lock crates/novel-backend
git commit -m "feat: add directory project lifecycle"
```

---

### Task 4: Add the Tauri desktop adapter and typed commands

**Files:**
- Modify: `Cargo.toml`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/error.rs`
- Create: `src-tauri/src/session.rs`
- Create: `src-tauri/src/commands.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/tests/session_commands.rs`

**Interfaces:**
- Consumes: all `NovelBackend` use cases from Tasks 1–3.
- Produces the commands defined by the design:
  `create_project`, `open_project`, `close_project`, `get_workspace`,
  `create_volume`, `create_chapter`, `get_chapter`, `save_working_draft`,
  `create_checkpoint`, `list_checkpoints`, `get_checkpoint`, and
  `restore_checkpoint`.

- [ ] **Step 1: Write failing session and error mapping tests**

Create `src-tauri/tests/session_commands.rs`:

```rust
use novel_backend::BackendError;
use super_novel_desktop::{CommandError, ProjectSession};
use tempfile::tempdir;

#[test]
fn one_session_rejects_opening_a_second_project() {
    let root = tempdir().unwrap();
    let first = root.path().join("first");
    let second = root.path().join("second");
    std::fs::create_dir(&first).unwrap();
    std::fs::create_dir(&second).unwrap();
    let session = ProjectSession::default();

    session.create(&first, "甲").unwrap();
    let error = session.create(&second, "乙").unwrap_err();
    assert_eq!(CommandError::from(error).code, "project_locked");
}

#[test]
fn revision_conflicts_expose_only_structured_revision_details() {
    let error = CommandError::from(BackendError::RevisionConflict {
        expected: 3,
        current: 4,
    });
    assert_eq!(error.code, "revision_conflict");
    assert_eq!(error.details["expectedEditRevision"], 3);
    assert_eq!(error.details["currentEditRevision"], 4);
    assert!(!error.message.contains("SQLite"));
}
```

- [ ] **Step 2: Verify the desktop crate is absent**

Run:

```powershell
cargo test -p super-novel-desktop
```

Expected: Cargo reports that package `super-novel-desktop` does not exist.

- [ ] **Step 3: Scaffold the Tauri crate and implement the adapter**

Add `src-tauri` to workspace members. Use:

```toml
[package]
name = "super-novel-desktop"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true

[lib]
name = "super_novel_desktop"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.11.5", features = [] }

[dependencies]
novel-backend = { path = "../crates/novel-backend" }
serde.workspace = true
serde_json = "1.0.151"
tauri = { version = "2.11.5", features = [] }
tauri-plugin-dialog = "2.7.2"
uuid.workspace = true

[dev-dependencies]
tempfile.workspace = true
```

Define the safe error:

```rust
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
    pub details: serde_json::Value,
    pub correlation_id: String,
}
```

Define `ProjectSession` as:

```rust
#[derive(Clone, Default)]
pub struct ProjectSession {
    backend: Arc<Mutex<Option<NovelBackend>>>,
}
```

`create` and `open` lock only while replacing the session. They reject a second
project with `BackendError::ProjectLocked`. `close` drops the backend after the
frontend has flushed and checkpointed the active chapter.

Each command is `async` and clones the session into
`tauri::async_runtime::spawn_blocking`. Example:

```rust
#[tauri::command]
pub async fn get_workspace(
    session: tauri::State<'_, ProjectSession>,
) -> Result<Workspace, CommandError> {
    let session = session.inner().clone();
    tauri::async_runtime::spawn_blocking(move || session.with_backend(|b| b.workspace()))
        .await
        .map_err(CommandError::from_join)?
        .map_err(CommandError::from)
}
```

Register the dialog plugin, managed session, and all commands in `lib.rs`.
Configure `tauri.conf.json` with product name `Super Novel`, identifier
`com.supernovel.desktop`, one 1280×800 window with minimum 960×640 size, and
`bundle.targets = ["nsis"]`.

- [ ] **Step 4: Verify the desktop adapter**

Run:

```powershell
cargo fmt --all --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

Expected: backend and desktop session tests pass.

- [ ] **Step 5: Commit the Tauri adapter**

```powershell
git add Cargo.toml Cargo.lock src-tauri
git commit -m "feat: add typed Tauri desktop adapter"
```

---

### Task 5: Bootstrap the React frontend and startup flow

**Files:**
- Modify: `.gitignore`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/contracts.ts`
- Create: `src/api.ts`
- Create: `src/components/StartScreen.tsx`
- Create: `src/test/setup.ts`
- Create: `src/components/StartScreen.test.tsx`
- Create: `src/styles.css`

**Interfaces:**
- Consumes: typed Tauri commands from Task 4 and native directory selection through `@tauri-apps/plugin-dialog`.
- Produces: `NovelApi`, `StartScreen`, and `App` startup/workspace routing.

- [ ] **Step 1: Write the failing startup component test**

Create `src/components/StartScreen.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { StartScreen } from "./StartScreen";

test("creates a project after choosing a directory and entering a name", async () => {
  const user = userEvent.setup();
  const api = {
    chooseDirectory: vi.fn().mockResolvedValue("D:\\Novels\\长夜书"),
    createProject: vi.fn().mockResolvedValue({
      project: { id: "p1", name: "长夜书" },
      outline: { volumes: [], ungroupedChapters: [] },
      lastOpenedChapterId: null,
    }),
  };
  const onOpened = vi.fn();
  render(<StartScreen api={api as never} onOpened={onOpened} />);

  await user.type(screen.getByLabelText("项目名称"), "长夜书");
  await user.click(screen.getByRole("button", { name: "选择目录并创建" }));

  expect(api.createProject).toHaveBeenCalledWith("D:\\Novels\\长夜书", "长夜书");
  expect(onOpened).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Verify the frontend toolchain is absent**

Run:

```powershell
npm test -- --run
```

Expected: npm reports that `package.json` does not exist.

- [ ] **Step 3: Add the pinned frontend toolchain and startup UI**

Create `package.json` with:

```json
{
  "name": "super-novel",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest",
    "typecheck": "tsc -b --pretty false",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "2.11.1",
    "@tauri-apps/plugin-dialog": "2.7.2",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@tauri-apps/cli": "2.11.4",
    "@testing-library/jest-dom": "7.0.0",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.4",
    "jsdom": "29.1.1",
    "typescript": "7.0.2",
    "vite": "8.1.5",
    "vitest": "4.1.10"
  }
}
```

Run `npm install` to create the lockfile.

Define the frontend contracts exactly:

```ts
export type Id = string;
export type ChapterStatus = "planning" | "drafting" | "revising" | "final";
export type CheckpointSource =
  | "manual"
  | "periodic"
  | "chapter_switch"
  | "project_close"
  | "restore";

export interface ProjectDto {
  id: Id;
  name: string;
}

export interface ChapterSummaryDto {
  id: Id;
  title: string;
  status: ChapterStatus;
  position: number;
  editRevision: number;
  nonWhitespaceCharCount: number;
  updatedAtMs: number;
}

export interface VolumeDto {
  id: Id;
  title: string;
  position: number;
  chapters: ChapterSummaryDto[];
}

export interface OutlineDto {
  volumes: VolumeDto[];
  ungroupedChapters: ChapterSummaryDto[];
}

export interface WorkspaceDto {
  project: ProjectDto;
  outline: OutlineDto;
  lastOpenedChapterId: Id | null;
}

export interface ChapterDto extends ChapterSummaryDto {
  volumeId: Id | null;
  content: string;
  createdAtMs: number;
}

export interface SavedDraftDto {
  chapterId: Id;
  content: string;
  editRevision: number;
  nonWhitespaceCharCount: number;
  updatedAtMs: number;
}

export interface CheckpointSummaryDto {
  id: Id;
  chapterId: Id;
  source: CheckpointSource;
  sourceEditRevision: number;
  restoredFromCheckpointId: Id | null;
  nonWhitespaceCharCount: number;
  createdAtMs: number;
}

export interface CheckpointDto extends CheckpointSummaryDto {
  content: string;
}

export interface CommandError {
  code: string;
  message: string;
  details: Record<string, unknown>;
  correlationId: string;
}
```

Define `NovelApi` in `api.ts`:

```ts
export interface NovelApi {
  chooseDirectory(): Promise<string | null>;
  createProject(directory: string, name: string): Promise<WorkspaceDto>;
  openProject(directory: string): Promise<WorkspaceDto>;
  closeProject(): Promise<void>;
  getWorkspace(): Promise<WorkspaceDto>;
  createVolume(title: string): Promise<VolumeDto>;
  createChapter(volumeId: string | null, title: string): Promise<ChapterDto>;
  getChapter(chapterId: string): Promise<ChapterDto>;
  saveWorkingDraft(input: {
    chapterId: string;
    expectedEditRevision: number;
    content: string;
  }): Promise<SavedDraftDto>;
  createCheckpoint(input: {
    chapterId: string;
    expectedEditRevision: number;
    source: CheckpointSource;
  }): Promise<CheckpointDto>;
  listCheckpoints(chapterId: string): Promise<CheckpointSummaryDto[]>;
  getCheckpoint(checkpointId: string): Promise<CheckpointDto>;
  restoreCheckpoint(input: {
    chapterId: string;
    checkpointId: string;
    expectedEditRevision: number;
  }): Promise<ChapterDto>;
}
```

The concrete `tauriApi` wraps `invoke` with the exact snake_case command names.
Directory selection wraps:

```ts
const selection = await open({ directory: true, multiple: false });
return typeof selection === "string" ? selection : null;
```

`StartScreen` has two actions: create requires a non-empty name and chosen
directory; open requires only a chosen directory. It reports a safe command
error inline and never displays a stack trace.

`App` calls `getWorkspace` once. `not_found` renders `StartScreen`; a returned
workspace renders a temporary `<main aria-label="写作工作台">` until Task 6.

Add `.superpowers/`, `/node_modules/`, `/dist/`, and `/src-tauri/target/` to
`.gitignore`.

- [ ] **Step 4: Verify startup behavior and production compilation**

Run:

```powershell
npm test -- --run
npm run typecheck
npm run build
```

Expected: startup test passes and Vite emits `dist/` without type errors.

- [ ] **Step 5: Commit the frontend foundation**

```powershell
git add .gitignore package.json package-lock.json index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts src
git commit -m "feat: add React project startup flow"
```

---

### Task 6: Build the three-pane editor and deterministic autosave

**Files:**
- Create: `src/useDraftAutosave.ts`
- Create: `src/useDraftAutosave.test.tsx`
- Create: `src/test/fixtures.ts`
- Create: `src/components/OutlinePane.tsx`
- Create: `src/components/EditorPane.tsx`
- Create: `src/components/Workspace.tsx`
- Create: `src/components/Workspace.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/contracts.ts`
- Modify: `src/api.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: workspace/outline/chapter APIs and `saveWorkingDraft`.
- Produces:
  - `useDraftAutosave({ chapter, save, delayMs: 800 })`
  - `SaveState = "saved" | "dirty" | "saving" | "error" | "conflict"`
  - approved three-pane `Workspace`.

- [ ] **Step 1: Write failing autosave and workspace tests**

In `useDraftAutosave.test.tsx`:

```tsx
test("saves once 800ms after the latest edit", async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockResolvedValue({
    content: "雨夜",
    editRevision: 1,
    nonWhitespaceCharCount: 2,
  });
  const { result } = renderHook(() =>
    useDraftAutosave({
      chapter: chapter({ content: "", editRevision: 0 }),
      save,
      delayMs: 800,
    }),
  );

  act(() => result.current.setContent("雨"));
  await vi.advanceTimersByTimeAsync(400);
  act(() => result.current.setContent("雨夜"));
  await vi.advanceTimersByTimeAsync(799);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledWith({
    chapterId: "c1",
    expectedEditRevision: 0,
    content: "雨夜",
  });
});

test("a late response does not mark newer text as saved", async () => {
  const first = deferred<SavedDraft>();
  const save = vi.fn().mockReturnValueOnce(first.promise);
  const { result } = renderHook(() =>
    useDraftAutosave({ chapter: chapter(), save, delayMs: 0 }),
  );
  act(() => result.current.setContent("第一版"));
  await act(async () => undefined);
  act(() => result.current.setContent("第二版"));
  await act(async () => first.resolve(savedDraft("第一版", 1)));
  expect(result.current.state).toBe("dirty");
});
```

In `Workspace.test.tsx`, assert that selecting a chapter loads it, renders its
text, and labels the save status as `已保存`.

Create `src/test/fixtures.ts` so later tests use defined, type-consistent data:

```ts
import type {
  ChapterDto,
  CheckpointDto,
  CheckpointSource,
  SavedDraftDto,
  WorkspaceDto,
} from "../contracts";
import type { NovelApi } from "../api";

export function chapter(overrides: Partial<ChapterDto> = {}): ChapterDto {
  return Object.assign({
    id: "c1",
    volumeId: "v1",
    title: "雨夜",
    status: "drafting",
    position: 1024,
    content: "",
    editRevision: 0,
    nonWhitespaceCharCount: 0,
    createdAtMs: 1,
    updatedAtMs: 1,
  }, overrides);
}

export function savedDraft(
  content = "",
  editRevision = 1,
): SavedDraftDto {
  return {
    chapterId: "c1",
    content,
    editRevision,
    nonWhitespaceCharCount: Array.from(content).filter((c) => !/\s/u.test(c)).length,
    updatedAtMs: 2,
  };
}

export function checkpoint(
  id = "cp17",
  source: CheckpointSource = "manual",
): CheckpointDto {
  return {
    id,
    chapterId: "c1",
    source,
    sourceEditRevision: 17,
    restoredFromCheckpointId: null,
    content: "历史正文",
    nonWhitespaceCharCount: 4,
    createdAtMs: 17,
  };
}

export function workspace(): WorkspaceDto {
  const current = chapter();
  return {
    project: { id: "p1", name: "长夜书" },
    outline: {
      volumes: [{
        id: "v1",
        title: "第一卷",
        position: 1024,
        chapters: [current],
      }],
      ungroupedChapters: [],
    },
    lastOpenedChapterId: current.id,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function workspaceApi(overrides: Partial<NovelApi> = {}): NovelApi {
  const current = chapter();
  const cp = checkpoint();
  return Object.assign({
    chooseDirectory: async () => null,
    createProject: async () => workspace(),
    openProject: async () => workspace(),
    closeProject: async () => undefined,
    getWorkspace: async () => workspace(),
    createVolume: async () => workspace().outline.volumes[0],
    createChapter: async () => current,
    getChapter: async () => current,
    saveWorkingDraft: async () => savedDraft(),
    createCheckpoint: async () => cp,
    listCheckpoints: async () => [cp],
    getCheckpoint: async () => cp,
    restoreCheckpoint: async () => current,
  }, overrides);
}
```

- [ ] **Step 2: Verify autosave behavior is absent**

Run:

```powershell
npm test -- --run src/useDraftAutosave.test.tsx src/components/Workspace.test.tsx
```

Expected: tests fail because the hook and workspace do not exist.

- [ ] **Step 3: Implement the single-flight autosave state machine and workbench**

The hook owns:

```ts
type DraftSnapshot = {
  content: string;
  editRevision: number;
};

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
```

On edit, increment a local generation counter and schedule 800ms. A save captures
the generation, content, and expected revision. Only one promise may be active.
When it resolves:

- update `editRevision` from the response;
- mark `saved` only if the captured generation is still current;
- otherwise mark `dirty` and immediately schedule the newest content;
- map `revision_conflict` to `conflict`, other errors to `error`;
- retain the local text for retry or copy.

`Workspace` loads the selected chapter, flushes the current hook before changing
selection, then creates a `chapter_switch` checkpoint. It updates the outline
summary with the returned revision, word count, and timestamp.

Implement the approved layout:

```text
52px top bar
230px outline | flexible editor | 250px collapsible history
minimum window layout 960px
```

Use a plain `<textarea>` with an accessible chapter label. Display:
`未保存`, `保存中`, `已保存`, `保存失败，可重试`, or `版本冲突`.
Add a visible retry button for `error` and reload/copy guidance for `conflict`.

- [ ] **Step 4: Verify autosave and editor behavior**

Run:

```powershell
npm test -- --run
npm run typecheck
npm run build
```

Expected: startup, autosave timing, stale response, chapter switching, and workspace tests pass.

- [ ] **Step 5: Commit the editor**

```powershell
git add src
git commit -m "feat: add three-pane autosaving editor"
```

---

### Task 7: Add checkpoint scheduling, preview, and restore

**Files:**
- Modify: `src/useDraftAutosave.ts`
- Modify: `src/useDraftAutosave.test.tsx`
- Create: `src/components/HistoryPane.tsx`
- Create: `src/components/HistoryPane.test.tsx`
- Modify: `src/components/Workspace.tsx`
- Modify: `src/components/Workspace.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `flush`, `createCheckpoint`, `listCheckpoints`, `getCheckpoint`, and `restoreCheckpoint`.
- Produces: Ctrl+S/manual, 5-minute periodic, chapter-switch/project-close checkpoints and preview-before-restore UI.

- [ ] **Step 1: Write failing checkpoint and restore tests**

```tsx
test("Ctrl+S flushes the draft before creating a manual checkpoint", async () => {
  const events: string[] = [];
  const api = workspaceApi({
    saveWorkingDraft: async () => {
      events.push("save");
      return savedDraft("正文", 2);
    },
    createCheckpoint: async () => {
      events.push("checkpoint");
      return checkpoint("cp2", "manual");
    },
  });
  render(<Workspace api={api} initialWorkspace={workspace()} />);

  await userEvent.type(await screen.findByRole("textbox"), "正文");
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  await waitFor(() => expect(events).toEqual(["save", "checkpoint"]));
});

test("restore requires preview and explicit confirmation", async () => {
  const api = workspaceApi();
  render(<HistoryPane api={api} chapter={chapter()} onRestored={vi.fn()} />);

  await userEvent.click(await screen.findByRole("button", { name: /版本 17/ }));
  expect(await screen.findByRole("dialog", { name: "预览历史版本" })).toBeVisible();
  expect(api.restoreCheckpoint).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "确认恢复" }));
  expect(api.restoreCheckpoint).toHaveBeenCalledWith({
    chapterId: "c1",
    checkpointId: "cp17",
    expectedEditRevision: 18,
  });
});
```

- [ ] **Step 2: Verify checkpoint UI behavior is absent**

Run:

```powershell
npm test -- --run src/components/HistoryPane.test.tsx src/components/Workspace.test.tsx
```

Expected: tests fail because `HistoryPane` and checkpoint keyboard handling are absent.

- [ ] **Step 3: Implement checkpoint orchestration and history UI**

Register one `keydown` listener while a workspace is mounted. For Ctrl+S:

1. prevent the browser default;
2. call `flush()`;
3. call `createCheckpoint` with the returned current revision and `manual`;
4. prepend or reuse the returned checkpoint in history.

Track `lastCheckpointAt`. While content changes continue, schedule a periodic
check at `lastCheckpointAt + 300_000`; flush first and use source `periodic`.
Reset the timer after a checkpoint response.

Before chapter switch use source `chapter_switch`. Before project close use
source `project_close`; if flush/checkpoint fails, keep the current workspace
open and show the error.

`HistoryPane` loads summaries when opened, retrieves full content only for the
selected checkpoint, shows a read-only preview dialog, and invokes restore only
after confirmation. A successful restore replaces editor content and revision
from the command response, clears error state, and refreshes history.

- [ ] **Step 4: Verify history and full frontend behavior**

Run:

```powershell
npm test -- --run
npm run typecheck
npm run build
```

Expected: manual ordering, periodic scheduling, switch/close checkpoint, preview, cancel, restore, and all earlier tests pass.

- [ ] **Step 5: Commit history behavior**

```powershell
git add src
git commit -m "feat: add checkpoint history and restore"
```

---

### Task 8: Integrate, brand, and generate the Windows installer

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`
- Create: `assets/app-icon.svg`
- Generate: `src-tauri/icons/*`
- Create: `docs/testing/windows-writing-core-smoke-test.md`
- Modify: `README.md` if it exists; otherwise create it.

**Interfaces:**
- Consumes: the complete backend, desktop adapter, and frontend.
- Produces: a verified debug application and unsigned NSIS setup executable.

- [ ] **Step 1: Add a failing end-to-end command smoke test**

Add to `src-tauri/tests/session_commands.rs`:

```rust
#[test]
fn desktop_session_runs_the_complete_writing_flow() {
    let root = tempdir().unwrap();
    let directory = root.path().join("novel");
    std::fs::create_dir(&directory).unwrap();
    let session = ProjectSession::default();
    let workspace = session.create(&directory, "长夜书").unwrap();
    let volume = session.create_volume(CreateVolume { title: "第一卷".into() }).unwrap();
    let chapter = session.create_chapter(CreateChapter {
        volume_id: Some(volume.id),
        title: "雨夜".into(),
    }).unwrap();
    let saved = session.save_working_draft(SaveWorkingDraft {
        chapter_id: chapter.id.clone(),
        expected_edit_revision: 0,
        content: "雨落在长街上。".into(),
    }).unwrap();
    let checkpoint = session.create_checkpoint(CreateCheckpoint {
        chapter_id: chapter.id.clone(),
        expected_edit_revision: saved.edit_revision,
        source: CheckpointSource::Manual,
    }).unwrap();

    assert_eq!(workspace.project.name, "长夜书");
    assert_eq!(session.get_checkpoint(&checkpoint.id).unwrap().content, "雨落在长街上。");
}
```

- [ ] **Step 2: Run the complete verification before branding**

Run:

```powershell
cargo test --workspace
npm test -- --run
```

Expected: the new session smoke test fails until any missing session wrapper is exposed; all previous tests remain green.

- [ ] **Step 3: Complete wrappers, icon generation, permissions, and installer config**

Expose only the missing typed `ProjectSession` wrappers required by the smoke
test.

Create `assets/app-icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#233b33"/>
  <path d="M142 128h172c31 0 56 25 56 56v200H198c-31 0-56-25-56-56V128Z" fill="#f4efe3"/>
  <path d="M198 160h116c13 0 24 11 24 24v168H198c-13 0-24-11-24-24V184c0-13 11-24 24-24Z" fill="#d9e4dc"/>
  <path d="M218 212h78M218 256h78M218 300h54" stroke="#356d57" stroke-width="18" stroke-linecap="round"/>
</svg>
```

Run:

```powershell
npm run tauri icon assets/app-icon.svg
```

Keep capability permissions to `core:default` and `dialog:allow-open`. Set:

```json
{
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "windows": {
      "nsis": {
        "installMode": "currentUser"
      }
    }
  }
}
```

Create the smoke-test document with exact UI steps: create an empty directory,
create a project, add a volume/chapter, type text, wait for “已保存”, press
Ctrl+S, restart the app, preview the checkpoint, change text, restore the old
checkpoint, close the project, and uninstall.

- [ ] **Step 4: Run release-quality verification and build NSIS**

Run:

```powershell
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm test -- --run
npm run typecheck
npm run build
npm run tauri build -- --bundles nsis
```

Expected:

- every Rust and React test passes;
- TypeScript and Vite production builds pass;
- Tauri creates a setup executable under
  `src-tauri/target/release/bundle/nsis/`;
- installing it for the current user launches the application without elevation.

Run the documented UI smoke test against the installed build and record the
date, setup filename, and pass result in the document.

- [ ] **Step 5: Commit the installer-ready application**

```powershell
git add assets src-tauri docs/testing README.md
git commit -m "feat: package the Windows writing application"
```

---

## Final Review

After Task 8:

1. Compare every acceptance criterion in
   `docs/superpowers/specs/2026-07-23-windows-writing-core-design.md` with a
   passing automated test or the recorded Windows smoke test.
2. Run `git status --short` and confirm only intentional files remain.
3. Record the exact NSIS setup path and file size.
4. Do not claim completion if the installed application has not completed the
   create, autosave, checkpoint, restart, preview, restore, and uninstall flow.
