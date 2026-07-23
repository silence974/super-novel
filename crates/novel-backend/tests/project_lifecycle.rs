use novel_backend::{BackendError, CreateChapter, NovelBackend};
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
    )
    .unwrap();

    let error = NovelBackend::open_project(&second).unwrap_err();
    assert!(matches!(error, BackendError::InvalidProject(_)));
}

#[test]
fn rejects_a_database_with_multiple_projects() {
    let root = tempdir().unwrap();
    let project_dir = root.path().join("multiple-projects");
    std::fs::create_dir(&project_dir).unwrap();
    drop(NovelBackend::create_project(&project_dir, "唯一项目").unwrap());

    let connection =
        rusqlite::Connection::open(project_dir.join(".super-novel/project.db")).unwrap();
    connection
        .execute(
            "INSERT INTO projects(id, name, created_at_ms, updated_at_ms, schema_version)
             VALUES ('second-project', '不应存在', 0, 0, 1)",
            [],
        )
        .unwrap();
    drop(connection);

    let error = NovelBackend::open_project(&project_dir).unwrap_err();
    assert!(matches!(
        error,
        BackendError::InvalidProject(_) | BackendError::CorruptData(_)
    ));
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

#[test]
fn workspace_loads_project_outline_and_last_opened_chapter_together() {
    let root = tempdir().unwrap();
    let project_dir = root.path().join("workspace");
    std::fs::create_dir(&project_dir).unwrap();
    let backend = NovelBackend::create_project(&project_dir, "工作区").unwrap();

    let workspace = backend.workspace().unwrap();

    assert_eq!(workspace.project.name, "工作区");
    assert_eq!(workspace.outline.work_id, workspace.project.work_id);
    assert!(workspace.outline.volumes.is_empty());
    assert!(workspace.outline.ungrouped_chapters.is_empty());
    assert_eq!(workspace.last_opened_chapter_id, None);
}

#[test]
fn last_opened_chapter_survives_reopening_the_project() {
    let root = tempdir().unwrap();
    let project_dir = root.path().join("resume-chapter");
    std::fs::create_dir(&project_dir).unwrap();
    let backend = NovelBackend::create_project(&project_dir, "续写").unwrap();
    let chapter = backend
        .create_chapter(CreateChapter {
            volume_id: None,
            title: "第二章".into(),
        })
        .unwrap();

    backend.set_last_opened_chapter(&chapter.id).unwrap();
    drop(backend);

    let reopened = NovelBackend::open_project(&project_dir).unwrap();
    assert_eq!(
        reopened.workspace().unwrap().last_opened_chapter_id,
        Some(chapter.id)
    );
}

#[test]
fn last_opened_chapter_rejects_an_unknown_chapter() {
    let root = tempdir().unwrap();
    let project_dir = root.path().join("unknown-chapter");
    let other_project_dir = root.path().join("other-project");
    std::fs::create_dir(&project_dir).unwrap();
    std::fs::create_dir(&other_project_dir).unwrap();
    let backend = NovelBackend::create_project(&project_dir, "未知章节").unwrap();
    let other_backend = NovelBackend::create_project(&other_project_dir, "其他项目").unwrap();
    let other_chapter = other_backend
        .create_chapter(CreateChapter {
            volume_id: None,
            title: "不属于当前项目".into(),
        })
        .unwrap();

    let error = backend
        .set_last_opened_chapter(&other_chapter.id)
        .unwrap_err();

    assert!(matches!(
        error,
        BackendError::NotFound {
            resource: "chapter",
            ..
        }
    ));
    assert_eq!(backend.workspace().unwrap().last_opened_chapter_id, None);
}

#[test]
fn failed_creation_does_not_replace_an_existing_internal_directory() {
    let root = tempdir().unwrap();
    let project_dir = root.path().join("occupied-internal");
    let internal_dir = project_dir.join(".super-novel");
    std::fs::create_dir_all(&internal_dir).unwrap();
    std::fs::write(internal_dir.join("keep.txt"), "keep").unwrap();

    assert!(NovelBackend::create_project(&project_dir, "不会覆盖").is_err());
    assert!(!project_dir.join("super-novel.toml").exists());
    assert_eq!(
        std::fs::read_to_string(internal_dir.join("keep.txt")).unwrap(),
        "keep"
    );
}
