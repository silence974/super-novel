use novel_backend::{
    BackendError, CheckpointSource, CreateChapter, CreateCheckpoint, CreateVolume, SaveWorkingDraft,
};
use super_novel_desktop_lib::{CommandError, ProjectSession};
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

#[test]
fn unopened_projects_use_the_stable_not_found_error_contract() {
    let error = CommandError::from(BackendError::NotInitialized);

    assert_eq!(error.code, "not_found");
    assert_eq!(error.message, "No project is currently open.");
    assert_eq!(error.details, serde_json::json!({}));
    assert!(!error.message.contains("SQLite"));
}

#[test]
fn adapter_normalizes_validation_integrity_and_internal_errors() {
    let validation = CommandError::from(BackendError::Validation(
        "secret project path D:\\private\\novel".into(),
    ));
    let integrity = CommandError::from(BackendError::CorruptData(
        "SELECT * FROM private_table".into(),
    ));
    let internal = CommandError::from_join("worker exposed D:\\private\\novel");

    assert_eq!(validation.code, "validation_error");
    assert_eq!(integrity.code, "integrity_error");
    assert_eq!(internal.code, "internal_error");
    for error in [validation, integrity, internal] {
        assert!(!error.message.contains("D:\\private"));
        assert!(!error.message.contains("SELECT"));
        assert_eq!(error.details, serde_json::json!({}));
    }
}

#[test]
fn desktop_session_runs_the_complete_writing_flow() {
    let root = tempdir().unwrap();
    let directory = root.path().join("novel");
    std::fs::create_dir(&directory).unwrap();
    let session = ProjectSession::default();

    let workspace = session.create(&directory, "长夜书").unwrap();
    let volume = session
        .create_volume(CreateVolume {
            title: "第一卷".into(),
        })
        .unwrap();
    let chapter = session
        .create_chapter(CreateChapter {
            volume_id: Some(volume.id),
            title: "雨夜".into(),
        })
        .unwrap();
    let saved = session
        .save_working_draft(SaveWorkingDraft {
            chapter_id: chapter.id.clone(),
            expected_edit_revision: 0,
            content: "雨落在长街上。".into(),
        })
        .unwrap();
    let checkpoint = session
        .create_checkpoint(CreateCheckpoint {
            chapter_id: chapter.id.clone(),
            expected_edit_revision: saved.edit_revision,
            source: CheckpointSource::Manual,
        })
        .unwrap();

    assert_eq!(workspace.project.name, "长夜书");
    assert_eq!(
        session.get_checkpoint(&checkpoint.id).unwrap().content,
        "雨落在长街上。"
    );
}

#[test]
fn packaging_embeds_the_frontend_with_strict_current_user_permissions() {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let capability: serde_json::Value =
        serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();

    assert_eq!(config["build"]["frontendDist"], "../dist");
    assert_eq!(config["build"]["beforeBuildCommand"], "npm run build");
    assert_eq!(config["build"]["beforeDevCommand"], "npm run dev");
    assert_eq!(config["build"]["devUrl"], "http://localhost:5173");
    assert_eq!(config["bundle"]["targets"], serde_json::json!(["nsis"]));
    assert_eq!(
        config["bundle"]["windows"]["nsis"]["installMode"],
        "currentUser"
    );
    assert_eq!(
        capability["permissions"],
        serde_json::json!(["core:default", "dialog:allow-open"])
    );
}
