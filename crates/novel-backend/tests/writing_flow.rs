use std::ops::Deref;

use novel_backend::{
    BackendError, Chapter, CheckpointSource, CreateChapter, CreateCheckpoint, NovelBackend,
    RestoreCheckpoint, SaveWorkingDraft,
};
use tempfile::{TempDir, tempdir};

#[test]
fn autosave_updates_one_working_draft_without_creating_history() {
    let (backend, chapter) = chapter_fixture();
    let saved = backend
        .save_working_draft(SaveWorkingDraft {
            chapter_id: chapter.id.clone(),
            expected_edit_revision: 0,
            content: "第一份草稿".into(),
        })
        .unwrap();

    assert_eq!(saved.edit_revision, 1);
    assert_eq!(saved.content, "第一份草稿");
    assert!(backend.list_checkpoints(&chapter.id).unwrap().is_empty());
}

#[test]
fn stale_autosave_never_overwrites_newer_text() {
    let (backend, chapter) = chapter_fixture();
    backend
        .save_working_draft(SaveWorkingDraft {
            chapter_id: chapter.id.clone(),
            expected_edit_revision: 0,
            content: "新内容".into(),
        })
        .unwrap();

    let error = backend
        .save_working_draft(SaveWorkingDraft {
            chapter_id: chapter.id.clone(),
            expected_edit_revision: 0,
            content: "旧窗口内容".into(),
        })
        .unwrap_err();

    assert!(matches!(
        error,
        BackendError::RevisionConflict {
            expected: 0,
            current: 1
        }
    ));
    assert_eq!(backend.chapter(&chapter.id).unwrap().content, "新内容");
}

#[test]
fn unchanged_draft_reuses_latest_checkpoint() {
    let (backend, chapter) = saved_chapter_fixture("不会重复");
    let first = backend
        .create_checkpoint(CreateCheckpoint {
            chapter_id: chapter.id.clone(),
            expected_edit_revision: 1,
            source: CheckpointSource::Manual,
        })
        .unwrap();
    let second = backend
        .create_checkpoint(CreateCheckpoint {
            chapter_id: chapter.id,
            expected_edit_revision: 1,
            source: CheckpointSource::Periodic,
        })
        .unwrap();

    assert_eq!(second.id, first.id);
}

#[test]
fn restore_copies_old_text_and_appends_an_audit_checkpoint() {
    let (backend, chapter) = saved_chapter_fixture("旧稿");
    let old = backend
        .create_checkpoint(CreateCheckpoint {
            chapter_id: chapter.id.clone(),
            expected_edit_revision: 1,
            source: CheckpointSource::Manual,
        })
        .unwrap();
    backend
        .save_working_draft(SaveWorkingDraft {
            chapter_id: chapter.id.clone(),
            expected_edit_revision: 1,
            content: "新稿".into(),
        })
        .unwrap();

    let restored = backend
        .restore_checkpoint(RestoreCheckpoint {
            chapter_id: chapter.id.clone(),
            checkpoint_id: old.id.clone(),
            expected_edit_revision: 2,
        })
        .unwrap();

    assert_eq!(restored.content, "旧稿");
    assert_eq!(restored.edit_revision, 3);
    let history = backend.list_checkpoints(&chapter.id).unwrap();
    assert_eq!(history[0].source, CheckpointSource::Restore);
    assert_eq!(history[0].restored_from_checkpoint_id, Some(old.id));
}

#[test]
fn reopens_a_file_database_and_reads_the_working_draft() {
    let directory = tempdir().expect("temporary directory");
    let database_path = directory.path().join("project.db");
    let backend = NovelBackend::open(&database_path).expect("open backend");
    backend
        .initialize_project("测试作品")
        .expect("initialize project");
    let chapter = backend
        .create_chapter(CreateChapter {
            volume_id: None,
            title: "序章".into(),
        })
        .expect("create chapter");
    backend
        .save_working_draft(SaveWorkingDraft {
            chapter_id: chapter.id.clone(),
            expected_edit_revision: 0,
            content: "持久草稿".into(),
        })
        .expect("save working draft");

    drop(backend);

    let reopened = NovelBackend::open(&database_path).expect("reopen backend");
    let loaded = reopened.chapter(&chapter.id).expect("load working draft");
    assert_eq!(loaded.content, "持久草稿");
    assert_eq!(loaded.edit_revision, 1);
}

struct TestBackend {
    backend: NovelBackend,
    _directory: TempDir,
}

impl Deref for TestBackend {
    type Target = NovelBackend;

    fn deref(&self) -> &Self::Target {
        &self.backend
    }
}

fn chapter_fixture() -> (TestBackend, Chapter) {
    let directory = tempdir().expect("temporary directory");
    let backend = NovelBackend::open(directory.path().join("project.db")).expect("open backend");
    backend
        .initialize_project("测试作品")
        .expect("initialize project");
    let chapter = backend
        .create_chapter(CreateChapter {
            volume_id: None,
            title: "序章".into(),
        })
        .expect("create chapter");
    (
        TestBackend {
            backend,
            _directory: directory,
        },
        chapter,
    )
}

fn saved_chapter_fixture(content: &str) -> (TestBackend, Chapter) {
    let (backend, chapter) = chapter_fixture();
    let chapter = backend
        .save_working_draft(SaveWorkingDraft {
            chapter_id: chapter.id,
            expected_edit_revision: 0,
            content: content.into(),
        })
        .expect("save working draft");
    (backend, chapter)
}
