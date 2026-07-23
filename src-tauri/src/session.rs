use std::{
    path::Path,
    sync::{Arc, RwLock, RwLockReadGuard, RwLockWriteGuard},
};

use novel_backend::{
    BackendError, Chapter, ChapterCheckpoint, CheckpointId, CreateChapter, CreateCheckpoint,
    CreateVolume, NovelBackend, Result, SaveWorkingDraft, VolumeNode, Workspace,
};

#[derive(Clone, Default)]
pub struct ProjectSession {
    state: Arc<RwLock<SessionState>>,
}

#[derive(Default)]
enum SessionState {
    #[default]
    Empty,
    Opening,
    Active(Arc<NovelBackend>),
}

struct OpeningAdmission {
    state: Arc<RwLock<SessionState>>,
    committed: bool,
}

impl OpeningAdmission {
    fn commit(mut self, backend: Arc<NovelBackend>) -> Result<()> {
        {
            let mut state = self.state.write().map_err(|_| BackendError::LockPoisoned)?;
            debug_assert!(matches!(*state, SessionState::Opening));
            *state = SessionState::Active(backend);
        }
        self.committed = true;
        Ok(())
    }
}

impl Drop for OpeningAdmission {
    fn drop(&mut self) {
        if self.committed {
            return;
        }
        if let Ok(mut state) = self.state.write()
            && matches!(*state, SessionState::Opening)
        {
            *state = SessionState::Empty;
        }
    }
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
            let mut state = self.write()?;
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

    pub fn create_volume(&self, input: CreateVolume) -> Result<VolumeNode> {
        self.with_backend(|backend| backend.create_volume(input))
    }

    pub fn create_chapter(&self, input: CreateChapter) -> Result<Chapter> {
        self.with_backend(|backend| backend.create_chapter(input))
    }

    pub fn save_working_draft(&self, input: SaveWorkingDraft) -> Result<Chapter> {
        self.with_backend(|backend| backend.save_working_draft(input))
    }

    pub fn create_checkpoint(&self, input: CreateCheckpoint) -> Result<ChapterCheckpoint> {
        self.with_backend(|backend| backend.create_checkpoint(input))
    }

    pub fn get_checkpoint(&self, checkpoint_id: &CheckpointId) -> Result<ChapterCheckpoint> {
        self.with_backend(|backend| backend.checkpoint(checkpoint_id))
    }

    pub(crate) fn with_backend<T>(
        &self,
        operation: impl FnOnce(&NovelBackend) -> Result<T>,
    ) -> Result<T> {
        let state = self.read()?;
        let backend = match &*state {
            SessionState::Empty => return Err(BackendError::NotInitialized),
            SessionState::Opening => return Err(BackendError::ProjectLocked),
            SessionState::Active(backend) => backend,
        };
        operation(backend)
    }

    fn activate_with(&self, operation: impl FnOnce() -> Result<NovelBackend>) -> Result<Workspace> {
        let admission = self.reserve_opening()?;
        let backend = operation()?;
        let workspace = backend.workspace()?;
        admission.commit(Arc::new(backend))?;
        Ok(workspace)
    }

    fn reserve_opening(&self) -> Result<OpeningAdmission> {
        {
            let mut state = self.write()?;
            match &*state {
                SessionState::Empty => *state = SessionState::Opening,
                SessionState::Opening | SessionState::Active(_) => {
                    return Err(BackendError::ProjectLocked);
                }
            }
        }
        Ok(OpeningAdmission {
            state: self.state.clone(),
            committed: false,
        })
    }

    fn read(&self) -> Result<RwLockReadGuard<'_, SessionState>> {
        self.state.read().map_err(|_| BackendError::LockPoisoned)
    }

    fn write(&self) -> Result<RwLockWriteGuard<'_, SessionState>> {
        self.state.write().map_err(|_| BackendError::LockPoisoned)
    }
}

#[cfg(test)]
mod tests {
    use std::{
        panic::{AssertUnwindSafe, catch_unwind},
        sync::mpsc,
        time::Duration,
    };

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn close_waits_for_an_in_flight_operation_before_opening_another_project() {
        let root = tempdir().unwrap();
        let first = root.path().join("first");
        let second = root.path().join("second");
        std::fs::create_dir(&first).unwrap();
        std::fs::create_dir(&second).unwrap();
        let session = ProjectSession::default();
        session.create(&first, "甲").unwrap();
        drop(NovelBackend::create_project(&second, "乙").unwrap());

        let worker_session = session.clone();
        let (operation_entered_tx, operation_entered_rx) = mpsc::channel();
        let (release_operation_tx, release_operation_rx) = mpsc::channel();
        let (operation_finished_tx, operation_finished_rx) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            worker_session.with_backend(|backend| {
                operation_entered_tx.send(()).unwrap();
                release_operation_rx.recv().unwrap();
                backend.create_volume(CreateVolume {
                    title: "旧项目中的写入".into(),
                })?;
                operation_finished_tx.send(()).unwrap();
                Ok(())
            })
        });

        operation_entered_rx.recv().unwrap();
        let lifecycle_session = session.clone();
        let (lifecycle_started_tx, lifecycle_started_rx) = mpsc::channel();
        let (lifecycle_finished_tx, lifecycle_finished_rx) = mpsc::channel();
        let lifecycle = std::thread::spawn(move || -> Result<()> {
            lifecycle_started_tx.send(()).unwrap();
            lifecycle_session.close()?;
            let workspace = lifecycle_session.open(&second)?;
            lifecycle_finished_tx.send(workspace.project.name).unwrap();
            Ok(())
        });

        lifecycle_started_rx.recv().unwrap();
        assert!(matches!(
            lifecycle_finished_rx.recv_timeout(Duration::from_millis(100)),
            Err(mpsc::RecvTimeoutError::Timeout)
        ));

        release_operation_tx.send(()).unwrap();
        operation_finished_rx.recv().unwrap();
        assert_eq!(lifecycle_finished_rx.recv().unwrap(), "乙");
        worker.join().unwrap().unwrap();
        lifecycle.join().unwrap().unwrap();
    }

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

    #[test]
    fn panicking_activation_releases_admission_during_unwind() {
        let root = tempdir().unwrap();
        let project = root.path().join("project");
        std::fs::create_dir(&project).unwrap();
        let session = ProjectSession::default();

        let panic = catch_unwind(AssertUnwindSafe(|| {
            session.activate_with(|| panic!("injected activation panic"))
        }));
        assert!(panic.is_err());

        session.create(&project, "甲").unwrap();
    }

    #[test]
    fn failed_backend_operation_releases_the_lifecycle_gate() {
        let root = tempdir().unwrap();
        let project = root.path().join("project");
        std::fs::create_dir(&project).unwrap();
        let session = ProjectSession::default();
        session.create(&project, "甲").unwrap();

        let error: Result<()> =
            session.with_backend(|_| Err(BackendError::Validation("injected failure".into())));
        assert!(matches!(error, Err(BackendError::Validation(_))));

        session.close().unwrap();
        session.open(&project).unwrap();
    }

    #[test]
    fn panicking_backend_operation_releases_the_lifecycle_gate_without_poisoning_it() {
        let root = tempdir().unwrap();
        let project = root.path().join("project");
        std::fs::create_dir(&project).unwrap();
        let session = ProjectSession::default();
        session.create(&project, "甲").unwrap();

        let panic = catch_unwind(AssertUnwindSafe(|| {
            session.with_backend::<()>(|_| panic!("injected backend panic"))
        }));
        assert!(panic.is_err());

        session.close().unwrap();
        session.open(&project).unwrap();
    }
}
