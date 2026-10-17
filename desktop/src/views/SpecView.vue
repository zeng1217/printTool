<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import CanvasEditor from '../components/CanvasEditor.vue';
import TicketCanvas from '../components/TicketCanvas.vue';
import {
  cfg, layout, printerList, saveSettings, onLayoutSave,
  refreshPrinters, onConnKindChange, doPrint, resetLayout,
} from '../store';

// 窗口缩到很窄时（≤ 断点）不渲染拖拽编辑器，仅展示已保存布局的静态预览
const EDIT_BREAKPOINT = 820;
const mq = window.matchMedia(`(max-width: ${EDIT_BREAKPOINT}px)`);
const tiny = ref(mq.matches);
function onMediaChange(e) { tiny.value = e.matches; }
onMounted(() => {
  if (mq.addEventListener) mq.addEventListener('change', onMediaChange);
  else mq.addListener(onMediaChange);
});
onBeforeUnmount(() => {
  if (mq.removeEventListener) mq.removeEventListener('change', onMediaChange);
  else mq.removeListener(onMediaChange);
});

// 只读预览用示例数据填充字段（不改动真实订单）
const previewData = {
  orderSeq: '第1单', shopName: cfg.shopName || '示例店铺', nickname: '小锦鲤',
  receiverName: '李*', receiverArea: '陕西省西安市长安区',
  goodsName: '【发饰自选】高颜值发绳', goodsNotice: cfg.goodsNotice || '',
  goodsQty: '1', orderPrice: '20.00', orderTime: '2026-01-01 12:00:00', orderId: '6918366037883038',
};
</script>

<template>
  <div class="page-spec">
  <!-- 纸张与固定文案 -->
  <div class="section">
    <div class="section-title"><span class="t-left"><span class="bar"></span>纸张与固定文案</span></div>
    <div class="form-grid">
      <div class="form-item">
        <span class="lbl">进纸宽 (mm)</span>
        <a-input-number v-model="cfg.paperW" :min="20" :max="210" :step="1" hide-button />
      </div>
      <div class="form-item">
        <span class="lbl">进纸长 (mm)</span>
        <a-input-number v-model="cfg.paperH" :min="20" :max="300" :step="1" hide-button />
      </div>
      <div class="form-item span-2">
        <span class="lbl">店铺名称</span>
        <a-input v-model="cfg.shopName" placeholder="打印在标签上的店铺名" allow-clear />
      </div>
      <div class="form-item span-2">
        <span class="lbl">默认说明备注</span>
        <a-textarea v-model="cfg.goodsNotice" :auto-size="{ minRows: 2 }" placeholder="绑定到“说明备注”字段的固定文字" />
      </div>
    </div>
    <div class="row-end">
      <label class="switch-label"><a-switch v-model="cfg.autoPrint" type="round" /> 收新单自动打单</label>
      <a-button type="primary" @click="saveSettings">保存尺寸/文案</a-button>
    </div>
  </div>

  <!-- 打印方式 -->
  <div class="section">
    <div class="section-title"><span class="t-left"><span class="bar"></span>打印方式</span></div>
    <div class="section-desc">专业标签机推荐静默直打：生成 TSPL 指令绕开驱动与对话框，毫秒出单</div>
    <div class="form-grid">
      <div class="form-item">
        <span class="lbl">输出方式</span>
        <a-select v-model="cfg.printMode">
          <a-option value="direct">静默直打（推荐）</a-option>
          <a-option value="browser">浏览器打印对话框</a-option>
          <a-option value="tspl_file">导出 TSPL 指令（调试）</a-option>
        </a-select>
      </div>
      <div v-if="cfg.printMode === 'direct'" class="form-item">
        <span class="lbl">连接方式</span>
        <a-select v-model="cfg.connKind" @change="onConnKindChange">
          <a-option value="auto">自动检测</a-option>
          <a-option value="usb">USB 打印机队列</a-option>
          <a-option value="tcp">网络打印 IP:9100</a-option>
        </a-select>
      </div>
      <div v-if="cfg.connKind === 'usb'" class="form-item">
        <span class="lbl">打印机</span>
        <a-select v-model="cfg.printerName" placeholder="— 选择队列 —" allow-clear>
          <a-option v-for="p in printerList" :key="p" :value="p">{{ p }}</a-option>
        </a-select>
      </div>
      <div v-if="cfg.connKind === 'tcp'" class="form-item">
        <span class="lbl">打印机 IP（端口默认 9100）</span>
        <a-input v-model="cfg.tcpAddr" placeholder="192.168.1.100" allow-clear />
      </div>
    </div>
    <div class="row-end">
      <a-button @click="refreshPrinters">刷新打印机列表</a-button>
      <a-button @click="doPrint">测试打印一张</a-button>
    </div>
    <div class="hint">直打失败时会自动降级为浏览器打印，不丢单。macOS 需在系统设置里先添加 N31L（驱动任选，仅取队列名）。</div>
  </div>

  <!-- 拖拽排版画布 -->
  <div class="section">
    <div class="section-title">
      <span class="t-left"><span class="bar"></span>拖拽排版画布</span>
      <a-popconfirm v-if="!tiny" content="将丢弃当前排版并恢复默认模板，确认？" type="warning" ok-text="恢复" @ok="resetLayout">
        <a-button size="small">恢复默认布局</a-button>
      </a-popconfirm>
    </div>
    <div class="section-desc">左侧添加字段/文字/分割线，中间拖动与缩放，右侧调属性，完成后点“保存布局”</div>
    <CanvasEditor v-if="!tiny" v-model="layout" :paper-w="cfg.paperW" :paper-h="cfg.paperH" @save="onLayoutSave" />
    <div v-else class="layout-readonly">
      <div class="ro-hint">窗口较小，仅显示已保存的布局预览；放大窗口即可继续编辑</div>
      <div class="ro-stage">
        <div class="preview-scale" :style="{ width: layout.Wd * 3.78 + 'px', height: layout.Hd * 3.78 + 'px' }">
          <TicketCanvas :layout="layout" :data="previewData" />
        </div>
      </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
.layout-readonly { display: flex; flex-direction: column; gap: 10px; }
.ro-hint {
  font-size: 12.5px; color: var(--text-3);
  background: var(--primary-weak); border: 1px solid rgba(51, 112, 255, 0.18);
  border-radius: 8px; padding: 8px 12px;
}
.ro-stage {
  display: flex; overflow: auto; padding: 16px; min-height: 260px;
  background: #f7f8fa; border: 1px solid var(--border-weak); border-radius: 10px;
}
.ro-stage .preview-scale { margin: auto; box-shadow: var(--shadow-md); border: 1px solid var(--border-weak); }
</style>
