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

    #[error("chapter revision conflict: expected {expected}, current {current}")]
    RevisionConflict { expected: u64, current: u64 },

    #[error("database contains invalid data: {0}")]
    CorruptData(String),

    #[error("database access failed: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("backend lock is poisoned")]
    LockPoisoned,
}
