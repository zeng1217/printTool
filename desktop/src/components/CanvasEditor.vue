<script setup>
import { reactive, computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { MM_PX, FIELD_CATALOG, makeEl } from '../layout';

const props = defineProps({
  paperW: { type: Number, required: true },
  paperH: { type: Number, required: true },
  modelValue: { type: Object, required: true }, // { Wd, Hd, elements }
});
const emit = defineEmits(['update:modelValue', 'save']);

// 工作副本（深拷贝，避免直接改父级）
const doc = reactive(JSON.parse(JSON.stringify(props.modelValue)));
watch(
  () => props.modelValue,
  (v) => Object.assign(doc, JSON.parse(JSON.stringify(v))),
);
// 纸尺寸变化时同步内容盒
watch(
  () => [props.paperW, props.paperH],
  ([w, h]) => {
    doc.Wd = h;
    doc.Hd = w;
  },
);

// —— 自适应缩放：默认整张标签铺满可视区(fit)，可再放大缩小 ——
const stageWrap = ref(null);
const zoomPct = ref(100); // 相对 fit 的百分比
const availW = ref(0);
const availH = ref(0);
let ro = null;

const fitScale = computed(() => {
  if (!availW.value || !availH.value) return 1;
  const s = Math.min(availW.value / (doc.Wd * MM_PX), availH.value / (doc.Hd * MM_PX));
  return s > 0 ? s : 1;
});
const effScale = computed(() => fitScale.value * (zoomPct.value / 100));
const stageW = computed(() => doc.Wd * MM_PX * effScale.value);
const stageH = computed(() => doc.Hd * MM_PX * effScale.value);
const px = (mm) => mm * MM_PX * effScale.value;

function measureStage() {
  const el = stageWrap.value;
  if (!el) return;
  availW.value = el.clientWidth - 16;
  availH.value = el.clientHeight - 16;
}
function zoomIn() { zoomPct.value = Math.min(400, zoomPct.value + 15); }
function zoomOut() { zoomPct.value = Math.max(40, zoomPct.value - 15); }
function zoomFit() { zoomPct.value = 100; }

const selected = ref(null);
const editingId = ref(null); // 正在就地编辑文字的元素 id
const sampleData = {
  nickname: '小锦鲤',
  goodsName: '【发饰自选】高颜值发绳',
  goodsQty: '1',
  orderPrice: '20.00',
  receiverName: '李*',
  receiverArea: '陕西省西安市长安区',
  orderTime: '2026-01-01 12:00:00',
  orderId: '6918366037883038',
  orderSeq: '第1单',
  shopName: '示例店铺',
  goodsNotice: '（示例说明文字）',
};

function textOf(el) {
  if (el.type === 'text') return el.text || '（文字）';
  if (el.type === 'divider') return '';
  return sampleData[el.field] ?? el.field;
}

// —— 拖拽 / 缩放 ——
let drag = null;
function onElDown(e, el) {
  e.preventDefault();
  e.stopPropagation();
  selected.value = el.id;
  const mode = e.target.dataset.handle === 'se' ? 'resize' : 'move';
  drag = { id: el.id, mode, startX: e.clientX, startY: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
function mmRound(v) {
  return Math.round(v * 2) / 2; // 0.5mm 吸附
}
function onMove(e) {
  if (!drag) return;
  const el = doc.elements.find((x) => x.id === drag.id);
  if (!el) return;
  const dmm = { x: (e.clientX - drag.startX) / (MM_PX * effScale.value), y: (e.clientY - drag.startY) / (MM_PX * effScale.value) };
  if (drag.mode === 'move') {
    el.x = Math.max(0, mmRound(drag.ox + dmm.x));
    el.y = Math.max(0, mmRound(drag.oy + dmm.y));
  } else {
    el.w = Math.max(1, mmRound(drag.ow + dmm.x));
    el.h = Math.max(0.5, mmRound(drag.oh + dmm.y));
  }
}
function onUp() {
  drag = null;
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseup', onUp);
  pushChange();
}
onMounted(() => {
  measureStage();
  ro = new ResizeObserver(measureStage);
  if (stageWrap.value) ro.observe(stageWrap.value);
  window.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  onUp();
  if (ro) { ro.disconnect(); ro = null; }
  window.removeEventListener('keydown', onKeydown);
});

function pushChange() {
  emit('update:modelValue', JSON.parse(JSON.stringify(doc)));
}

// —— 增删元素 ——
function addField(field, name) {
  const el = makeEl({ type: 'field', field, x: 3, y: 3 + doc.elements.length, w: 30, h: 4, fontSize: 3 });
  doc.elements.push(el);
  selected.value = el.id;
  pushChange();
  void name;
}
function addText() {
  const el = makeEl({ type: 'text', text: '自定义文字', x: 3, y: 3 + doc.elements.length, w: 30, h: 4, fontSize: 3 });
  doc.elements.push(el);
  selected.value = el.id;
  pushChange();
}
function addDivider() {
  const el = makeEl({ type: 'divider', x: 3, y: 3 + doc.elements.length, w: doc.Wd - 6, h: 0.3, fontSize: 0 });
  doc.elements.push(el);
  selected.value = el.id;
  pushChange();
}
function removeSelected() {
  if (!selected.value) return;
  doc.elements = doc.elements.filter((e) => e.id !== selected.value);
  selected.value = null;
  pushChange();
}
const selEl = computed(() => doc.elements.find((e) => e.id === selected.value) || null);

// 键盘微调：方向键移动 0.5mm（Shift 加速 2mm），Delete 删除
function onKeydown(e) {
  const el = selEl.value;
  if (!el) return;
  const t = document.activeElement;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  const step = e.shiftKey ? 2 : 0.5;
  let done = true;
  if (e.key === 'ArrowLeft') el.x = Math.max(0, mmRound(el.x - step));
  else if (e.key === 'ArrowRight') el.x = mmRound(el.x + step);
  else if (e.key === 'ArrowUp') el.y = Math.max(0, mmRound(el.y - step));
  else if (e.key === 'ArrowDown') el.y = mmRound(el.y + step);
  else if (e.key === 'Delete' || e.key === 'Backspace') { removeSelected(); return; }
  else done = false;
  if (done) { e.preventDefault(); pushChange(); }
}

// —— 选中元素就地操作（悬浮工具条） ——
function beginEdit(el) {
  if (el.type !== 'text') return;
  selected.value = el.id;
  editingId.value = el.id;
}
function removeEl(el) {
  doc.elements = doc.elements.filter((e) => e.id !== el.id);
  if (selected.value === el.id) selected.value = null;
  if (editingId.value === el.id) editingId.value = null;
  pushChange();
}
function bumpFont(el, d) {
  el.fontSize = Math.min(20, Math.max(1, mmRound((el.fontSize || 0) + d)));
  pushChange();
}
function toggleBold(el) { el.bold = !el.bold; pushChange(); }
function cycleAlign(el) {
  el.align = el.align === 'left' ? 'center' : el.align === 'center' ? 'right' : 'left';
  pushChange();
}
const alignIcon = (a) => (a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥');

function save() {
  emit('save', JSON.parse(JSON.stringify(doc)));
}
</script>

<template>
  <div class="editor">
    <!-- 左：字段面板 -->
    <div class="palette">
      <div class="pal-title">字段模块</div>
      <div class="pal-list">
        <button v-for="f in FIELD_CATALOG" :key="f.field" class="pal-btn" @click="addField(f.field, f.name)">
          + {{ f.name }}
        </button>
      </div>
      <div class="pal-title" style="margin-top: 12px">插入</div>
      <button class="pal-btn" @click="addText">+ 文字</button>
      <button class="pal-btn" @click="addDivider">+ 分割线</button>
    </div>

    <!-- 中：画布 -->
    <div class="stage-col">
      <div class="stage-tools">
        <span class="st-hint">缩放</span>
        <button class="st-btn" @click="zoomOut">−</button>
        <span class="st-pct">{{ Math.round(zoomPct) }}%</span>
        <button class="st-btn" @click="zoomIn">+</button>
        <button class="st-btn wide" @click="zoomFit">适应</button>
        <span class="st-tip">拖动移动 · 方向键微调(Shift 加速) · Delete 删除</span>
      </div>
    <div class="stage-wrap" ref="stageWrap">
      <div class="stage" :style="{ width: stageW + 'px', height: stageH + 'px' }" @click="selected = null">
        <div
          v-for="el in doc.elements"
          :key="el.id"
          class="node"
          :class="{ sel: el.id === selected }"
          :style="{ left: px(el.x) + 'px', top: px(el.y) + 'px', width: px(el.w) + 'px', height: el.type === 'divider' ? '2px' : px(el.h) + 'px' }"
          @mousedown="onElDown($event, el)"
          @dblclick="beginEdit(el)"
        >
          <span v-if="el.type === 'divider'" class="div-line"></span>
          <input
            v-else-if="editingId === el.id && el.type === 'text'"
            class="node-edit"
            v-model="el.text"
            @mousedown.stop
            @change="pushChange"
            @blur="editingId = null"
          />
          <span v-else class="node-text" :style="{ fontSize: px(el.fontSize) + 'px', fontWeight: el.bold ? 700 : 400, textAlign: el.align }">{{ textOf(el) }}</span>
          <div v-if="el.id === selected" class="node-tools" :class="{ below: px(el.y) < 28 }" @mousedown.stop>
            <button v-if="el.type === 'text'" class="nt" title="编辑文字" @click.stop="beginEdit(el)">✎</button>
            <template v-if="el.type !== 'divider'">
              <button class="nt" title="缩小字号" @click.stop="bumpFont(el, -0.5)">A−</button>
              <button class="nt" title="放大字号" @click.stop="bumpFont(el, 0.5)">A＋</button>
              <button class="nt" :class="{ on: el.bold }" title="粗体" @click.stop="toggleBold(el)">B</button>
              <button class="nt" title="对齐方式" @click.stop="cycleAlign(el)">{{ alignIcon(el.align) }}</button>
            </template>
            <button class="nt del" title="删除" @click.stop="removeEl(el)">✕</button>
          </div>
          <i v-if="el.id === selected" class="handle" data-handle="se" @mousedown="onElDown($event, el)"></i>
        </div>
      </div>
    </div>
    </div>

    <!-- 右：属性 -->
    <div class="props">
      <div class="pal-title">属性</div>
      <div v-if="!selEl" class="props-empty">选中画布中的元素进行编辑</div>
      <div v-else class="props-form">
        <div class="p-row"><label>类型</label><span class="p-val">{{ selEl.type }}</span></div>
        <div v-if="selEl.type === 'field'" class="p-row">
          <label>字段</label>
          <select v-model="selEl.field" @change="pushChange">
            <option v-for="f in FIELD_CATALOG" :key="f.field" :value="f.field">{{ f.name }}</option>
          </select>
        </div>
        <div v-if="selEl.type === 'text'" class="p-row">
          <label>文字</label><input v-model="selEl.text" @change="pushChange" />
        </div>
        <template v-if="selEl.type !== 'divider'">
          <div class="p-row"><label>字号(mm)</label><input type="number" step="0.1" v-model.number="selEl.fontSize" @change="pushChange" /></div>
          <div class="p-row">
            <label>粗体</label><input type="checkbox" v-model="selEl.bold" @change="pushChange" />
          </div>
          <div class="p-row">
            <label>对齐</label>
            <select v-model="selEl.align" @change="pushChange">
              <option value="left">左</option><option value="center">中</option><option value="right">右</option>
            </select>
          </div>
        </template>
        <div class="p-row"><label>X (mm)</label><input type="number" step="0.5" v-model.number="selEl.x" @change="pushChange" /></div>
        <div class="p-row"><label>Y (mm)</label><input type="number" step="0.5" v-model.number="selEl.y" @change="pushChange" /></div>
        <div class="p-row"><label>宽 (mm)</label><input type="number" step="0.5" v-model.number="selEl.w" @change="pushChange" /></div>
        <div v-if="selEl.type !== 'divider'" class="p-row"><label>高 (mm)</label><input type="number" step="0.5" v-model.number="selEl.h" @change="pushChange" /></div>
        <button class="btn btn-danger" style="margin-top: 10px; width: 100%" @click="removeSelected">删除元素</button>
      </div>
      <button class="btn btn-success" style="margin-top: auto" @click="save">保存布局</button>
    </div>
  </div>
</template>

<style scoped>
.editor { display: flex; gap: 16px; align-items: stretch; }
.palette, .props { flex: 0 0 200px; display: flex; flex-direction: column; }
.pal-title { font-size: 12px; color: var(--text-3); font-weight: 600; margin-bottom: 8px; letter-spacing: .4px; text-transform: uppercase; }
.pal-list { display: flex; flex-direction: column; gap: 5px; }
.pal-btn {
  text-align: left; padding: 7px 11px; border: 1px solid var(--border-weak); border-radius: 8px;
  background: #fff; font-size: 13px; cursor: pointer; margin-bottom: 4px; color: var(--text-2);
  transition: all .14s var(--ease);
}
.pal-btn:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-weak); box-shadow: var(--shadow-xs); }

.stage-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.stage-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--text-3); }
.stage-tools .st-hint { font-weight: 600; color: var(--text-2); }
.stage-tools .st-tip { margin-left: auto; }
.st-btn { min-width: 26px; height: 24px; padding: 0 6px; border: 1px solid var(--border); background: #fff; border-radius: 6px; cursor: pointer; font-size: 14px; line-height: 1; color: var(--text-2); }
.st-btn:hover { border-color: var(--primary); color: var(--primary); }
.st-btn.wide { font-size: 12px; padding: 0 10px; }
.st-pct { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; color: var(--text); }
.stage-wrap { flex: 1; min-width: 0; min-height: 440px; display: flex; overflow: auto; padding: 8px; background: #f7f8fa; border: 1px solid var(--border-weak); border-radius: 10px; }
.stage {
  margin: auto; position: relative; background: #fff; border: 1px solid var(--border-weak);
  border-radius: 4px; box-shadow: var(--shadow-lg);
  background-image: linear-gradient(#f1f3f6 1px, transparent 1px), linear-gradient(90deg, #f1f3f6 1px, transparent 1px);
  background-size: 10px 10px;
}
.node {
  position: absolute; border: 1px dashed transparent; cursor: move; box-sizing: border-box;
  display: flex; align-items: center; transition: border-color .12s, background .12s;
}
.node:hover { border-color: #b9c6e6; }
.node.sel { border: 1px solid var(--primary); background: rgba(51, 112, 255, 0.06); box-shadow: 0 0 0 3px var(--primary-ring); }
.node-text { display: block; width: 100%; color: #000; line-height: 1.1; overflow: hidden; white-space: nowrap; }
.div-line { display: block; width: 100%; border-top: 1px solid #000; }
.handle {
  position: absolute; right: -6px; bottom: -6px; width: 14px; height: 14px;
  background: #fff; border: 2px solid var(--primary); border-radius: 50%; cursor: nwse-resize; box-shadow: var(--shadow-sm);
}

/* 选中元素就地悬浮工具条 */
.node-tools {
  position: absolute; left: 50%; top: -28px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 2px; padding: 3px;
  background: #1f2329; border-radius: 7px; box-shadow: var(--shadow-md); z-index: 6; white-space: nowrap;
}
.node-tools.below { top: auto; bottom: -30px; }
.nt {
  border: none; background: transparent; color: #e8eaed; cursor: pointer;
  min-width: 22px; height: 22px; padding: 0 6px; border-radius: 5px;
  font-size: 12px; line-height: 1; display: inline-flex; align-items: center; justify-content: center;
}
.nt:hover { background: rgba(255, 255, 255, 0.16); color: #fff; }
.nt.on { background: var(--primary); color: #fff; }
.nt.del:hover { background: #e5484d; color: #fff; }
.node-edit {
  position: absolute; inset: 0; box-sizing: border-box; width: 100%; height: 100%;
  border: 1px solid var(--primary); border-radius: 3px; outline: none; padding: 0 3px;
  font-family: inherit; background: #fff; color: #000;
}

.props-form { display: flex; flex-direction: column; gap: 10px; }
.props-empty { color: var(--text-3); font-size: 12px; }
.p-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; }
.p-row label { color: var(--text-2); flex-shrink: 0; }
.p-row input, .p-row select { padding: 6px 10px; height: 32px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; max-width: 116px; outline: none; background: #fff; transition: border-color .15s, box-shadow .15s; }
.p-row input:focus, .p-row select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-ring); }
.p-row input[type='checkbox'] { width: 16px; height: 16px; max-width: none; padding: 0; accent-color: var(--primary); }
.p-val { color: var(--text); font-variant-numeric: tabular-nums; }
</style>
