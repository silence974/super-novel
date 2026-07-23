use novel_backend::{
    BackendError, CreateChapter, CreateVolume, NovelBackend, RestoreChapter, SaveChapter,
    SaveSource,
};
use tempfile::{TempDir, tempdir};

#[test]
fn creates_a_persistent_outline_and_draft() {
    let directory = tempdir().expect("temporary directory");
    let database_path = directory.path().join("project.db");

    let backend = NovelBackend::open(&database_path).expect("open backend");
    let project = backend
        .initialize_project("长夜书")
        .expect("initialize project");
    let volume = backend
        .create_volume(CreateVolume {
            title: "第一卷 风起".into(),
        })
        .expect("create volume");
    let chapter = backend
        .create_chapter(CreateChapter {
            volume_id: Some(volume.id.clone()),
            title: "雨夜来客".into(),
        })
        .expect("create chapter");

    let saved = backend
        .save_chapter(SaveChapter {
            chapter_id: chapter.id.clone(),
            expected_revision: 0,
            content: "雨落在长街上。\n林澈推开门。".into(),
            source: SaveSource::User,
        })
        .expect("save draft");
    assert_eq!(saved.current_revision, 1);
    assert_eq!(saved.non_whitespace_char_count, 13);

    drop(backend);
    let reopened = NovelBackend::open(&database_path).expect("reopen backend");
    assert_eq!(reopened.project().expect("load project").id, project.id);

    let outline = reopened.outline().expect("load outline");
    assert_eq!(outline.volumes.len(), 1);
    assert_eq!(outline.volumes[0].chapters.len(), 1);
    assert_eq!(outline.volumes[0].chapters[0].current_revision, 1);
    assert_eq!(
        reopened.chapter(&chapter.id).expect("load chapter").content,
        "雨落在长街上。\n林澈推开门。"
    );
}

#[test]
fn rejects_stale_saves_instead_of_overwriting_newer_text() {
    let (_directory, backend) = initialized_backend();
    let chapter = backend
        .create_chapter(CreateChapter {
            volume_id: None,
            title: "序章".into(),
        })
        .expect("create chapter");

    backend
        .save_chapter(SaveChapter {
            chapter_id: chapter.id.clone(),
            expected_revision: 0,
            content: "第一份保存".into(),
            source: SaveSource::User,
        })
        .expect("first save");

    let error = backend
        .save_chapter(SaveChapter {
            chapter_id: chapter.id,
            expected_revision: 0,
            content: "来自旧窗口的覆盖".into(),
            source: SaveSource::User,
        })
        .expect_err("stale save must fail");
    assert!(matches!(
        error,
        BackendError::RevisionConflict {
            expected: 0,
            current: 1
        }
    ));
}

#[test]
fn restoring_old_text_creates_a_new_auditable_revision() {
    let (_directory, backend) = initialized_backend();
    let chapter = backend
        .create_chapter(CreateChapter {
            volume_id: None,
            title: "序章".into(),
        })
        .expect("create chapter");

    let first = backend
        .save_chapter(SaveChapter {
            chapter_id: chapter.id.clone(),
            expected_revision: 0,
            content: "旧稿".into(),
            source: SaveSource::User,
        })
        .expect("save old draft");
    let second = backend
        .save_chapter(SaveChapter {
            chapter_id: chapter.id.clone(),
            expected_revision: first.current_revision,
            content: "新稿".into(),
            source: SaveSource::User,
        })
        .expect("save new draft");

    let restored = backend
        .restore_chapter(RestoreChapter {
            chapter_id: chapter.id.clone(),
            expected_revision: second.current_revision,
            restore_revision: 1,
        })
        .expect("restore old draft");
    assert_eq!(restored.content, "旧稿");
    assert_eq!(restored.current_revision, 3);

    let revisions = backend
        .chapter_revisions(&chapter.id)
        .expect("load revisions");
    assert_eq!(revisions[0].revision, 3);
    assert_eq!(revisions[0].source, SaveSource::Restore);
    assert_eq!(revisions[0].restored_from_revision, Some(1));
}

fn initialized_backend() -> (TempDir, NovelBackend) {
    let directory = tempdir().expect("temporary directory");
    let backend = NovelBackend::open(directory.path().join("project.db")).expect("open backend");
    backend
        .initialize_project("测试作品")
        .expect("initialize project");
    (directory, backend)
}
