import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { ArcoResolver } from 'unplugin-vue-components/resolvers';

// Tauri 期望前端固定端口 5173，且不允许自动切换端口
export default defineConfig({
  plugins: [
    vue(),
    // Arco 按需引入：模板里用到的 a-xxx 组件自动 import，样式随组件加载
    Components({
      resolvers: [ArcoResolver()],
      dts: false, // 纯 JS 项目不生成类型声明
    }),
  ],
  clearScreen: false,
  css: {
    preprocessorOptions: {
      scss: { api: 'modern-compiler' }, // 用现代 Sass API，消除 legacy-js-api 警告
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2021',
  },
});
