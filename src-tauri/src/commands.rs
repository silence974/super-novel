use std::path::PathBuf;

use novel_backend::{
    Chapter, ChapterCheckpoint, ChapterCheckpointSummary, ChapterId, CheckpointId, CreateChapter,
    CreateCheckpoint, CreateVolume, RestoreCheckpoint, SaveWorkingDraft, VolumeNode, Workspace,
};

use crate::{CommandError, ProjectSession};

async fn run_blocking<T>(
    operation: impl FnOnce() -> novel_backend::Result<T> + Send + 'static,
) -> Result<T, CommandError>
where
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(CommandError::from_join)?
        .map_err(CommandError::from)
}

#[tauri::command]
pub async fn create_project(
    session: tauri::State<'_, ProjectSession>,
    directory: PathBuf,
    name: String,
) -> Result<Workspace, CommandError> {
    let session = session.inner().clone();
    run_blocking(move || session.create(directory, name)).await
}

#[tauri::command]
pub async fn open_project(
    session: tauri::State<'_, ProjectSession>,
    directory: PathBuf,
) -> Result<Workspace, CommandError> {
    let session = session.inner().clone();
    run_blocking(move || session.open(directory)).await
}

#[tauri::command]
pub async fn close_project(session: tauri::State<'_, ProjectSession>) -> Result<(), CommandError> {
    let session = session.inner().clone();
    run_blocking(move || session.close()).await
}

#[tauri::command]
pub async fn set_last_opened_chapter(
    session: tauri::State<'_, ProjectSession>,
    chapter_id: ChapterId,
) -> Result<(), CommandError> {
    let session = session.inner().clone();
    run_blocking(move || {
        session.with_backend(|backend| backend.set_last_opened_chapter(&chapter_id))
    })
    .await
}

#[tauri::command]
pub fn complete_window_close(window: tauri::Window) -> Result<(), CommandError> {
    window.destroy().map_err(CommandError::from_join)
}

#[tauri::command]
pub async fn get_workspace(
    session: tauri::State<'_, ProjectSession>,
) -> Result<Workspace, CommandError> {
    let session = session.inner().clone();
    run_blocking(move || session.with_backend(|backend| backend.workspace())).await
}

#[tauri::command]
pub async fn create_volume(
    session: tauri::State<'_, ProjectSession>,
    input: CreateVolume,
) -> Result<VolumeNode, CommandError> {
    let session = session.inner().clone();
    run_blocking(move || session.with_backend(|backend| backend.create_volume(input))).await
}

#[tauri::command]
pub async fn create_chapter(
    session: tauri::State<'_, ProjectSession>,
    input: CreateChapter,
) -> Result<Chapter, CommandError> {
    let session = session.inner().clone();
    run_blocking(move || session.with_backend(|backend| backend.create_chapter(input))).await
}

#[tauri::command]
pub async fn get_chapter(
    session: tauri::State<'_, ProjectSession>,
    chapter_id: ChapterId,
) -> Result<Chapter, CommandError> {
    let session = session.inner().clone();
    run_blocking(move || session.with_backend(|backend| backend.chapter(&chapter_id))).await
}

#[tauri::command]
pub async fn save_working_draft(
    session: tauri::State<'_, ProjectSession>,
    input: SaveWorkingDraft,
) -> Result<Chapter, CommandError> {
    let session = session.inner().clone();
    run_blocking(move || session.with_backend(|backend| backend.save_working_draft(input))).await
}

#[tauri::command]
pub async fn create_checkpoint(
    session: tauri::State<'_, ProjectSession>,
    input: CreateCheckpoint,
) -> Result<ChapterCheckpoint, CommandError> {
    let session = session.inner().clone();
    run_blocking(move || session.with_backend(|backend| backend.create_checkpoint(input))).await
}

#[tauri::command]
pub async fn list_checkpoints(
    session: tauri::State<'_, ProjectSession>,
    chapter_id: ChapterId,
) -> Result<Vec<ChapterCheckpointSummary>, CommandError> {
    let session = session.inner().clone();
    run_blocking(move || session.with_backend(|backend| backend.list_checkpoints(&chapter_id)))
        .await
}

#[tauri::command]
pub async fn get_checkpoint(
    session: tauri::State<'_, ProjectSession>,
    checkpoint_id: CheckpointId,
) -> Result<ChapterCheckpoint, CommandError> {
    let session = session.inner().clone();
    run_blocking(move || session.with_backend(|backend| backend.checkpoint(&checkpoint_id))).await
}

#[tauri::command]
pub async fn restore_checkpoint(
    session: tauri::State<'_, ProjectSession>,
    input: RestoreCheckpoint,
) -> Result<Chapter, CommandError> {
    let session = session.inner().clone();
    run_blocking(move || session.with_backend(|backend| backend.restore_checkpoint(input))).await
}
