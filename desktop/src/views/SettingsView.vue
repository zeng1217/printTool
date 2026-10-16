<script setup>
import { computed } from 'vue';
import { cfg, setTheme, setBrowserPrint, saveSettings } from '../store';
import { THEME_PRESETS, applyTheme } from '../theme';

// 开关映射 printMode：browser <-> direct
const useBrowser = computed({
  get: () => cfg.printMode === 'browser',
  set: (v) => setBrowserPrint(v),
});

const current = computed(() => (cfg.themeColor || '#3370ff').toLowerCase());

// 取色器实时预览（拖动时即时变色），松手/改变时持久化
function onPickLive(e) { applyTheme(e.target.value); }
function onPickCommit(e) { setTheme(e.target.value); }
</script>

<template>
  <div class="page-settings">
    <!-- 主题颜色 -->
    <div class="section">
      <div class="section-title"><span class="t-left"><span class="bar"></span>主题颜色</span></div>
      <div class="section-desc">选择一个主色，按钮 / 导航 / 强调色即时变化并自动保存</div>

      <div class="swatches">
        <button
          v-for="p in THEME_PRESETS"
          :key="p.hex"
          class="swatch"
          :class="{ on: current === p.hex.toLowerCase() }"
          :style="{ background: p.hex }"
          :title="p.name"
          @click="setTheme(p.hex)"
        >
          <span v-if="current === p.hex.toLowerCase()" class="tick">✓</span>
        </button>
      </div>

      <div class="custom-color">
        <span class="lbl">自定义</span>
        <input type="color" :value="cfg.themeColor" @input="onPickLive" @change="onPickCommit" />
        <span class="hex-val">{{ cfg.themeColor }}</span>
        <a-button size="mini" @click="setTheme('#3370ff')">恢复默认</a-button>
      </div>
    </div>

    <!-- 打印行为 -->
    <div class="section">
      <div class="section-title"><span class="t-left"><span class="bar"></span>打印行为</span></div>
      <div class="section-desc">控制点击打印时是否弹出浏览器打印预览</div>

      <div class="set-row">
        <div class="set-info">
          <div class="set-name">使用浏览器预览打印页面</div>
          <div class="set-sub">开启后走浏览器打印对话框；关闭则对标签机静默直打（推荐）</div>
        </div>
        <a-switch v-model="useBrowser" type="round" />
      </div>

      <div class="set-row">
        <div class="set-info">
          <div class="set-name">收新单自动打单</div>
          <div class="set-sub">监听到新订单时自动打印该标签</div>
        </div>
        <a-switch v-model="cfg.autoPrint" type="round" @change="saveSettings" />
      </div>

      <div class="hint">静默直打需打印机就绪；直打失败会自动降级为浏览器打印，不丢单。当前输出方式：{{ cfg.printMode }}。</div>
    </div>
  </div>
</template>

<style scoped>
.page-settings { display: flex; flex-direction: column; gap: 22px; }
.swatches { display: flex; flex-wrap: wrap; gap: 12px; margin: 4px 0 18px; }
.swatch {
  width: 42px; height: 42px; border-radius: 10px; border: 2px solid transparent; cursor: pointer;
  box-shadow: var(--shadow-xs); display: flex; align-items: center; justify-content: center;
  transition: transform .14s var(--ease), box-shadow .14s var(--ease), border-color .14s var(--ease);
}
.swatch:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.swatch.on { border-color: var(--text); }
.swatch .tick { color: #fff; font-size: 16px; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,.35); }

.custom-color { display: flex; align-items: center; gap: 12px; }
.custom-color .lbl { font-size: 13px; color: var(--text-2); font-weight: 500; }
.custom-color input[type='color'] {
  width: 44px; height: 30px; padding: 0; border: 1px solid var(--border); border-radius: 8px; background: #fff; cursor: pointer;
}
.hex-val { font-size: 13px; color: var(--text-3); font-variant-numeric: tabular-nums; letter-spacing: .5px; }

.set-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 0; border-top: 1px solid var(--border-weak);
}
.set-row:first-of-type { border-top: none; }
.set-name { font-size: 14px; font-weight: 500; color: var(--text); }
.set-sub { font-size: 12.5px; color: var(--text-3); margin-top: 3px; }
</style>
