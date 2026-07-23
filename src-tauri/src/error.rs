use novel_backend::BackendError;
use serde::Serialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
    pub details: Value,
    pub correlation_id: String,
}

impl CommandError {
    pub fn from_join<E>(_error: E) -> Self {
        Self::new(
            "operation_failed",
            "The desktop operation could not be completed.",
            json!({}),
        )
    }

    fn new(code: &'static str, message: impl Into<String>, details: Value) -> Self {
        Self {
            code,
            message: message.into(),
            details,
            correlation_id: Uuid::now_v7().to_string(),
        }
    }
}

impl From<BackendError> for CommandError {
    fn from(error: BackendError) -> Self {
        match error {
            BackendError::Validation(reason) => Self::new(
                "validation",
                "The request contains invalid data.",
                json!({ "reason": reason }),
            ),
            BackendError::NotFound { resource, id } => Self::new(
                "not_found",
                "The requested resource was not found.",
                json!({ "resource": resource, "id": id }),
            ),
            BackendError::AlreadyInitialized => Self::new(
                "already_initialized",
                "The project is already initialized.",
                json!({}),
            ),
            BackendError::NotInitialized => Self::new(
                "not_initialized",
                "No project is currently open.",
                json!({}),
            ),
            BackendError::InvalidProject(_) | BackendError::ManifestParse(_) => Self::new(
                "invalid_project",
                "The selected directory is not a valid Super Novel project.",
                json!({}),
            ),
            BackendError::MigrationRequired { required, found } => Self::new(
                "migration_required",
                "The project must be migrated before it can be opened.",
                json!({ "requiredSchemaVersion": required, "foundSchemaVersion": found }),
            ),
            BackendError::ProjectLocked => Self::new(
                "project_locked",
                "Another project is already open.",
                json!({}),
            ),
            BackendError::CleanupFailed { target } => Self::new(
                "cleanup_failed",
                "Project creation cleanup could not be completed.",
                json!({ "target": target }),
            ),
            BackendError::RevisionConflict { expected, current } => Self::new(
                "revision_conflict",
                "The chapter changed after this edit was loaded.",
                json!({
                    "expectedEditRevision": expected,
                    "currentEditRevision": current
                }),
            ),
            BackendError::CorruptData(_) => Self::new(
                "corrupt_data",
                "The project contains invalid data.",
                json!({}),
            ),
            BackendError::Database(_) => Self::new(
                "database_error",
                "The project database operation failed.",
                json!({}),
            ),
            BackendError::Io(_) => {
                Self::new("file_error", "A project file operation failed.", json!({}))
            }
            BackendError::Manifest(_) => Self::new(
                "manifest_error",
                "The project manifest could not be written.",
                json!({}),
            ),
            BackendError::LockPoisoned => Self::new(
                "backend_unavailable",
                "The project backend is unavailable.",
                json!({}),
            ),
        }
    }
}
