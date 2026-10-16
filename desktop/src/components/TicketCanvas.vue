<script setup>
const props = defineProps({
  layout: { type: Object, required: true }, // { Wd, Hd, elements:[...] }
  data: { type: Object, required: true },
  id: { type: String, default: null },
});

function valueOf(el) {
  if (el.type === 'text') return el.text || '';
  if (el.type === 'field') return props.data[el.field] ?? '';
  return '';
}
</script>

<template>
  <div
    :id="id"
    class="ticket-canvas"
    :style="{ width: layout.Wd + 'mm', height: layout.Hd + 'mm' }"
  >
    <div
      v-for="el in layout.elements"
      :key="el.id"
      :class="el.type === 'divider' ? 'tc-divider' : 'tc-el'"
      :style="
        el.type === 'divider'
          ? { left: el.x + 'mm', top: el.y + 'mm', width: el.w + 'mm' }
          : {
              left: el.x + 'mm',
              top: el.y + 'mm',
              width: el.w + 'mm',
              height: el.h + 'mm',
              fontSize: el.fontSize + 'mm',
              fontWeight: el.bold ? 700 : 400,
              textAlign: el.align,
            }
      "
    >{{ el.type === 'divider' ? '' : valueOf(el) }}</div>
  </div>
</template>

<style scoped>
.ticket-canvas {
  position: relative;
  background: #fff;
  color: #000;
  font-family: -apple-system, BlinkMacSystemFont, 'SimSun', 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}
.tc-el {
  position: absolute;
  line-height: 1.15;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: hidden;
}
.tc-divider {
  position: absolute;
  height: 0;
  border-top: 0.3mm solid #000;
}
</style>
