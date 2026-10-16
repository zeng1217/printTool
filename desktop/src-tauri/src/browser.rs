use std::path::PathBuf;
use std::process::{Child, Command};
use std::time::Duration;

/// 调试端口，CDP 通过它接管浏览器
pub const DEBUG_PORT: u16 = 9222;

/// 抖店后台地址（首次需要商家在此登录，登录态保存在独立 profile）
pub const DOUDIAN_URL: &str = "https://fxg.jinritemai.com/";

/// 在各平台探测可用的 Chromium 内核浏览器路径（Edge 优先，其次 Chrome）
pub fn find_browser() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "macos")]
    candidates.extend([
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge".into(),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".into(),
    ]);

    #[cfg(target_os = "windows")]
    {
        let pf = std::env::var("PROGRAMFILES").unwrap_or_default();
        let pf86 = std::env::var("PROGRAMFILES(X86)").unwrap_or_default();
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        candidates.extend([
            format!(r"{pf}\Microsoft\Edge\Application\msedge.exe").into(),
            format!(r"{pf86}\Microsoft\Edge\Application\msedge.exe").into(),
            format!(r"{local}\Microsoft\Edge\Application\msedge.exe").into(),
            format!(r"{pf}\Google\Chrome\Application\chrome.exe").into(),
            format!(r"{pf86}\Google\Chrome\Application\chrome.exe").into(),
            format!(r"{local}\Google\Chrome\Application\chrome.exe").into(),
        ]);
    }

    #[cfg(target_os = "linux")]
    candidates.extend([
        "/opt/edge/edge".into(),
        "/usr/bin/microsoft-edge".into(),
        "/usr/bin/google-chrome".into(),
        "/usr/bin/chromium".into(),
    ]);

    candidates.into_iter().find(|p| p.exists())
}

/// 独立的浏览器用户数据目录（保存抖店登录态，随程序数据目录走）
pub fn profile_dir(app_data: &PathBuf) -> PathBuf {
    let dir = app_data.join("browser-profile");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// 以远程调试模式启动浏览器。使用独立 profile，避免与用户日常浏览器实例冲突
/// （已有实例会吞掉 --remote-debugging-port，导致 CDP 连不上）。
pub fn launch_debug_browser(profile: &PathBuf) -> Result<Child, String> {
    let browser = find_browser().ok_or_else(|| {
        "未找到 Edge 或 Chrome 浏览器，请先安装其一（Windows 一般自带 Edge）".to_string()
    })?;

    let debug_arg = format!("--remote-debugging-port={}", DEBUG_PORT);
    let user_data = format!("--user-data-dir={}", profile.display());

    let mut cmd = Command::new(&browser);
    cmd.arg(&debug_arg)
        .arg(&user_data)
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg(DOUDIAN_URL);

    // Windows 下隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("启动浏览器失败: {e}"))?;

    // 给浏览器一点启动时间，后续会轮询 /json 直到就绪
    std::thread::sleep(Duration::from_millis(1200));
    Ok(child)
}
