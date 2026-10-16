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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .manage(MonitorState::default())
        .invoke_handler(tauri::generate_handler![
            start_monitor,
            stop_monitor,
            monitor_status,
            list_printers,
            print_label
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
