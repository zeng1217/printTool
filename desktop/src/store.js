// 跨页面共享的状态与逻辑（打单台/打印规格/历史订单 三个路由页都从这里读写）
import { reactive, ref, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import Message from '@arco-design/web-vue/es/message';
import { initDb, saveOrder, listOrders, getSetting, setSetting } from './db';
import { buildPrintCss, printTicket } from './print';
import { loadLayout, saveLayout, defaultLayout } from './layout';

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
  history.value = await listOrders(keyword.value.trim());
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
  loadSettingsToTicket();
  layout.value = await loadLayout(cfg.paperW, cfg.paperH);
  await refreshHistory();

  running.value = await invoke('monitor_status');

  await listen('order-captured', (ev) => onCaptured(ev.payload));
  await listen('monitor-error', (ev) => {
    running.value = false;
    Message.error('监听异常: ' + ev.payload);
  });
}
