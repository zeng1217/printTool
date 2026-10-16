<script setup>
import { reactive, ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { listen, emit } from '@tauri-apps/api/event';
import TicketCanvas from './TicketCanvas.vue';
import { MM_PX } from '../layout';

// 独立标签预览窗口：只读展示主窗口同步过来的票面，不参与监听/打印
const localTicket = reactive({
  orderSeq: '', shopName: '', nickname: '', receiverName: '', receiverArea: '',
  goodsName: '', goodsNotice: '', goodsQty: '', orderPrice: '', orderTime: '', orderId: '',
});
const localLayout = ref(null);

const root = ref(null);
const scale = ref(1);
const natW = computed(() => (localLayout.value ? localLayout.value.Wd * MM_PX : 0));
const natH = computed(() => (localLayout.value ? localLayout.value.Hd * MM_PX : 0));

function measure() {
  const L = localLayout.value;
  if (!L || !root.value) return;
  const cw = root.value.clientWidth - 28;
  const ch = root.value.clientHeight - 64; // 预留标题栏高度
  if (cw <= 0 || ch <= 0) return;
  scale.value = Math.min(cw / (L.Wd * MM_PX), ch / (L.Hd * MM_PX), 3);
}
let ro = null;

let unlisten = null;
onMounted(async () => {
  unlisten = await listen('ticket-sync', (e) => {
    if (!e.payload) return;
    Object.assign(localTicket, e.payload.ticket);
    localLayout.value = e.payload.layout;
    nextTick(measure);
  });
  ro = new ResizeObserver(measure);
  if (root.value) ro.observe(root.value);
  // 主动向主窗口索取当前票面
  emit('ticket-request');
});
onBeforeUnmount(() => {
  if (unlisten) unlisten();
  if (ro) ro.disconnect();
});
</script>

<template>
  <div class="label-win" ref="root">
    <div class="lw-cap">
      <span class="lw-dot"></span>
      <span>标签实时预览</span>
      <span v-if="localLayout" class="lw-dim">{{ localLayout.paperW }}×{{ localLayout.paperH }}mm</span>
    </div>
    <div class="lw-stage">
      <div
        v-if="localLayout"
        class="lw-scale"
        :style="{ width: natW + 'px', height: natH + 'px', transform: `scale(${scale})` }"
      >
        <TicketCanvas :layout="localLayout" :data="localTicket" />
      </div>
      <div v-else class="lw-empty">等待主窗口同步票面数据…</div>
    </div>
  </div>
</template>

<style scoped>
.label-win { display: flex; flex-direction: column; height: 100vh; background: #eef1f6; }
.lw-cap {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  font-size: 12.5px; font-weight: 600; color: var(--text-2);
  background: #fff; border-bottom: 1px solid var(--border-weak);
}
.lw-dim { margin-left: auto; color: var(--text-3); font-weight: 400; font-variant-numeric: tabular-nums; }
.lw-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 3px rgba(0, 180, 90, 0.15); }
.lw-stage { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 14px; }
.lw-scale { flex-shrink: 0; transform-origin: center center; box-shadow: var(--shadow-lg); border-radius: 4px; }
.lw-empty { color: var(--text-3); font-size: 13px; }
</style>
