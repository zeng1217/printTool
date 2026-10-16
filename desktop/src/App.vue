<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import TicketCanvas from './components/TicketCanvas.vue';
import { cfg, running, layout, ticket, history, startMonitor, stopMonitor, initStore } from './store';

const route = useRoute();

// 侧栏折叠（本地持久化，下次启动保持）
const collapsed = ref(localStorage.getItem('sidebarCollapsed') === '1');
function toggleSidebar() {
  collapsed.value = !collapsed.value;
  localStorage.setItem('sidebarCollapsed', collapsed.value ? '1' : '0');
}

const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const navItems = [
  { key: 'desk', name: '打单台', to: '/desk', ico: svg('<path d="M6 9V4h12v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M8 16h8v4H8z"/>') },
  { key: 'spec', name: '打印规格', to: '/spec', ico: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>') },
  { key: 'history', name: '历史订单', to: '/history', ico: svg('<path d="M4 5h16M4 12h16M4 19h10"/>') },
];

const meta = computed(() => route.meta || {});
const isActive = (key) => route.name === key;

onMounted(initStore);
</script>

<template>
  <div class="app-shell">
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
          <span v-if="item.key === 'history' && history.length" class="badge">{{ history.length }}</span>
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
