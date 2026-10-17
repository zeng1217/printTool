<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import TicketCanvas from '../components/TicketCanvas.vue';
import { MM_PX } from '../layout';
import { cfg, ticket, layout, simulate, doPrint, openLabelWindow } from '../store';

// 实时预览自适应：按可用区域把标签缩放到尽量大（允许缩小以适配，上限 3 倍）；
// 关键：preview-box 用 overflow:hidden + 允许 zoom<1，保证内容永不溢出→无滚动条→无 ResizeObserver 反馈振荡（否则临界尺寸会“闪”）
const previewBox = ref(null);
const zoom = ref(1);
const natW = computed(() => (layout.value.Wd || 0) * MM_PX);
const natH = computed(() => (layout.value.Hd || 0) * MM_PX);
let ro = null;
function measure() {
  const el = previewBox.value;
  if (!el || !natW.value || !natH.value) return;
  const w = el.clientWidth - 28;
  const h = el.clientHeight - 28;
  if (w <= 0 || h <= 0) return;
  const s = Math.min(w / natW.value, h / natH.value);
  const z = Math.max(0.1, Math.min(s, 3));
  if (Math.abs(z - zoom.value) > 0.01) zoom.value = z; // 阈值防抖，打破亚像素抖动
}
watch([natW, natH], measure);
onMounted(() => {
  measure();
  ro = new ResizeObserver(measure);
  if (previewBox.value) ro.observe(previewBox.value);
});
onBeforeUnmount(() => { if (ro) { ro.disconnect(); ro = null; } });
</script>

<template>
  <div class="section desk-section">
    <div class="desk-cols">
      <div class="col-form">
        <div class="section-title"><span class="t-left"><span class="bar"></span>当前订单</span></div>
        <div class="section-desc">新订单到达时自动填充；可从历史重新打印</div>

        <div class="form-grid">
          <div class="form-item span-2">
            <span class="lbl">买家昵称</span>
            <a-input v-model="ticket.nickname" placeholder="买家昵称" allow-clear />
          </div>
          <div class="form-item span-2">
            <span class="lbl">商品名称</span>
            <a-input v-model="ticket.goodsName" placeholder="商品名称" allow-clear />
          </div>
          <div class="form-item">
            <span class="lbl">数量</span>
            <a-input v-model="ticket.goodsQty" placeholder="1" />
          </div>
          <div class="form-item">
            <span class="lbl">实付金额</span>
            <a-input v-model="ticket.orderPrice" placeholder="0.00" />
          </div>
          <div class="form-item">
            <span class="lbl">收货人</span>
            <a-input v-model="ticket.receiverName" placeholder="收货人" allow-clear />
          </div>
          <div class="form-item">
            <span class="lbl">省市区</span>
            <a-input v-model="ticket.receiverArea" placeholder="省市区" allow-clear />
          </div>
          <div class="form-item span-2">
            <span class="lbl">订单号</span>
            <a-input v-model="ticket.orderId" placeholder="订单号" allow-clear />
          </div>
        </div>

        <div class="row-end">
          <a-button @click="simulate">本地模拟出单</a-button>
          <div class="btn-group">
            <a-button @click="openLabelWindow">独立预览窗口</a-button>
            <a-button type="primary" @click="doPrint">打印该标签</a-button>
          </div>
        </div>
      </div>

      <div class="col-preview">
        <div class="preview-label">实时预览 · {{ cfg.paperH }}×{{ cfg.paperW }}mm <a class="pop-link" @click="openLabelWindow">弹窗显示 ↗</a></div>
        <div class="preview-box" ref="previewBox">
          <div class="preview-scale" :style="{ width: natW * zoom + 'px', height: natH * zoom + 'px' }">
            <div class="preview-inner" :style="{ width: natW + 'px', height: natH + 'px', transform: 'scale(' + zoom + ')' }">
              <TicketCanvas :layout="layout" :data="ticket" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="hint" style="margin-top: 16px">启动监听后会自动拉起 Edge/Chrome 打开抖店后台，首次需在该浏览器里登录一次（登录态本地保存）。</div>
  </div>
</template>

<style scoped>
.btn-group { display: flex; align-items: center; gap: 10px; }
.pop-link {
  margin-left: 8px; color: var(--primary); cursor: pointer; font-weight: 500; font-size: 12.5px;
}
.pop-link:hover { text-decoration: underline; }

/* 填充 .main 剩余高度（不再用 100vh 估算，避免底部留白 + 假滚动条）；两列拉伸等高，右侧预览随之稳定 */
.desk-section { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
.desk-cols { gap: 20px; flex: 1 1 auto; min-height: 0; }
.desk-cols .col-form { flex: 1 1 300px; min-width: 240px; }
.desk-cols .col-form .form-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 2px 16px; }
.desk-cols .form-item { margin-bottom: 10px; }
.desk-cols .section-desc { margin-bottom: 12px; }
.desk-cols .col-preview { min-width: 280px; }
.preview-box { min-height: 0; }
.row-end { margin-top: 4px; }
</style>
