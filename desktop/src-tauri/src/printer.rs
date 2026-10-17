// 标签直打：把画布布局(mm 坐标 JSON)翻译成 TSPL 指令，绕开驱动/对话框静默出单。
// 通道：Windows USB(GDI RAW DATA=) / macOS USB(CUPS libcups) / 网口(TCP 9100)。
use serde::Deserialize;

const DPI: f64 = 8.0; // 203dpi 热敏：1mm = 8 dot

const fn d8() -> f64 { 8.0 }
fn s0() -> String { String::new() }

/// 与前端 layout.js 的 elements 结构一一对应（缺省字段自动取默认值）
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayEl {
    #[serde(rename = "type", default = "s0")]
    pub kind: String, // field / text / divider
    #[serde(default = "s0")]
    pub field: String,
    #[serde(default = "s0")]
    pub text: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default = "d8")]
    pub w: f64,
    #[serde(default = "d8")]
    pub h: f64,
    #[serde(default = "d8")] // 字号 mm，缺省 8mm≈24 点单倍字模
    pub font_size: f64,
    #[serde(default)]
    pub bold: bool,
    #[serde(default = "s0")]
    pub align: String,
}

#[derive(Debug, Deserialize)]
pub struct LabelLayout {
    #[serde(rename = "Wd")] // 内容盒宽 mm（= paperH，横向）
    pub wd: f64,
    #[serde(rename = "Hd")] // 内容盒高 mm（= paperW）
    pub hd: f64,
    #[serde(rename = "paperW")]
    pub paper_w: f64,
    #[serde(rename = "paperH")]
    pub paper_h: f64,
    pub elements: Vec<LayEl>,
}

/// 按字段名从订单数据取值；画布里存的是 JS 字段名，这里做映射
fn value_of(el: &LayEl, data: &serde_json::Value) -> String {
    if el.kind == "text" {
        return el.text.clone();
    }
    if el.kind == "divider" {
        return String::new();
    }
    let pick = |k: &str| data.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    match el.field.as_str() {
        "orderSeq" => {
            let s = pick("orderSeq");
            if !s.is_empty() { s } else { pick("orderId") }
        }
        "nickname" => pick("nickname"),
        "goodsName" => pick("goodsName"),
        "goodsQty" => pick("goodsQty"),
        "orderPrice" => pick("orderPrice"),
        "receiverName" => pick("receiverName"),
        "receiverArea" => pick("receiverArea"),
        "orderTime" => pick("orderTime"),
        "orderId" => pick("orderId"),
        "shopName" => pick("shopName"),
        "goodsNotice" => pick("goodsNotice"),
        _ => pick(&el.field),
    }
}

/// 生成完整 TSPL 指令（中文用 TSS24.BF2 点阵字体，按 GB18030 编码发出）
pub fn build_tspl(layout: &LabelLayout, data: &serde_json::Value) -> Vec<u8> {
    let mut s = String::new();
    // 内容盒 wd×hd 就是预览里“横向正确”的物理打印框（=进纸长×进纸宽），
    // 元素坐标 x∈[0,wd] y∈[0,hd] 均相对它，故 SIZE 必须用 wd,hd 而非 paper_w,paper_h，
    // 否则横向内容被塞进竖向尺寸→方向错、坐标越界（打印机响而不出）。
    s.push_str(&format!("SIZE {} mm,{} mm\r\n", layout.wd, layout.hd));
    s.push_str("GAP 0 mm,0 mm\r\n");
    s.push_str("DIRECTION 1\r\n");
    s.push_str("REFERENCE 0,0\r\n");
    s.push_str("CLS\r\n");

    for el in &layout.elements {
        let x = (el.x * DPI).round() as i32;
        let y = (el.y * DPI).round() as i32;
        if el.kind == "divider" {
            let w = (el.w * DPI).round() as i32;
            s.push_str(&format!("FILL {},{},{},2\r\n", x, y, w));
            continue;
        }
        let val = value_of(el, data);
        if val.trim().is_empty() {
            continue;
        }
        // 24 点基字模 × 整数倍率 ≈ mm 字号（1mm≈8dot，倍率=字号mm*8/24）
        let mut scale = ((el.font_size * DPI / 24.0).round() as i32).clamp(1, 10);
        // 超宽自动降倍率，避免打出内容被裁掉
        let max_dots = (el.w * DPI).round() as i32;
        while scale > 1 && (val.chars().count() as i32) * (24 * scale) > max_dots.max(1) {
            scale -= 1;
        }
        let rot = match el.align.as_str() {
            "center" => 0, // 点阵字体无对齐概念，位置已按画布 x 定位
            _ => 0,
        };
        let escaped = val.replace('\\', "\\\\").replace('"', "\\\"").replace("\r", " ").replace("\n", " ");
        s.push_str(&format!(
            "TEXT {},{},\"TSS24.BF2\",{},{},{},\"{}\"\r\n",
            x, y, rot, scale, scale, escaped
        ));
    }
    s.push_str("PRINT 1,1\r\n");

    encoding_rs::GB18030.encode(&s).0.into_owned()
}

/// 枚举可直接 RAW 发送的打印机名：Windows=已装队列；macOS=CUPS；Linux=lpstat
pub fn list_printers() -> Vec<String> {
    #[cfg(windows)]
    {
        windows_back::enum_printers()
    }
    #[cfg(target_os = "macos")]
    {
        // macOS SDK 自带的 libcups.2 只导出 cupsGetDests 而无配套的释放/发送函数，
        // 故用 lpstat -v 解析（按冒号前的尾部词取队列名，不受系统语言影响）
        lpstat_v()
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        lpstat_v()
    }
}

/// 解析 lpstat -v 的队列名：各行形如 "device for X: uri" 或中文“用于X的设备：uri”，
/// 冒号（半/全角）前的尾部词即为队列名
#[cfg(not(windows))]
fn lpstat_v() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(o) = std::process::Command::new("lpstat").arg("-v").output() {
        for line in String::from_utf8_lossy(&o.stdout).lines() {
            for sep in [": ", "："] {
                if let Some(head) = line.split(sep).next() {
                    if let Some(name) = head.split_whitespace().next_back() {
                        let name = name.trim_start_matches("devicefor").trim_start_matches("用于");
                        if !name.is_empty() {
                            out.push(name.to_string());
                        }
                    }
                    break;
                }
            }
        }
    }
    out
}

/// 直发指令字节到打印机。conn：
/// - "auto"：Windows 走 USB/默认队列 RAW；macOS 走 lp -o raw；否则失败提示
/// - "usb:队列名"：指定系统队列
/// - "tcp:192.168.x.x[:9100]"：网口直连
pub fn send_raw(conn: &str, bytes: &[u8]) -> Result<(), String> {
    if let Some(rest) = conn.strip_prefix("tcp:") {
        return tcp_send(rest, bytes);
    }
    if let Some(q) = conn.strip_prefix("usb:") {
        // Windows 上 lpr 不存在，USB 队列必须走 winspool WritePrinter RAW；macOS/Linux 才用 lpr -o raw
        #[cfg(windows)]
        {
            return windows_back::print_raw(Some(q), bytes);
        }
        #[cfg(not(windows))]
        {
            return queue_send(q, bytes);
        }
    }
    #[cfg(windows)]
    {
        windows_back::print_raw(None, bytes)
    }
    #[cfg(target_os = "macos")]
    {
        // 自动挑 USB 打印机队列：lpstat 列出后取第一个含 HPRT/N31/USB 的，否则取首个
        let printers = list_printers();
        let pick = printers
            .iter()
            .find(|p| {
                let up = p.to_uppercase();
                up.contains("HPRT") || up.contains("N31") || up.contains("TSPL") || up.contains("USB")
            })
            .or(printers.first())
            .ok_or("未找到打印机队列，请先在系统设置里添加 N31L，或改用网口连接")?
            .clone();
        return queue_send(&pick, bytes);
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Err("当前平台不支持自动直打，请指定 usb:队列名 或 tcp:地址".to_string())
    }
}

/// 把字节以 raw 方式交给打印机队列
fn queue_send(queue: &str, bytes: &[u8]) -> Result<(), String> {
    // lpr -o raw 跨 mac/Linux，命令行与退出码不受系统语言影响
    let tmp = std::env::temp_dir().join(format!("doudian_{}.tspl", std::process::id()));
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    let out = std::process::Command::new("lpr")
        .args(["-P", queue, "-o", "raw"])
        .arg(&tmp)
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("调用 lpr 失败: {e}"))?;
    let _ = std::fs::remove_file(&tmp);
    if out.status.success() {
        Ok(())
    } else {
        Err(format!("lpr 打印失败: {}", String::from_utf8_lossy(&out.stderr)))
    }
}

/// TCP 9100 网口直发（无需任何驱动，支持网口版 N31L）
fn tcp_send(addr: &str, bytes: &[u8]) -> Result<(), String> {
    let (host, port) = match addr.rsplit_once(':') {
        Some((h, p)) => (h, p.parse::<u16>().map_err(|_| "端口无效")?),
        None => (addr, 9100u16),
    };
    let ip = host
        .parse::<std::net::Ipv4Addr>()
        .map_err(|_| format!("无法解析地址: {host}"))?;
    let peer = std::net::SocketAddr::from((ip, port));
    use std::io::{Read, Write};
    let mut stream =
        std::net::TcpStream::connect_timeout(&peer, std::time::Duration::from_secs(3))
            .map_err(|e| format!("连接打印机失败 {peer}: {e}"))?;
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_millis(800)));
    stream.write_all(bytes).map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())?;
    // 读一点反馈（TSPL 打印机会回状态），忽略错误：部分机型不回
    let mut buf = [0u8; 64];
    let _ = stream.read(&mut buf);
    Ok(())
}

/// Windows：经系统假脱机 winspool 以 RAW 数据类型直发任意队列（不弹对话框）。
/// 这里不依赖 windows crate 的绑定，直接按 Win32 原始签名声明 FFI，避免绑定风格差异导致编译失败。
#[cfg(windows)]
mod windows_back {
    use std::ffi::c_void;
    use std::ptr;

    type HPrinter = *mut c_void;
    type BOOL = i32;
    type DWORD = u32;
    type LPWSTR = *mut u16;
    type LPCWSTR = *const u16;
    type LPBYTE = *mut u8;
    type LPDWORD = *mut u32;

    #[repr(C)]
    struct DocInfo1W {
        pDocName: LPWSTR,
        pOutputFile: LPWSTR,
        pDatatype: LPWSTR,
    }

    // PRINTER_INFO_2W 字段顺序必须与 Win32 定义严格一致（13 个指针 + 8 个 DWORD）
    #[allow(dead_code)]
    #[repr(C)]
    struct PrinterInfo2W {
        pServerName: LPWSTR,
        pPrinterName: LPWSTR,
        pShareName: LPWSTR,
        pPortName: LPWSTR,
        pDriverName: LPWSTR,
        pComment: LPWSTR,
        pLocation: LPWSTR,
        pDevMode: *mut c_void,
        pSepFile: LPWSTR,
        pPrintProcessor: LPWSTR,
        pDatatype: LPWSTR,
        pParameters: LPWSTR,
        pSecurity: *mut c_void,
        Attributes: DWORD,
        Priority: DWORD,
        DefaultPriority: DWORD,
        StartTime: DWORD,
        UntilTime: DWORD,
        Status: DWORD,
        cJobs: DWORD,
        AveragePPM: DWORD,
    }

    const PRINTER_ENUM_LOCAL: DWORD = 0x0000_0002;
    const PRINTER_ENUM_CONNECTIONS: DWORD = 0x0000_0004;

    #[link(name = "winspool")]
    extern "system" {
        fn EnumPrintersW(
            flags: DWORD,
            name: LPWSTR,
            level: DWORD,
            pprinterenum: LPBYTE,
            cbbuf: DWORD,
            pcbneeded: LPDWORD,
            pcreturnd: LPDWORD,
        ) -> BOOL;
        fn OpenPrinterW(name: LPCWSTR, hprinter: *mut HPrinter, pdefault: *mut c_void) -> BOOL;
        fn StartDocPrinterW(hprinter: HPrinter, level: DWORD, pdocinfo: *const DocInfo1W) -> DWORD;
        fn StartPagePrinter(hprinter: HPrinter) -> BOOL;
        fn WritePrinter(
            hprinter: HPrinter,
            pbuf: *const c_void,
            cbprint: DWORD,
            pcbwritten: LPDWORD,
        ) -> BOOL;
        fn EndPagePrinter(hprinter: HPrinter) -> BOOL;
        fn EndDocPrinter(hprinter: HPrinter) -> BOOL;
        fn ClosePrinter(hprinter: HPrinter) -> BOOL;
    }

    /// &str -> 以 null 结尾的 UTF-16 缓冲
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// 读 null 结尾的 UTF-16 指针为 String
    unsafe fn read_wide(p: LPCWSTR) -> String {
        if p.is_null() {
            return String::new();
        }
        let mut units = Vec::new();
        let mut i = 0isize;
        loop {
            let c = unsafe { *p.offset(i) };
            if c == 0 {
                break;
            }
            units.push(c);
            i += 1;
        }
        String::from_utf16_lossy(&units)
    }

    /// 枚举本机打印机队列名（本地 + 连接）
    pub fn enum_printers() -> Vec<String> {
        let mut out = Vec::new();
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut need: DWORD = 0;
        let mut ret: DWORD = 0;
        unsafe {
            // 第一次传空缓冲获取所需字节数（预期返回 0）
            let _ = EnumPrintersW(flags, ptr::null_mut(), 2, ptr::null_mut(), 0, &mut need, &mut ret);
            if need == 0 {
                return out;
            }
            let mut buf: Vec<u8> = vec![0; need as usize];
            let ok = EnumPrintersW(
                flags,
                ptr::null_mut(),
                2,
                buf.as_mut_ptr(),
                need,
                &mut need,
                &mut ret,
            );
            if ok != 0 && ret > 0 {
                let base = buf.as_ptr() as *const PrinterInfo2W;
                for i in 0..ret as isize {
                    let info = &*base.offset(i);
                    let name = read_wide(info.pPrinterName);
                    if !name.is_empty() {
                        out.push(name);
                    }
                }
            }
        }
        out
    }

    /// RAW 直发到指定（或默认）队列
    pub fn print_raw(name: Option<&str>, bytes: &[u8]) -> Result<(), String> {
        let printer = match name {
            Some(s) => s.to_string(),
            None => enum_printers()
                .into_iter()
                .next()
                .ok_or("未找到任何打印机队列".to_string())?,
        };
        let wname = wide(&printer);
        let wdata = wide("RAW");
        let wdoc = wide("打单标签");
        unsafe {
            let mut hpr: HPrinter = ptr::null_mut();
            if OpenPrinterW(wname.as_ptr(), &mut hpr, ptr::null_mut()) == 0 {
                return Err("OpenPrinter 失败（队列名无效或无权限）".to_string());
            }
            let doc = DocInfo1W {
                pDocName: wdoc.as_ptr() as LPWSTR,
                pOutputFile: ptr::null_mut(),
                pDatatype: wdata.as_ptr() as LPWSTR,
            };
            let job = StartDocPrinterW(hpr, 1, &doc);
            if job == 0 {
                ClosePrinter(hpr);
                return Err("StartDocPrinter 失败（请检查队列是否允许 RAW 数据类型）".to_string());
            }
            if StartPagePrinter(hpr) == 0 {
                EndDocPrinter(hpr);
                ClosePrinter(hpr);
                return Err("StartPage 失败".to_string());
            }
            let mut written: DWORD = 0;
            let wres = WritePrinter(hpr, bytes.as_ptr() as *const c_void, bytes.len() as DWORD, &mut written);
            EndPagePrinter(hpr);
            EndDocPrinter(hpr);
            ClosePrinter(hpr);
            if wres == 0 {
                return Err("WritePrinter 失败".to_string());
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tspl_basic_structure() {
        let layout: LabelLayout = serde_json::from_value(serde_json::json!({
            "Wd": 70.0, "Hd": 50.0, "paperW": 50.0, "paperH": 70.0,
            "elements": [
                { "type": "field", "field": "nickname", "x": 3, "y": 4, "w": 60, "h": 7, "fontSize": 6.4, "bold": true, "align": "left" },
                { "type": "divider", "x": 2, "y": 12, "w": 64 },
                { "type": "text", "text": "感谢下单", "x": 3, "y": 40, "w": 40, "h": 6, "fontSize": 4 }
            ]
        }))
        .unwrap();
        let data = serde_json::json!({ "nickname": "张三", "orderSeq": "第1单" });
        let bytes = build_tspl(&layout, &data);
        let text = encoding_rs::GB18030.decode(&bytes).0.into_owned();
        assert!(text.contains("SIZE 70 mm,50 mm")); // SIZE 取内容盒 wd×hd（横），非 paper_w×paper_h（竖）
        assert!(text.contains("TEXT 24,32,\"TSS24.BF2\",0,2,2,\"张三\"")); // 3mm*8=24, 4mm*8=32, 6.4mm→倍率2
        assert!(text.contains("FILL 16,96,512,2"));
        assert!(text.contains("感谢下单"));
        assert!(text.ends_with("PRINT 1,1\r\n"));
    }

    #[test]
    fn skips_empty_values() {
        let layout: LabelLayout = serde_json::from_value(serde_json::json!({
            "Wd": 70.0, "Hd": 50.0, "paperW": 50.0, "paperH": 70.0,
            "elements": [{ "type": "field", "field": "goodsName", "x": 0, "y": 0, "w": 60, "h": 6, "fontSize": 4 }]
        }))
        .unwrap();
        let bytes = build_tspl(&layout, &serde_json::json!({}));
        let text = encoding_rs::GB18030.decode(&bytes).0.into_owned();
        assert!(!text.contains("TEXT"));
    }
}
