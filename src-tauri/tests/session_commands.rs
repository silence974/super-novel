use novel_backend::BackendError;
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
