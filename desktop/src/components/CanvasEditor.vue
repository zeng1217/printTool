<script setup>
import { reactive, computed, ref, watch, onBeforeUnmount } from 'vue';
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

// 显示缩放：让内容盒宽约 560px
const zoom = computed(() => 560 / (doc.Wd * MM_PX));
const stageW = computed(() => doc.Wd * MM_PX * zoom.value);
const stageH = computed(() => doc.Hd * MM_PX * zoom.value);
const px = (mm) => mm * MM_PX * zoom.value;

const selected = ref(null);
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
  const dmm = { x: (e.clientX - drag.startX) / (MM_PX * zoom.value), y: (e.clientY - drag.startY) / (MM_PX * zoom.value) };
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
onBeforeUnmount(onUp);

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
    <div class="stage-wrap">
      <div class="stage" :style="{ width: stageW + 'px', height: stageH + 'px' }" @click="selected = null">
        <div
          v-for="el in doc.elements"
          :key="el.id"
          class="node"
          :class="{ sel: el.id === selected }"
          :style="{ left: px(el.x) + 'px', top: px(el.y) + 'px', width: px(el.w) + 'px', height: el.type === 'divider' ? '2px' : px(el.h) + 'px' }"
          @mousedown="onElDown($event, el)"
        >
          <span v-if="el.type === 'divider'" class="div-line"></span>
          <span v-else class="node-text" :style="{ fontSize: px(el.fontSize) + 'px', fontWeight: el.bold ? 700 : 400, textAlign: el.align }">{{ textOf(el) }}</span>
          <i v-if="el.id === selected" class="handle" data-handle="se" @mousedown="onElDown($event, el)"></i>
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
        <div class="p-row"><label>X / Y</label><span class="p-val">{{ selEl.x }} / {{ selEl.y }}</span></div>
        <div class="p-row"><label>宽 / 高</label><span class="p-val">{{ selEl.w }} / {{ selEl.h }}</span></div>
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

.stage-wrap { flex: 1; display: flex; justify-content: center; align-items: flex-start; overflow: auto; padding: 8px; }
.stage {
  position: relative; background: #fff; border: 1px solid var(--border-weak);
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
  position: absolute; right: -5px; bottom: -5px; width: 11px; height: 11px;
  background: #fff; border: 2px solid var(--primary); border-radius: 50%; cursor: nwse-resize; box-shadow: var(--shadow-xs);
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
