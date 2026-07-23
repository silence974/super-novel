mod commands;
mod error;
mod session;

pub use commands::{
    close_project, complete_window_close, create_chapter, create_checkpoint, create_project,
    create_volume, get_chapter, get_checkpoint, get_workspace, list_checkpoints, open_project,
    restore_checkpoint, save_working_draft, set_last_opened_chapter,
};
pub use error::CommandError;
pub use session::ProjectSession;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Emitter;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ProjectSession::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("desktop-close-requested", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            create_project,
            open_project,
            close_project,
            set_last_opened_chapter,
            complete_window_close,
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
