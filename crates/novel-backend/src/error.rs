use thiserror::Error;

pub type Result<T> = std::result::Result<T, BackendError>;

#[derive(Debug, Error)]
pub enum BackendError {
    #[error("validation failed: {0}")]
    Validation(String),

    #[error("{resource} not found: {id}")]
    NotFound { resource: &'static str, id: String },

    #[error("project database is already initialized")]
    AlreadyInitialized,

    #[error("project database has not been initialized")]
    NotInitialized,

    #[error("invalid project: {0}")]
    InvalidProject(String),

    #[error("project requires schema version {required}, found {found}")]
    MigrationRequired { required: u32, found: u32 },

    #[error("project path is already in use")]
    ProjectLocked,

    #[error("failed to clean up {target}")]
    CleanupFailed { target: &'static str },

    #[error("chapter revision conflict: expected {expected}, current {current}")]
    RevisionConflict { expected: u64, current: u64 },

    #[error("database contains invalid data: {0}")]
    CorruptData(String),

    #[error("database access failed: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("file operation failed: {0}")]
    Io(#[from] std::io::Error),

    #[error("manifest serialization failed: {0}")]
    Manifest(#[from] toml::ser::Error),

    #[error("manifest parsing failed: {0}")]
    ManifestParse(#[from] toml::de::Error),

    #[error("backend lock is poisoned")]
    LockPoisoned,
}
