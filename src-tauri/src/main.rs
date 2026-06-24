#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    std::panic::set_hook(Box::new(|info| {
        write_startup_error(&format!("panic: {info}"));
    }));

    if let Err(error) = desktop_reminder_public_board_tauri_lib::run() {
        write_startup_error(&error);
    }
}

fn write_startup_error(message: &str) {
    let path = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|parent| parent.join("startup-error.log")))
        .unwrap_or_else(|| std::path::PathBuf::from("startup-error.log"));

    let _ = std::fs::write(
        path,
        format!(
            "桌面提醒公共栏启动失败\r\n时间: {:?}\r\n错误: {}\r\n",
            std::time::SystemTime::now(),
            message
        ),
    );
}
