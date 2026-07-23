use std::{
    path::Path,
    sync::{Arc, Mutex, MutexGuard},
};

use novel_backend::{BackendError, NovelBackend, Result, Workspace};

#[derive(Clone, Default)]
pub struct ProjectSession {
    backend: Arc<Mutex<Option<NovelBackend>>>,
}

impl ProjectSession {
    pub fn create(
        &self,
        directory: impl AsRef<Path>,
        name: impl Into<String>,
    ) -> Result<Workspace> {
        self.ensure_empty()?;
        let backend = NovelBackend::create_project(directory, name)?;
        let workspace = backend.workspace()?;
        self.install(backend)?;
        Ok(workspace)
    }

    pub fn open(&self, directory: impl AsRef<Path>) -> Result<Workspace> {
        self.ensure_empty()?;
        let backend = NovelBackend::open_project(directory)?;
        let workspace = backend.workspace()?;
        self.install(backend)?;
        Ok(workspace)
    }

    pub fn close(&self) -> Result<()> {
        let mut backend = self.lock()?;
        backend.take().ok_or(BackendError::NotInitialized)?;
        Ok(())
    }

    pub(crate) fn with_backend<T>(
        &self,
        operation: impl FnOnce(&NovelBackend) -> Result<T>,
    ) -> Result<T> {
        let backend = self.lock()?;
        let backend = backend.as_ref().ok_or(BackendError::NotInitialized)?;
        operation(backend)
    }

    fn ensure_empty(&self) -> Result<()> {
        if self.lock()?.is_some() {
            return Err(BackendError::ProjectLocked);
        }
        Ok(())
    }

    fn install(&self, backend: NovelBackend) -> Result<()> {
        let mut current = self.lock()?;
        if current.is_some() {
            return Err(BackendError::ProjectLocked);
        }
        *current = Some(backend);
        Ok(())
    }

    fn lock(&self) -> Result<MutexGuard<'_, Option<NovelBackend>>> {
        self.backend.lock().map_err(|_| BackendError::LockPoisoned)
    }
}
