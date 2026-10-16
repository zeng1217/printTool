// vite.config.js
import { defineConfig } from "file:///Users/y/Desktop/%E7%9B%91%E5%90%AC%E6%89%93%E5%8D%B0/desktop/node_modules/vite/dist/node/index.js";
import vue from "file:///Users/y/Desktop/%E7%9B%91%E5%90%AC%E6%89%93%E5%8D%B0/desktop/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import Components from "file:///Users/y/Desktop/%E7%9B%91%E5%90%AC%E6%89%93%E5%8D%B0/desktop/node_modules/unplugin-vue-components/dist/vite.mjs";
import { ArcoResolver } from "file:///Users/y/Desktop/%E7%9B%91%E5%90%AC%E6%89%93%E5%8D%B0/desktop/node_modules/unplugin-vue-components/dist/resolvers.mjs";
var vite_config_default = defineConfig({
  plugins: [
    vue(),
    // Arco 按需引入：模板里用到的 a-xxx 组件自动 import，样式随组件加载
    Components({
      resolvers: [ArcoResolver()],
      dts: false
      // 纯 JS 项目不生成类型声明
    })
  ],
  clearScreen: false,
  css: {
    preprocessorOptions: {
      scss: { api: "modern-compiler" }
      // 用现代 Sass API，消除 legacy-js-api 警告
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    target: "es2021"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMveS9EZXNrdG9wL1x1NzZEMVx1NTQyQ1x1NjI1M1x1NTM3MC9kZXNrdG9wXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMveS9EZXNrdG9wL1x1NzZEMVx1NTQyQ1x1NjI1M1x1NTM3MC9kZXNrdG9wL3ZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy95L0Rlc2t0b3AvJUU3JTlCJTkxJUU1JTkwJUFDJUU2JTg5JTkzJUU1JThEJUIwL2Rlc2t0b3Avdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCB2dWUgZnJvbSAnQHZpdGVqcy9wbHVnaW4tdnVlJztcbmltcG9ydCBDb21wb25lbnRzIGZyb20gJ3VucGx1Z2luLXZ1ZS1jb21wb25lbnRzL3ZpdGUnO1xuaW1wb3J0IHsgQXJjb1Jlc29sdmVyIH0gZnJvbSAndW5wbHVnaW4tdnVlLWNvbXBvbmVudHMvcmVzb2x2ZXJzJztcblxuLy8gVGF1cmkgXHU2NzFGXHU2NzFCXHU1MjREXHU3QUVGXHU1NkZBXHU1QjlBXHU3QUVGXHU1M0UzIDUxNzNcdUZGMENcdTRFMTRcdTRFMERcdTUxNDFcdThCQjhcdTgxRUFcdTUyQThcdTUyMDdcdTYzNjJcdTdBRUZcdTUzRTNcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICB2dWUoKSxcbiAgICAvLyBBcmNvIFx1NjMwOVx1OTcwMFx1NUYxNVx1NTE2NVx1RkYxQVx1NkEyMVx1Njc3Rlx1OTFDQ1x1NzUyOFx1NTIzMFx1NzY4NCBhLXh4eCBcdTdFQzRcdTRFRjZcdTgxRUFcdTUyQTggaW1wb3J0XHVGRjBDXHU2ODM3XHU1RjBGXHU5NjhGXHU3RUM0XHU0RUY2XHU1MkEwXHU4RjdEXG4gICAgQ29tcG9uZW50cyh7XG4gICAgICByZXNvbHZlcnM6IFtBcmNvUmVzb2x2ZXIoKV0sXG4gICAgICBkdHM6IGZhbHNlLCAvLyBcdTdFQUYgSlMgXHU5ODc5XHU3NkVFXHU0RTBEXHU3NTFGXHU2MjEwXHU3QzdCXHU1NzhCXHU1OEYwXHU2NjBFXG4gICAgfSksXG4gIF0sXG4gIGNsZWFyU2NyZWVuOiBmYWxzZSxcbiAgY3NzOiB7XG4gICAgcHJlcHJvY2Vzc29yT3B0aW9uczoge1xuICAgICAgc2NzczogeyBhcGk6ICdtb2Rlcm4tY29tcGlsZXInIH0sIC8vIFx1NzUyOFx1NzNCMFx1NEVFMyBTYXNzIEFQSVx1RkYwQ1x1NkQ4OFx1OTY2NCBsZWdhY3ktanMtYXBpIFx1OEI2Nlx1NTQ0QVxuICAgIH0sXG4gIH0sXG4gIHNlcnZlcjoge1xuICAgIHBvcnQ6IDUxNzMsXG4gICAgc3RyaWN0UG9ydDogdHJ1ZSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICB0YXJnZXQ6ICdlczIwMjEnLFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXlTLFNBQVMsb0JBQW9CO0FBQ3RVLE9BQU8sU0FBUztBQUNoQixPQUFPLGdCQUFnQjtBQUN2QixTQUFTLG9CQUFvQjtBQUc3QixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxJQUFJO0FBQUE7QUFBQSxJQUVKLFdBQVc7QUFBQSxNQUNULFdBQVcsQ0FBQyxhQUFhLENBQUM7QUFBQSxNQUMxQixLQUFLO0FBQUE7QUFBQSxJQUNQLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxhQUFhO0FBQUEsRUFDYixLQUFLO0FBQUEsSUFDSCxxQkFBcUI7QUFBQSxNQUNuQixNQUFNLEVBQUUsS0FBSyxrQkFBa0I7QUFBQTtBQUFBLElBQ2pDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLEVBQ2Q7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxFQUNWO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
