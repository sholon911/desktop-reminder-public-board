mod store;

use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::Mutex,
    thread,
    time::Duration as StdDuration,
};
use store::{BackupInfo, LocalStore, PublicState};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, State, WebviewWindow, WindowEvent,
};

struct AppState {
    store: Mutex<LocalStore>,
}

type CommandResult<T> = Result<T, String>;

#[tauri::command]
fn state_get(state: State<'_, AppState>) -> CommandResult<PublicState> {
    let store = state.store.lock().map_err(lock_error)?;
    Ok(store.public_state())
}

#[tauri::command]
fn state_initialize(app: AppHandle, state: State<'_, AppState>, payload: Value) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.initialize(payload))
}

#[tauri::command]
fn admin_verify(state: State<'_, AppState>, password: String) -> CommandResult<bool> {
    let store = state.store.lock().map_err(lock_error)?;
    Ok(store.verify_admin(&password))
}

#[tauri::command]
fn admin_reset_password(state: State<'_, AppState>, payload: Value) -> CommandResult<bool> {
    let mut store = state.store.lock().map_err(lock_error)?;
    store.reset_admin_password(payload)
}

#[tauri::command]
fn todo_create(app: AppHandle, state: State<'_, AppState>, payload: Value) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.create_todo(payload))
}

#[tauri::command]
fn todo_update(app: AppHandle, state: State<'_, AppState>, id: String, payload: Value) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.update_todo(&id, payload))
}

#[tauri::command]
fn todo_complete(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    actor_user_id: Option<String>,
) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.complete_todo(&id, actor_user_id))
}

#[tauri::command]
fn todo_delete(state: State<'_, AppState>, _id: String, _actor_user_id: Option<String>) -> CommandResult<PublicState> {
    let store = state.store.lock().map_err(lock_error)?;
    store.delete_todo_from_panel()
}

#[tauri::command]
fn todo_purge(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    admin_password: String,
) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.purge_todo(&id, &admin_password))
}

#[tauri::command]
fn notice_create(app: AppHandle, state: State<'_, AppState>, payload: Value) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.create_notice(payload))
}

#[tauri::command]
fn notice_confirm(
    app: AppHandle,
    state: State<'_, AppState>,
    notice_id: String,
    user_id: String,
) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.confirm_notice(&notice_id, &user_id))
}

#[tauri::command]
fn handover_confirm(app: AppHandle, state: State<'_, AppState>, payload: Value) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.confirm_handover(payload))
}

#[tauri::command]
fn settings_update(app: AppHandle, state: State<'_, AppState>, payload: Value) -> CommandResult<PublicState> {
    let next_state = mutate_and_emit(&app, &state, |store| store.update_settings(payload))?;
    apply_window_settings(&app, &next_state)?;
    Ok(next_state)
}

#[tauri::command]
fn user_add(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    admin_password: String,
) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.add_user(&name, &admin_password))
}

#[tauri::command]
fn category_add(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    admin_password: String,
) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.add_category(&name, &admin_password))
}

#[tauri::command]
fn reminder_acknowledge(
    app: AppHandle,
    state: State<'_, AppState>,
    todo_ids: Vec<String>,
    actor_user_id: Option<String>,
) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.acknowledge_reminders(todo_ids, actor_user_id))
}

#[tauri::command]
fn reminder_snooze(
    app: AppHandle,
    state: State<'_, AppState>,
    todo_ids: Vec<String>,
    minutes: i64,
    actor_user_id: Option<String>,
) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.snooze_reminders(todo_ids, minutes, actor_user_id))
}

#[tauri::command]
fn backup_create(state: State<'_, AppState>) -> CommandResult<String> {
    let mut store = state.store.lock().map_err(lock_error)?;
    store.backup("manual")
}

#[tauri::command]
fn backup_list(state: State<'_, AppState>) -> CommandResult<Vec<BackupInfo>> {
    let store = state.store.lock().map_err(lock_error)?;
    store.list_backups()
}

#[tauri::command]
fn backup_restore(
    app: AppHandle,
    state: State<'_, AppState>,
    backup_path: String,
    admin_password: String,
) -> CommandResult<PublicState> {
    mutate_and_emit(&app, &state, |store| store.restore_backup(&backup_path, &admin_password))
}

#[tauri::command]
fn window_set_panel_mode(app: AppHandle, state: State<'_, AppState>, payload: Value) -> CommandResult<PublicState> {
    let next_state = mutate_and_emit(&app, &state, |store| {
        let settings_payload = json!({
            "silent": true,
            "panel": payload
        });
        store.update_settings(settings_payload)
    })?;
    apply_window_settings(&app, &next_state)?;
    Ok(next_state)
}

#[tauri::command]
fn window_start_dragging(window: WebviewWindow) -> CommandResult<()> {
    window.start_dragging().map_err(to_string)
}

#[tauri::command]
fn window_hide_to_tray(app: AppHandle) -> CommandResult<()> {
    hide_main_window(&app)
}

#[tauri::command]
fn window_minimize(app: AppHandle) -> CommandResult<()> {
    let window = main_window(&app)?;
    window.minimize().map_err(to_string)
}

#[tauri::command]
fn window_toggle_maximize(app: AppHandle) -> CommandResult<()> {
    let window = main_window(&app)?;
    if window.is_maximized().map_err(to_string)? {
        window.unmaximize().map_err(to_string)
    } else {
        window.maximize().map_err(to_string)
    }
}

#[tauri::command]
fn sound_system_beep() -> CommandResult<()> {
    Ok(())
}

pub fn run() -> Result<(), String> {
    let mut store = LocalStore::new(resolve_data_dir());
    store.init()?;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            store: Mutex::new(store),
        })
        .setup(|app| {
            configure_window(app)?;
            configure_tray(app)?;
            start_background_tasks(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            state_get,
            state_initialize,
            admin_verify,
            admin_reset_password,
            todo_create,
            todo_update,
            todo_complete,
            todo_delete,
            todo_purge,
            notice_create,
            notice_confirm,
            handover_confirm,
            settings_update,
            user_add,
            category_add,
            reminder_acknowledge,
            reminder_snooze,
            backup_create,
            backup_list,
            backup_restore,
            window_set_panel_mode,
            window_start_dragging,
            window_hide_to_tray,
            window_minimize,
            window_toggle_maximize,
            sound_system_beep
        ])
        .run(tauri::generate_context!())
        .map_err(to_string)
}

fn resolve_data_dir() -> PathBuf {
    if cfg!(debug_assertions) {
        return std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("data");
    }

    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join("data")))
        .unwrap_or_else(|| PathBuf::from("data"))
}

fn configure_window(app: &mut App) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        let app_handle = app.handle().clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = hide_main_window(&app_handle);
            }
        });

        let state = app.state::<AppState>();
        if let Ok(store) = state.store.lock() {
            let _ = window.set_always_on_top(store.state.settings.panel.always_on_top);
        };
    }
    Ok(())
}

fn configure_tray(app: &mut App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "显示", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;
    let icon = app
        .default_window_icon()
        .cloned()
        .expect("missing window icon");

    TrayIconBuilder::new()
        .tooltip("桌面提醒公共栏")
        .icon(icon)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                let _ = show_main_window(app);
            }
            "hide" => {
                let _ = hide_main_window(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = show_main_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

fn start_background_tasks(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(StdDuration::from_secs(15));

        let result = {
            let state = app.state::<AppState>();
            let mut store = match state.store.lock() {
                Ok(store) => store,
                Err(_) => continue,
            };

            let _ = store.cleanup_completed_visibility();
            let _ = maybe_create_scheduled_backup(&mut store);
            let due = store.get_due_reminders();
            if due.is_empty() {
                None
            } else {
                let ids = due.iter().map(|todo| todo.id.clone()).collect::<Vec<_>>();
                let _ = store.mark_reminded(&ids);
                Some((store.public_state(), due))
            }
        };

        if let Some((state, due)) = result {
            let _ = app.emit("state:changed", state);
            let _ = show_main_window(&app);
            let _ = app.emit("reminders:due", due);
        }
    });
}

fn maybe_create_scheduled_backup(store: &mut LocalStore) -> CommandResult<()> {
    let hours = store.state.settings.backup_every_hours.max(1);
    let Some(last) = store.state.settings.last_backup_at.as_deref() else {
        let _ = store.backup("auto");
        return Ok(());
    };

    let Ok(last_time) = chrono::DateTime::parse_from_rfc3339(last) else {
        let _ = store.backup("auto");
        return Ok(());
    };

    if chrono::Utc::now().signed_duration_since(last_time.with_timezone(&chrono::Utc))
        >= chrono::Duration::hours(hours as i64)
    {
        let _ = store.backup("auto");
    }
    Ok(())
}

fn mutate_and_emit<F>(
    app: &AppHandle,
    state: &State<'_, AppState>,
    operation: F,
) -> CommandResult<PublicState>
where
    F: FnOnce(&mut LocalStore) -> CommandResult<PublicState>,
{
    let next_state = {
        let mut store = state.store.lock().map_err(lock_error)?;
        operation(&mut store)?
    };
    app.emit("state:changed", next_state.clone()).map_err(to_string)?;
    Ok(next_state)
}

fn apply_window_settings(app: &AppHandle, state: &PublicState) -> CommandResult<()> {
    let window = main_window(app)?;
    window
        .set_always_on_top(state.state.settings.panel.always_on_top)
        .map_err(to_string)?;
    Ok(())
}

fn show_main_window(app: &AppHandle) -> CommandResult<()> {
    let window = main_window(app)?;
    window.show().map_err(to_string)?;
    window.unminimize().map_err(to_string)?;
    window.set_focus().map_err(to_string)?;
    Ok(())
}

fn hide_main_window(app: &AppHandle) -> CommandResult<()> {
    let window = main_window(app)?;
    window.hide().map_err(to_string)
}

fn main_window(app: &AppHandle) -> CommandResult<WebviewWindow> {
    app.get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())
}

fn lock_error<T>(_: std::sync::PoisonError<T>) -> String {
    "本地数据锁定失败，请重启软件后再试".into()
}

fn to_string<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}
