import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles.scss';
// 按需引入下，模板组件样式由 ArcoResolver 自动加载；Message 是 JS API，样式手动补
import '@arco-design/web-vue/es/message/style/css';

createApp(App).use(router).mount('#app');
