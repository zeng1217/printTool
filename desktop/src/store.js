// 跨页面共享的状态与逻辑（打单台/打印规格/历史订单 三个路由页都从这里读写）
import { reactive, ref, nextTick, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, emitTo } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import Message from '@arco-design/web-vue/es/message';
import { initDb, saveOrder, listOrdersPaged, getSetting, setSetting, exportOrdersCsv, buildOrdersCsv } from './db';
import { save } from '@tauri-apps/plugin-dialog';
import { buildPrintCss, printTicket } from './print';
import { loadLayout, saveLayout, defaultLayout } from './layout';
import { applyTheme } from './theme';

// 打印配置（可自定义尺寸，落库持久化）
export const cfg = reactive({
  paperW: 50, // 进纸宽 mm
  paperH: 70, // 进纸长 mm
  shopName: '',
  goodsNotice: '',
  autoPrint: true,
  // 打印方式：direct=静默直打(TSPL 指令) / browser=浏览器对话框 / tspl_file=导出指令调试
  printMode: 'direct',
  connKind: 'auto', // auto / usb / tcp
  printerName: '',
  tcpAddr: '',
  themeColor: '#3370ff',
});

export const running = ref(false);
export const ticket = reactive({
  orderSeq: '',
  shopName: '',
  nickname: '',
  receiverName: '',
  receiverArea: '',
  goodsName: '',
  goodsNotice: '',
  goodsQty: '1',
  orderPrice: '',
  orderTime: '',
  orderId: '',
});

export const history = ref([]);
export const keyword = ref('');
// 分页与筛选（历史订单）
export const historyPage = ref(1);
export const historyPageSize = ref(20);
export const historyTotal = ref(0);
export const historyTimeRange = ref([]); // [ 'YYYY-MM-DD', 'YYYY-MM-DD' ]
export const printerList = ref([]);

// 画布布局（完全接管票据结构与打印渲染）
export const layout = ref(defaultLayout(cfg.paperW, cfg.paperH));

// 拼出后端认识的连接串
export function connStr() {
  if (cfg.connKind === 'usb' && cfg.printerName) return 'usb:' + cfg.printerName;
  if (cfg.connKind === 'tcp' && cfg.tcpAddr) return 'tcp:' + cfg.tcpAddr;
  return 'auto';
}

export async function refreshPrinters() {
  printerList.value = await invoke('list_printers');
}

export async function onConnKindChange() {
  if (cfg.connKind === 'usb' && !printerList.value.length) await refreshPrinters();
}

export function loadSettingsToTicket() {
  ticket.shopName = cfg.shopName;
  ticket.goodsNotice = cfg.goodsNotice;
}

export async function refreshHistory() {
  const [from, to] = historyTimeRange.value || [];
  const { rows, total } = await listOrdersPaged({
    keyword: keyword.value.trim(),
    page: historyPage.value,
    pageSize: historyPageSize.value,
    timeFrom: from || '',
    timeTo: to || '',
  });
  history.value = rows;
  historyTotal.value = total;
  // 当前页超出范围（如删除/筛选后）回到首页重查
  const maxPage = Math.max(1, Math.ceil(total / historyPageSize.value));
  if (historyPage.value > maxPage) { historyPage.value = maxPage; await refreshHistory(); }
}

// 筛选条件变化（关键字/时间范围/页大小）：回到第 1 页再查
export function searchHistory() {
  historyPage.value = 1;
  return refreshHistory();
}

// 手动导出：弹系统“保存”对话框让用户选存放地址，再写入所选路径
export async function exportCsvManual() {
  try {
    let target = await save({
      title: '导出订单 CSV',
      defaultPath: 'orders.csv',
      filters: [{ name: 'CSV 表格', extensions: ['csv'] }],
    });
    if (!target) return; // 用户取消
    if (!/\.csv$/i.test(target)) target += '.csv'; // 避免无扩展名
    const content = await buildOrdersCsv();
    const p = await invoke('write_file_at', { path: target, content });
    Message.success(`已导出：${p}`);
  } catch (e) {
    Message.error('导出失败：' + e);
  }
}

// 用系统文件管理器打开数据目录
export async function openDataDir() {
  try {
    const p = await invoke('open_app_data_dir');
    Message.success(`数据目录：${p}`);
  } catch (e) {
    Message.error('打开失败：' + e);
  }
}

// 统一把「实时订单」和「历史行」归一成票据数据
export function fillTicket(src, isHistory = false) {
  ticket.orderSeq = isHistory ? src.seq : src.orderSeq || '';
  ticket.shopName = src.shop_name || src.shopName || cfg.shopName;
  ticket.nickname = src.nickname || '';
  ticket.receiverName = src.receiver_name || src.receiverName || '';
  ticket.receiverArea = src.receiver_area || src.receiverArea || '';
  ticket.goodsName = src.goods_name || src.goodsName || '';
  ticket.goodsNotice = cfg.goodsNotice;
  ticket.goodsQty = src.goods_qty || src.goodsQty || '1';
  ticket.orderPrice = src.order_price || src.orderPrice || '';
  ticket.orderTime = src.order_time || src.orderTime || '';
  ticket.orderId = src.order_id || src.orderId || '';
}

export async function doPrint() {
  if (cfg.printMode === 'browser') {
    await nextTick();
    printTicket(buildPrintCss(cfg.paperW, cfg.paperH));
    return;
  }
  try {
    const msg = await invoke('print_label', {
      layoutJson: JSON.stringify(layout.value),
      data: { ...ticket },
      conn: connStr(),
      mode: cfg.printMode === 'tspl_file' ? 'tspl_file' : 'direct',
    });
    if (cfg.printMode === 'tspl_file') Message.info(String(msg));
  } catch (e) {
    // 直打失败自动降级浏览器打印，不丢单
    console.warn('直打失败，降级为浏览器打印:', e);
    await nextTick();
    printTicket(buildPrintCss(cfg.paperW, cfg.paperH));
    Message.warning('静默直打失败，已改用浏览器打印：' + e);
  }
}

export async function onCaptured(payload) {
  fillTicket(payload);
  const isNew = await saveOrder(payload);
  if (isNew) {
    await refreshHistory();
    try { await exportOrdersCsv(); } catch (e) { /* 写文本镜像失败不影响主流程 */ }
    if (cfg.autoPrint) setTimeout(doPrint, 200);
  }
}

export async function startMonitor() {
  try {
    await invoke('start_monitor');
    running.value = true;
  } catch (e) {
    Message.error('启动监听失败: ' + e);
  }
}

export async function stopMonitor() {
  await invoke('stop_monitor');
  running.value = false;
}

export async function saveSettings() {
  await setSetting('paperW', cfg.paperW);
  await setSetting('paperH', cfg.paperH);
  await setSetting('shopName', cfg.shopName);
  await setSetting('goodsNotice', cfg.goodsNotice);
  await setSetting('autoPrint', cfg.autoPrint ? '1' : '0');
  await setSetting('printMode', cfg.printMode);
  await setSetting('connKind', cfg.connKind);
  await setSetting('printerName', cfg.printerName);
  await setSetting('tcpAddr', cfg.tcpAddr);
  await setSetting('themeColor', cfg.themeColor);
  loadSettingsToTicket();
  // 尺寸变化时同步画布内容盒（坐标不变，用户可再调）
  layout.value.Wd = cfg.paperH;
  layout.value.Hd = cfg.paperW;
  layout.value.paperW = cfg.paperW;
  layout.value.paperH = cfg.paperH;
  Message.success('设置已保存');
}

export async function onLayoutSave(l) {
  layout.value = l;
  await saveLayout(l);
  Message.success('布局已保存');
}

// 恢复默认布局模板（丢弃当前排版并立即保存）
export async function resetLayout() {
  layout.value = defaultLayout(cfg.paperW, cfg.paperH);
  await saveLayout(layout.value);
  Message.success('已恢复默认布局');
}

export function simulate() {
  onCaptured({
    orderSeq: '第?单(模拟)',
    orderId: 'SIM' + Date.now(),
    nickname: '测试买家',
    goodsName: '【发饰自选】高颜值发绳',
    orderPrice: '20.00',
    orderTime: new Date().toLocaleString(),
    receiverName: '测*',
    receiverArea: '江苏省无锡市',
  });
}

// 应用启动时初始化：建库 → 读设置 → 载布局 → 起事件监听
export async function initStore() {
  await initDb();
  cfg.paperW = Number(await getSetting('paperW', 50));
  cfg.paperH = Number(await getSetting('paperH', 70));
  cfg.shopName = await getSetting('shopName', '');
  cfg.goodsNotice = await getSetting('goodsNotice', '');
  cfg.autoPrint = (await getSetting('autoPrint', '1')) === '1';
  cfg.printMode = await getSetting('printMode', 'direct');
  cfg.connKind = await getSetting('connKind', 'auto');
  cfg.printerName = await getSetting('printerName', '');
  cfg.tcpAddr = await getSetting('tcpAddr', '');
  cfg.themeColor = await getSetting('themeColor', '#3370ff');
  applyTheme(cfg.themeColor);
  loadSettingsToTicket();
  layout.value = await loadLayout(cfg.paperW, cfg.paperH);
  await refreshHistory();
  // 启动时全量重建可读文本镜像 orders.csv（与 SQLite 保持一致）
  try { await exportOrdersCsv(); } catch (e) { /* 忽略写失败 */ }

  running.value = await invoke('monitor_status');

  await listen('order-captured', (ev) => onCaptured(ev.payload));
  await listen('monitor-error', (ev) => {
    running.value = false;
    Message.error('监听异常: ' + ev.payload);
  });

  // 独立标签预览窗口：初次请求 + 数据变化时推送当前票面（仅主窗口运行）
  await listen('ticket-request', () => forwardToLabel());
  // 独立预览窗口里的“打印”按钮：回传主窗口用当前票面执行打印
  await listen('label-print', () => doPrint());
  watchSyncToLabel();
}

// —— 独立标签预览窗口 ——
// 把当前 ticket + layout 推送到 label 窗口（窗口不存在时 emitTo 会失败，忽略即可）
export function forwardToLabel() {
  const payload = { ticket: { ...ticket }, layout: JSON.parse(JSON.stringify(layout.value)) };
  emitTo('label', 'ticket-sync', payload).catch(() => {});
}

// 打开（或聚焦已存在的）独立标签预览窗口
export async function openLabelWindow() {
  // 注意：getByLabel 是异步的（返回 Promise），必须 await，否则 Promise 恒为真
  const existing = await WebviewWindow.getByLabel('label');
  if (existing) {
    try { await existing.setFocus(); } catch (e) { /* 忽略 */ }
    return;
  }
  const w = new WebviewWindow('label', {
    title: '标签预览',
    width: 510,
    height: 480,
    alwaysOnTop: true,
    resizable: true,
    focus: true,
  });
  w.once('tauri://created', () => setTimeout(forwardToLabel, 400));
  w.once('tauri://error', () => Message.error('打开标签预览窗口失败'));
}

// 切换并持久化主题色
export async function setTheme(hex) {
  cfg.themeColor = hex;
  applyTheme(hex);
  await setSetting('themeColor', hex);
}

// 是否用浏览器预览打印：开=浏览器打印对话框(browser)，关=静默直打(direct)
// 与“打印方式”下拉共用 cfg.printMode；若当前是 tspl_file 则开关显示为“关”
export function setBrowserPrint(on) {
  cfg.printMode = on ? 'browser' : 'direct';
  return setSetting('printMode', cfg.printMode);
}

// 当前 ticket / layout 变化时自动同步到独立窗口（仅主窗口 initStore 时注册）
export function watchSyncToLabel() {
  let t = null;
  const fire = () => { clearTimeout(t); t = setTimeout(forwardToLabel, 120); };
  watch(ticket, fire, { deep: true });
  watch(layout, fire, { deep: true });
}
