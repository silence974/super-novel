mod commands;
mod error;
mod session;

pub use commands::{
    close_project, create_chapter, create_checkpoint, create_project, create_volume, get_chapter,
    get_checkpoint, get_workspace, list_checkpoints, open_project, restore_checkpoint,
    save_working_draft,
};
pub use error::CommandError;
pub use session::ProjectSession;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ProjectSession::default())
        .invoke_handler(tauri::generate_handler![
            create_project,
            open_project,
            close_project,
            get_workspace,
            create_volume,
            create_chapter,
            get_chapter,
            save_working_draft,
            create_checkpoint,
            list_checkpoints,
            get_checkpoint,
            restore_checkpoint,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Super Novel");
}
