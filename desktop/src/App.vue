<script setup>
import { reactive, ref, onMounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import TicketCanvas from './components/TicketCanvas.vue';
import CanvasEditor from './components/CanvasEditor.vue';
import { initDb, saveOrder, listOrders, getSetting, setSetting } from './db';
import { buildPrintCss, printTicket } from './print';
import { loadLayout, saveLayout, defaultLayout } from './layout';

// 打印配置（可自定义尺寸，落库持久化）
const cfg = reactive({
  paperW: 50, // 进纸宽 mm
  paperH: 70, // 进纸长 mm
  shopName: '',
  goodsNotice: '',
  autoPrint: true,
  // 打印方式：direct=静默直打( TSPL 指令) / browser=浏览器对话框 / tspl_file=导出指令调试
  printMode: 'direct',
  connKind: 'auto', // auto / usb / tcp
  printerName: '', // USB 队列名
  tcpAddr: '', // 网口 IP[:端口]
});

const printerList = ref([]);

// 拼出后端认识的连接串
function connStr() {
  if (cfg.connKind === 'usb' && cfg.printerName) return 'usb:' + cfg.printerName;
  if (cfg.connKind === 'tcp' && cfg.tcpAddr) return 'tcp:' + cfg.tcpAddr;
  return 'auto';
}

async function refreshPrinters() {
  printerList.value = await invoke('list_printers');
}

async function onConnKindChange() {
  if (cfg.connKind === 'usb' && !printerList.value.length) await refreshPrinters();
}

const running = ref(false);
const ticket = reactive({
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

const history = ref([]);
const keyword = ref('');

// 左侧导航当前页：desk=打单台 / spec=打印规格 / history=历史订单
const activeNav = ref('desk');
// 统一线性图标基元：24 视口、圆角端点，保证整套风格一致
const svg = (d, w = 1.8) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const navItems = [
  // 打单台：托盘式打印机，出纸口带指示点
  { key: 'desk', name: '打单台', ico: svg('<path d="M8 8V4.5A.5.5 0 0 1 8.5 4h7a.5.5 0 0 1 .5.5V8"/><rect x="4" y="8" width="16" height="8" rx="2"/><path d="M8 16v4.5h8V16"/><circle cx="17" cy="11" r=".4" fill="currentColor" stroke="none"/>') },
  // 打印规格：画布拉取器——四角取景框 + 中心可拖拽字段块
  { key: 'spec', name: '打印规格', ico: svg('<path d="M4 8.5V6a2 2 0 0 1 2-2h2.5"/><path d="M15.5 4H18a2 2 0 0 1 2 2v2.5"/><path d="M20 15.5V18a2 2 0 0 1-2 2h-2.5"/><path d="M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><rect x="9" y="9" width="6" height="6" rx="1.2"/>') },
  // 历史订单：回溯时针 + 表盘指针（Lucide history 构图）
  { key: 'history', name: '历史订单', ico: svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>') },
];
// 品牌 Logo：正在吐出锯齿小票的打印机剪影
const logoSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9V5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5V9"/><rect x="3.5" y="9" width="17" height="7" rx="2"/><path d="M7.5 16v4.2l1.8-1.2 1.7 1.2 1.8-1.2 1.7 1.2 1.8-1.2V16"/></svg>`;
const pageMeta = {
  desk: { title: '打单台', desc: '监听抖店新订单，实时预览并自动打印' },
  spec: { title: '打印规格', desc: '可视化拖拽画布，自由排版每个字段的位置与大小' },
  history: { title: '历史订单', desc: '本地留存的所有订单，可检索与重新打印' },
};

// 画布布局（完全接管票据结构与打印渲染）
const layout = ref(defaultLayout(cfg.paperW, cfg.paperH));

async function onLayoutSave(l) {
  layout.value = l;
  await saveLayout(l);
  alert('布局已保存');
}

function loadSettingsToTicket() {
  ticket.shopName = cfg.shopName;
  ticket.goodsNotice = cfg.goodsNotice;
}

async function refreshHistory() {
  history.value = await listOrders(keyword.value.trim());
}

// 统一把「实时订单」和「历史行」归一成票据数据
function fillTicket(src, isHistory = false) {
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

async function doPrint() {
  if (cfg.printMode === 'browser') {
    await nextTick();
    printTicket(buildPrintCss(cfg.paperW, cfg.paperH));
    return;
  }
  // 静默直打 / 导出指令：数据直接给 Rust，不依赖 DOM，毫秒级零弹窗
  try {
    const msg = await invoke('print_label', {
      layoutJson: JSON.stringify(layout.value),
      data: { ...ticket },
      conn: connStr(),
      mode: cfg.printMode === 'tspl_file' ? 'tspl_file' : 'direct',
    });
    if (cfg.printMode === 'tspl_file') alert(String(msg));
  } catch (e) {
    // 直打失败时自动降级为浏览器打印，不丢单
    console.warn('直打失败，降级为浏览器打印:', e);
    await nextTick();
    printTicket(buildPrintCss(cfg.paperW, cfg.paperH));
    alert('静默直打失败，已改用浏览器打印。\n' + e);
  }
}

async function onCaptured(payload) {
  fillTicket(payload);
  const isNew = await saveOrder(payload);
  if (isNew) {
    await refreshHistory();
    if (cfg.autoPrint) setTimeout(doPrint, 200);
  }
}

async function startMonitor() {
  try {
    await invoke('start_monitor');
    running.value = true;
  } catch (e) {
    alert('启动监听失败: ' + e);
  }
}

async function stopMonitor() {
  await invoke('stop_monitor');
  running.value = false;
}

async function saveSettings() {
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
  alert('设置已保存');
}

function simulate() {
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

onMounted(async () => {
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
    alert('监听异常: ' + ev.payload);
  });
});
</script>

<template>
  <div class="app-shell">
    <!-- 左侧导航 -->
    <aside class="sidebar">
      <div class="brand">
        <div class="logo" v-html="logoSvg"></div>
        <div>
          <div class="name">抖店监听打单</div>
          <div class="ver">v0.1.0</div>
        </div>
      </div>
      <div class="nav-group-label">工作台</div>
      <div class="nav">
        <div
          v-for="item in navItems"
          :key="item.key"
          class="nav-item"
          :class="{ active: activeNav === item.key }"
          @click="activeNav = item.key"
        >
          <span class="ico" v-html="item.ico"></span>
          <span>{{ item.name }}</span>
          <span v-if="item.key === 'desk' && running" class="badge live">运行中</span>
          <span v-if="item.key === 'history' && history.length" class="badge">{{ history.length }}</span>
        </div>
      </div>
      <div class="side-foot">本地数据·仅存本机</div>
    </aside>

    <!-- 右侧内容 -->
    <main class="main">
      <div class="page-head">
        <div class="page-head-row">
          <div>
            <h2>{{ pageMeta[activeNav].title }}</h2>
            <div class="desc">{{ pageMeta[activeNav].desc }}</div>
          </div>
          <div class="head-actions">
            <span class="pill" :class="{ on: running }"><span class="dot"></span>{{ running ? '监听运行中' : '未启动' }}</span>
            <button v-if="!running" class="btn btn-primary btn-lg" @click="startMonitor">启动监听</button>
            <button v-else class="btn btn-danger btn-lg" @click="stopMonitor">停止监听</button>
          </div>
        </div>
      </div>

      <!-- 打单台 -->
      <div v-show="activeNav === 'desk'">
        <div class="section">
          <div class="split">
            <div class="col">
              <div class="section-title"><span class="t-left"><span class="bar"></span>当前订单</span></div>
              <div class="section-desc">新订单到达时自动填充；可从历史重新打印</div>
              <div class="field"><label>买家昵称</label><input v-model="ticket.nickname" /></div>
              <div class="field"><label>商品名称</label><input v-model="ticket.goodsName" /></div>
              <div class="row">
                <div class="field"><label>数量</label><input v-model="ticket.goodsQty" /></div>
                <div class="field"><label>实付金额</label><input v-model="ticket.orderPrice" /></div>
              </div>
              <div class="row">
                <div class="field"><label>收货人</label><input v-model="ticket.receiverName" /></div>
                <div class="field"><label>省市区</label><input v-model="ticket.receiverArea" /></div>
              </div>
              <div class="field"><label>订单号</label><input v-model="ticket.orderId" /></div>
              <div class="row" style="justify-content: space-between; align-items: center">
                <button class="btn" @click="simulate">本地模拟出单</button>
                <button class="btn btn-primary" @click="doPrint">🖨 打印该标签</button>
              </div>
            </div>
            <div class="col preview">
              <div class="preview-label">实时预览 · {{ cfg.paperH }}×{{ cfg.paperW }}mm</div>
              <div class="preview-scale" :style="{ width: layout.Wd * 3.78 + 'px', height: layout.Hd * 3.78 + 'px' }">
                <TicketCanvas :layout="layout" :data="ticket" />
              </div>
            </div>
          </div>
          <div class="hint" style="margin-top: 16px">启动监听后会自动拉起 Edge/Chrome 打开抖店后台，首次需在该浏览器里登录一次（登录态本地保存）。</div>
        </div>
      </div>

      <!-- 打印规格（可视化画布） -->
      <div v-show="activeNav === 'spec'">
        <div class="section">
          <div class="section-title"><span class="t-left"><span class="bar"></span>纸张与固定文案</span></div>
          <div class="row">
            <div class="field"><label>进纸宽 (mm)</label><input type="number" v-model.number="cfg.paperW" /></div>
            <div class="field"><label>进纸长 (mm)</label><input type="number" v-model.number="cfg.paperH" /></div>
            <div class="field"><label>店铺名称</label><input type="text" v-model="cfg.shopName" /></div>
          </div>
          <div class="field"><label>默认说明备注</label><textarea v-model="cfg.goodsNotice" rows="2" placeholder="绑定到“说明备注”字段的固定文字"></textarea></div>
          <div class="row" style="align-items: center; justify-content: space-between">
            <label class="switch">
              <input type="checkbox" v-model="cfg.autoPrint" />
              <span class="track"></span>
              <span style="font-size: 13px; color: var(--text-2)">收到新单时自动打单</span>
            </label>
            <button class="btn" @click="saveSettings">保存尺寸/文案</button>
          </div>
        </div>

        <div class="section">
          <div class="section-title"><span class="t-left"><span class="bar"></span>打印方式</span></div>
          <div class="section-desc">专业标签机推荐静默直打：生成 TSPL 指令绕开驱动与对话框，毫秒出单</div>
          <div class="row">
            <div class="field">
              <label>输出方式</label>
              <select v-model="cfg.printMode">
                <option value="direct">静默直打（推荐）</option>
                <option value="browser">浏览器打印对话框</option>
                <option value="tspl_file">导出 TSPL 指令（调试）</option>
              </select>
            </div>
            <div v-if="cfg.printMode === 'direct'" class="field">
              <label>连接方式</label>
              <select v-model="cfg.connKind" @change="onConnKindChange">
                <option value="auto">自动检测</option>
                <option value="usb">USB 打印机队列</option>
                <option value="tcp">网络打印 IP:9100</option>
              </select>
            </div>
            <div v-if="cfg.connKind === 'usb'" class="field">
              <label>打印机</label>
              <select v-model="cfg.printerName">
                <option value="">— 选择队列 —</option>
                <option v-for="p in printerList" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
            <div v-if="cfg.connKind === 'tcp'" class="field">
              <label>打印机 IP（端口默认 9100）</label>
              <input v-model="cfg.tcpAddr" placeholder="192.168.1.100" />
            </div>
          </div>
          <div class="row" style="align-items: center; justify-content: space-between">
            <button class="btn" @click="refreshPrinters">刷新打印机列表</button>
            <button class="btn" @click="doPrint">测试打印一张</button>
          </div>
          <div class="hint">直打失败时会自动降级为浏览器打印，不丢单。macOS 需在系统设置里先添加 N31L（驱动任选，仅取队列名）。</div>
        </div>

        <div class="section">
          <div class="section-title"><span class="t-left"><span class="bar"></span>拖拽排版画布</span></div>
          <div class="section-desc">左侧添加字段/文字/分割线，中间拖动与缩放，右侧调属性，完成后点“保存布局”</div>
          <CanvasEditor v-model="layout" :paper-w="cfg.paperW" :paper-h="cfg.paperH" @save="onLayoutSave" />
        </div>
      </div>

      <!-- 历史订单 -->
      <div v-show="activeNav === 'history'">
        <div class="section">
          <div class="row" style="margin-bottom: 14px">
            <div class="field" style="margin-bottom: 0">
              <input type="text" v-model="keyword" placeholder="搜索昵称 / 订单号 / 商品" @keyup.enter="refreshHistory" />
            </div>
            <button class="btn" @click="refreshHistory">查询</button>
          </div>
          <div class="table-wrap">
            <table v-if="history.length">
              <thead>
                <tr>
                  <th>序号</th><th>昵称</th><th>商品</th><th>金额</th><th>下单时间</th><th>订单号</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in history" :key="row.id">
                  <td>{{ row.seq }}</td>
                  <td>{{ row.nickname }}</td>
                  <td>{{ row.goods_name }}</td>
                  <td class="mono">{{ row.order_price }}</td>
                  <td class="mono">{{ row.order_time }}</td>
                  <td class="mono">{{ row.order_id }}</td>
                  <td><span class="op" @click="fillTicket(row, true); activeNav = 'desk'; doPrint()">重新打印</span></td>
                </tr>
              </tbody>
            </table>
            <div v-else class="empty">暂无订单记录</div>
          </div>
        </div>
      </div>
    </main>

    <!-- 实际打印输出容器：Teleport 到 body，屏幕隐藏，仅打印时由动态 CSS 接管 -->
    <Teleport to="body">
      <div id="print-root">
        <TicketCanvas :layout="layout" :data="ticket" id="printableTicket" />
      </div>
    </Teleport>
  </div>
</template>
