use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

use crate::browser;

/// 注入到抖店页面里的抓单脚本。逻辑直接移植自老版篡改猴的页内注入代码：
/// hook fetch → 盯 searchlist 响应 → 解析订单 → 去重 → 定时补轮询。
/// 唯一区别：回传方式从「CustomEvent + GM_setValue」改为「window.__reportOrder（CDP binding）」。
const HOOK_JS: &str = r#"
(function () {
    if (window.__DP_INSTALLED) return;
    window.__DP_INSTALLED = true;

    var processed = {};
    var counter = 1;
    var lastFetchParams = null;

    function fmtTime(raw) {
        if (!raw) return new Date().toLocaleString();
        var ms = Number(raw) > 100000000000 ? Number(raw) : Number(raw) * 1000;
        var d = new Date(ms);
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
               pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    function handle(item) {
        if (!item) return;
        var oId = String(item.shop_order_id || item.order_id || '');
        if (!oId || processed[oId]) return;
        processed[oId] = true;

        var price = '';
        var rawAmt = item.actual_pay_amount || item.pay_amount || item.order_amount;
        if (rawAmt !== undefined && rawAmt !== null) price = (Number(rawAmt) / 100).toFixed(2);

        var goodsName = '';
        if (Array.isArray(item.sku_order_list) && item.sku_order_list.length > 0) {
            goodsName = item.sku_order_list[0].item_name || item.sku_order_list[0].product_name || '';
        }

        var rInfo = item.receiver_info || {};
        var addr = rInfo.post_addr || {};
        var p = (addr.province && addr.province.name) || '';
        var c = (addr.city && addr.city.name) || '';
        var t = (addr.town && addr.town.name) || '';

        var payload = {
            orderSeq: '第' + (counter++) + '单',
            orderId: oId,
            nickname: item.user_nickname || item.buyer_nick || '买家',
            goodsName: goodsName,
            orderPrice: price,
            orderTime: fmtTime(item.create_time || item.pay_time),
            receiverName: rInfo.post_receiver || item.post_receiver || '',
            receiverArea: (p || c) ? (p + c + t) : '',
            _capturedAt: Date.now()
        };

        if (window.__reportOrder) {
            window.__reportOrder(JSON.stringify(payload));
        }
    }

    function checkAndNotify(data) {
        if (!data || typeof data !== 'object') return;
        if (data.shop_order_id) { handle(data); return; }
        var list = (data.data && (data.data.list || data.data.shop_order_list)) || data.data || data.list || [];
        if (Array.isArray(list)) list.forEach(handle);
    }

    var origFetch = window.fetch;
    window.fetch = async function () {
        var res = await origFetch.apply(this, arguments);
        try {
            var url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url) || '';
            if (url.toLowerCase().indexOf('searchlist') !== -1) {
                lastFetchParams = { url: arguments[0], options: arguments[1] || {} };
                res.clone().json().then(checkAndNotify).catch(function () {});
            }
        } catch (e) {}
        return res;
    };

    // 页面自身没有持续刷新时，主动重放最近一次订单列表请求补轮询
    // 注意：抖音接口带时间戳签名，长时间原样重放可能验签失败，这里仅作补漏兜底
    setInterval(function () {
        if (!lastFetchParams) return;
        origFetch(lastFetchParams.url, lastFetchParams.options)
            .then(function (r) { return r.json(); })
            .then(checkAndNotify)
            .catch(function () {});
    }, 4000);
})();
"#;

/// 轮询 /json/list，找到抖店页面的 WebSocket 调试地址
async fn find_target_ws() -> Result<String, String> {
    let url = format!("http://127.0.0.1:{}/json/list", browser::DEBUG_PORT);
    for _ in 0..20 {
        match reqwest::get(&url).await {
            Ok(resp) => {
                let arr: Value = resp.json().await.map_err(|e| e.to_string())?;
                if let Some(t) = arr.as_array() {
                    for item in t {
                        let u = item["url"].as_str().unwrap_or("");
                        let wss = item["webSocketDebuggerUrl"].as_str().unwrap_or("");
                        if u.contains("jinritemai") && !wss.is_empty() {
                            return Ok(wss.to_string());
                        }
                    }
                }
            }
            Err(_) => {}
        }
        tokio::time::sleep(Duration::from_millis(800)).await;
    }
    Err("未找到已打开的抖店后台标签页，请确认浏览器已启动并停留在抖店页面".to_string())
}

async fn send(ws: &mut WebSocketStream<MaybeTlsStream<TcpStream>>, id: u64, method: &str, params: Value) -> Result<(), String> {
    let msg = json!({ "id": id, "method": method, "params": params });
    ws.send(Message::Text(msg.to_string()))
        .await
        .map_err(|e| e.to_string())
}

/// 监听抖店页面并把捕获到的订单事件推送给前端。stop 置真时退出。
pub async fn run_monitor(app: AppHandle, stop: Arc<AtomicBool>) -> Result<(), String> {
    let wss_url = find_target_ws().await?;
    let (mut ws, _) = connect_async(&wss_url)
        .await
        .map_err(|e| format!("连接 CDP 失败: {e}"))?;

    // 初始化：启用 Runtime/Page、注册回传 binding、注入抓单脚本（新页面 + 当前页面）
    send(&mut ws, 1, "Runtime.enable", json!({})).await?;
    send(&mut ws, 2, "Page.enable", json!({})).await?;
    send(&mut ws, 3, "Runtime.addBinding", json!({ "name": "__reportOrder" })).await?;
    send(&mut ws, 4, "Page.addScriptToEvaluateOnNewDocument", json!({ "source": HOOK_JS })).await?;
    send(
        &mut ws,
        5,
        "Runtime.evaluate",
        json!({ "expression": HOOK_JS }),
    )
    .await?;

    // 读取消息循环；带超时以便及时响应停止信号
    loop {
        if stop.load(Ordering::Relaxed) {
            let _ = ws.close(None).await;
            return Ok(());
        }
        let next = tokio::time::timeout(Duration::from_secs(2), ws.next()).await;
        match next {
            Ok(Some(Ok(Message::Text(text)))) => {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    if v["method"].as_str() == Some("Runtime.bindingCalled")
                        && v["params"]["name"].as_str() == Some("__reportOrder")
                    {
                        if let Some(payload_str) = v["params"]["payload"].as_str() {
                            if let Ok(payload) = serde_json::from_str::<Value>(payload_str) {
                                let _ = app.emit("order-captured", &payload);
                            }
                        }
                    }
                }
            }
            Ok(Some(Err(_))) | Err(_) => {
                // 连接异常或超时后仍停止中，交由外层重连；这里简单退出
                if stop.load(Ordering::Relaxed) {
                    return Ok(());
                }
                continue;
            }
            Ok(None) => return Err("CDP 连接已关闭".to_string()),
            _ => {}
        }
    }
}
