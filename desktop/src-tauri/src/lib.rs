mod browser;
mod cdp;
mod printer;

use std::process::Child;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, State};

/// 监听运行状态：浏览器子进程 + 停止标志 + 运行标志
struct MonitorState {
    child: Mutex<Option<Child>>,
    stop: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
}

impl Default for MonitorState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            stop: Arc::new(AtomicBool::new(false)),
            running: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// 启动监听：拉起调试浏览器 → 连接 CDP → 注入抓单脚本 → 推送订单事件
#[tauri::command]
async fn start_monitor(app: AppHandle, state: State<'_, MonitorState>) -> Result<String, String> {
    if state.running.load(Ordering::Relaxed) {
        return Err("监听已在运行中".to_string());
    }

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let profile = browser::profile_dir(&app_data);

    // 拉起浏览器（独立 profile，保证调试端口可用）
    let child = browser::launch_debug_browser(&profile)?;
    *state.child.lock().unwrap() = Some(child);

    state.stop.store(false, Ordering::Relaxed);
    state.running.store(true, Ordering::Relaxed);

    let app_clone = app.clone();
    let stop = state.stop.clone();
    let running = state.running.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = cdp::run_monitor(app_clone.clone(), stop.clone()).await {
            // 出错时通知前端
            let _ = app_clone.emit("monitor-error", e);
        }
        running.store(false, Ordering::Relaxed);
    });

    Ok("监听已启动".to_string())
}

/// 停止监听：置停止标志并结束浏览器进程
#[tauri::command]
fn stop_monitor(state: State<'_, MonitorState>) -> Result<String, String> {
    state.stop.store(true, Ordering::Relaxed);
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
    }
    state.running.store(false, Ordering::Relaxed);
    Ok("监听已停止".to_string())
}

/// 查询监听是否运行中（前端也可用它判断浏览器/CDP 状态）
#[tauri::command]
fn monitor_status(state: State<'_, MonitorState>) -> bool {
    state.running.load(Ordering::Relaxed)
}

/// 枚举可直打的打印机队列（Windows=系统队列，macOS=CUPS）
#[tauri::command]
fn list_printers() -> Vec<String> {
    printer::list_printers()
}

/// 静默直打：布局 JSON + 订单数据 → TSPL 指令 → 按连接方式直发打印机
#[tauri::command]
fn print_label(
    layout_json: String,
    data: serde_json::Value,
    conn: String,
    mode: String,
) -> Result<String, String> {
    let layout: printer::LabelLayout =
        serde_json::from_str(&layout_json).map_err(|e| format!("布局解析失败: {e}"))?;
    let bytes = printer::build_tspl(&layout, &data);
    match mode.as_str() {
        "direct" => printer::send_raw(&conn, &bytes).map(|_| "已直打到打印机".to_string()),
        "tspl_file" => {
            // 调试用：把指令存文件，可拖进 U 盘模式打印机或对比验证
            let path = std::env::temp_dir().join("doudian_label.tspl");
            std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
            Ok(format!("指令已存: {}", path.display()))
        }
        other => Err(format!("未知打印模式: {other}")),
    }
}

/// 把文本内容写到应用数据目录下的文件（如 orders.csv），供用户用记事本/Excel 直接查看数据
#[tauri::command]
fn write_app_file(app: AppHandle, name: String, content: String) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&name); // name 由前端固定传入（orders.csv），不做外部路径拼接
    std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

/// 用系统默认文件管理器打开应用数据目录（macOS=open / Windows=explorer / Linux=xdg-open）
#[tauri::command]
fn open_app_data_dir(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = dir.display().to_string();
    #[cfg(target_os = "macos")]
    let mut cmd = { let mut c = std::process::Command::new("open"); c.arg(&path); c };
    #[cfg(target_os = "windows")]
    let mut cmd = { let mut c = std::process::Command::new("explorer"); c.arg(&path); c };
    #[cfg(target_os = "linux")]
    let mut cmd = { let mut c = std::process::Command::new("xdg-open"); c.arg(&path); c };
    let _ = cmd.spawn(); // 忽略退出码：explorer 成功时也常返回非零
    Ok(path)
}

/// 把文本写到用户选定的任意路径（配合保存对话框“导出”）
#[tauri::command]
fn write_file_at(path: String, content: String) -> Result<String, String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(MonitorState::default())
        .invoke_handler(tauri::generate_handler![
            start_monitor,
            stop_monitor,
            monitor_status,
            list_printers,
            print_label,
            write_app_file,
            open_app_data_dir,
            write_file_at
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
