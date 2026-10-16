import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Tauri 期望前端固定端口 5173，且不允许自动切换端口
export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2021',
  },
});
