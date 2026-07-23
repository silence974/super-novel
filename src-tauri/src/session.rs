use std::{
    path::Path,
    sync::{Arc, Mutex, MutexGuard},
};

use novel_backend::{BackendError, NovelBackend, Result, Workspace};

#[derive(Clone, Default)]
pub struct ProjectSession {
    state: Arc<Mutex<SessionState>>,
}

#[derive(Default)]
enum SessionState {
    #[default]
    Empty,
    Opening,
    Active(Arc<NovelBackend>),
}

impl ProjectSession {
    pub fn create(
        &self,
        directory: impl AsRef<Path>,
        name: impl Into<String>,
    ) -> Result<Workspace> {
        self.activate_with(|| NovelBackend::create_project(directory, name))
    }

    pub fn open(&self, directory: impl AsRef<Path>) -> Result<Workspace> {
        self.activate_with(|| NovelBackend::open_project(directory))
    }

    pub fn close(&self) -> Result<()> {
        let backend = {
            let mut state = self.lock()?;
            match std::mem::take(&mut *state) {
                SessionState::Empty => return Err(BackendError::NotInitialized),
                SessionState::Opening => {
                    *state = SessionState::Opening;
                    return Err(BackendError::ProjectLocked);
                }
                SessionState::Active(backend) => backend,
            }
        };
        drop(backend);
        Ok(())
    }

    pub(crate) fn with_backend<T>(
        &self,
        operation: impl FnOnce(&NovelBackend) -> Result<T>,
    ) -> Result<T> {
        let backend = {
            let state = self.lock()?;
            match &*state {
                SessionState::Empty => return Err(BackendError::NotInitialized),
                SessionState::Opening => return Err(BackendError::ProjectLocked),
                SessionState::Active(backend) => backend.clone(),
            }
        };
        operation(&backend)
    }

    fn activate_with(&self, operation: impl FnOnce() -> Result<NovelBackend>) -> Result<Workspace> {
        {
            let mut state = self.lock()?;
            match &*state {
                SessionState::Empty => *state = SessionState::Opening,
                SessionState::Opening | SessionState::Active(_) => {
                    return Err(BackendError::ProjectLocked);
                }
            }
        }

        let opened = (|| {
            let backend = operation()?;
            let workspace = backend.workspace()?;
            Ok((Arc::new(backend), workspace))
        })();

        let mut state = self.lock()?;
        debug_assert!(matches!(*state, SessionState::Opening));
        match opened {
            Ok((backend, workspace)) => {
                *state = SessionState::Active(backend);
                Ok(workspace)
            }
            Err(error) => {
                *state = SessionState::Empty;
                Err(error)
            }
        }
    }

    fn lock(&self) -> Result<MutexGuard<'_, SessionState>> {
        self.state.lock().map_err(|_| BackendError::LockPoisoned)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn opening_admission_rejects_other_projects_and_close_before_touching_disk() {
        let root = tempdir().unwrap();
        let first = root.path().join("first");
        let second = root.path().join("second");
        std::fs::create_dir(&first).unwrap();
        std::fs::create_dir(&second).unwrap();
        let session = ProjectSession::default();
        let worker_session = session.clone();
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();

        let worker = std::thread::spawn(move || {
            worker_session.activate_with(|| {
                entered_tx.send(()).unwrap();
                release_rx.recv().unwrap();
                NovelBackend::create_project(&first, "甲")
            })
        });

        entered_rx.recv().unwrap();
        assert!(matches!(
            session.open(&second).unwrap_err(),
            BackendError::ProjectLocked
        ));
        assert!(matches!(
            session.create(&second, "乙").unwrap_err(),
            BackendError::ProjectLocked
        ));
        assert!(matches!(
            session.close().unwrap_err(),
            BackendError::ProjectLocked
        ));
        assert!(!second.join("super-novel.toml").exists());
        assert!(!second.join(".super-novel").exists());

        release_tx.send(()).unwrap();
        worker.join().unwrap().unwrap();
    }

    #[test]
    fn failed_open_releases_admission_for_a_later_create() {
        let root = tempdir().unwrap();
        let project = root.path().join("project");
        std::fs::create_dir(&project).unwrap();
        let session = ProjectSession::default();

        session.open(&project).unwrap_err();
        session.create(&project, "甲").unwrap();
    }

    #[test]
    fn failed_create_releases_admission_for_a_later_create() {
        let root = tempdir().unwrap();
        let project = root.path().join("project");
        std::fs::create_dir(&project).unwrap();
        let session = ProjectSession::default();

        session.create(&project, " ").unwrap_err();
        session.create(&project, "甲").unwrap();
    }
}
