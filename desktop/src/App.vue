<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import TicketCanvas from './components/TicketCanvas.vue';
import LabelView from './components/LabelView.vue';
import { cfg, running, layout, ticket, historyTotal, startMonitor, stopMonitor, initStore } from './store';

const route = useRoute();
// 独立标签预览窗口（label）只渲染裸视图，不初始化主窗口逻辑
const bare = getCurrentWebviewWindow().label === 'label';

// 侧栏折叠：窗口缩到窄尺寸（≤ 断点）自动收起，变宽自动展开；手动按钮仍可在宽窗口下临时收起
const COLLAPSE_BREAKPOINT = 880;
const mq = window.matchMedia(`(max-width: ${COLLAPSE_BREAKPOINT}px)`);
const collapsed = ref(mq.matches);
function onMediaChange(e) { collapsed.value = e.matches; }
function toggleSidebar() {
  collapsed.value = !collapsed.value;
}

onMounted(() => {
  if (bare) return;
  initStore();
  // addEventListener 在部分旧 Webview 只有 addListener，兼容处理
  if (mq.addEventListener) mq.addEventListener('change', onMediaChange);
  else mq.addListener(onMediaChange);
});
onBeforeUnmount(() => {
  if (mq.removeEventListener) mq.removeEventListener('change', onMediaChange);
  else mq.removeListener(onMediaChange);
});

const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const navItems = [
  { key: 'desk', name: '打单台', to: '/desk', ico: svg('<path d="M6 9V4h12v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M8 16h8v4H8z"/>') },
  { key: 'spec', name: '打印规格', to: '/spec', ico: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>') },
  { key: 'history', name: '历史订单', to: '/history', ico: svg('<path d="M4 5h16M4 12h16M4 19h10"/>') },
  { key: 'settings', name: '设置', to: '/settings', ico: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>') },
];

const meta = computed(() => route.meta || {});
const isActive = (key) => route.name === key;

onMounted(initStore);
</script>

<template>
  <LabelView v-if="bare" />
  <div v-else class="app-shell">
    <!-- 左侧导航 -->
    <aside class="sidebar" :class="{ collapsed }">
      <div class="brand">
        <div class="logo">打</div>
        <div>
          <div class="name">抖店监听打单</div>
          <div class="ver">v0.1.0</div>
        </div>
      </div>
      <div class="nav-group-label">工作台</div>
      <nav class="nav">
        <router-link
          v-for="item in navItems"
          :key="item.key"
          :to="item.to"
          class="nav-item"
          :class="{ active: isActive(item.key) }"
          :data-name="item.name"
        >
          <span class="ico" v-html="item.ico"></span>
          <span class="label">{{ item.name }}</span>
          <span v-if="item.key === 'desk' && running" class="badge live">运行中</span>
          <span v-if="item.key === 'history' && historyTotal" class="badge">{{ historyTotal }}</span>
        </router-link>
      </nav>
      <div class="side-bottom">
        <div class="side-foot">本地数据·仅存本机</div>
        <button class="side-toggle" @click="toggleSidebar" :title="collapsed ? '展开侧栏' : '收起侧栏'">
          <span class="tt-ico">«</span>
          <span class="tt-label">收起侧栏</span>
        </button>
      </div>
    </aside>

    <!-- 右侧内容 -->
    <main class="main">
      <div class="page-head">
        <div class="page-head-row">
          <div>
            <h2>{{ meta.title }}</h2>
            <div class="desc">{{ meta.desc }}</div>
          </div>
          <div class="head-actions">
            <span class="pill" :class="{ on: running }"><span class="dot"></span>{{ running ? '监听运行中' : '未启动' }}</span>
            <a-button v-if="!running" type="primary" size="large" @click="startMonitor">启动监听</a-button>
            <a-button v-else status="danger" size="large" @click="stopMonitor">停止监听</a-button>
          </div>
        </div>
      </div>

      <router-view />
    </main>

    <!-- 全局打印输出容器：跨路由常驻，屏幕隐藏，仅打印时由动态 CSS 接管 -->
    <Teleport to="body">
      <div id="print-root">
        <TicketCanvas :layout="layout" :data="ticket" id="printableTicket" />
      </div>
    </Teleport>
  </div>
</template>
