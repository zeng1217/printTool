import { createRouter, createWebHashHistory } from 'vue-router';
import DeskView from './views/DeskView.vue';
import SpecView from './views/SpecView.vue';
import HistoryView from './views/HistoryView.vue';
import SettingsView from './views/SettingsView.vue';

// 四个功能页；hash 模式适配桌面本地协议，无需服务端路由
export const routes = [
  { path: '/', redirect: '/desk' },
  { path: '/desk', name: 'desk', component: DeskView, meta: { title: '打单台', desc: '监听抖店新订单，实时预览并自动打印' } },
  { path: '/spec', name: 'spec', component: SpecView, meta: { title: '打印规格', desc: '可视化拖拽画布，自由排版每个字段的位置与大小' } },
  { path: '/history', name: 'history', component: HistoryView, meta: { title: '历史订单', desc: '本地留存的所有订单，可检索与重新打印' } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { title: '设置', desc: '主题颜色与打印行为偏好' } },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
