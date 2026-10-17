<script setup>
import { computed, reactive, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { history, keyword, refreshHistory, searchHistory, fillTicket, historyPage, historyPageSize, historyTotal, historyTimeRange, exportCsvManual, openDataDir } from '../store';

const router = useRouter();

// 表格局部滚动：测量 .table-wrap 高度，把 Arco scroll.y 设为可用高度（减去表头），
// 使表格填充固定容器、内部纵向滚动，分页始终钉在底部不受数据量影响。
const tableWrap = ref(null);
const tableY = ref(400);
let tableRo = null;
function measureTable() {
  const el = tableWrap.value;
  if (!el) return;
  tableY.value = Math.max(160, el.clientHeight - 46); // 46 ≈ 表头高度
}
onMounted(() => {
  measureTable();
  tableRo = new ResizeObserver(measureTable);
  if (tableWrap.value) tableRo.observe(tableWrap.value);
});
onBeforeUnmount(() => { if (tableRo) { tableRo.disconnect(); tableRo = null; } });

function onPageChange(page) {
  historyPage.value = page;
  refreshHistory();
}
function onPageSizeChange(size) {
  historyPageSize.value = size;
  searchHistory();
}
function onRangeChange() {
  searchHistory();
}

// 可切换显隐的列（仅操作列 op 始终显示）
const togglable = [
  { key: 'seq', label: '序号' },
  { key: 'nickname', label: '昵称' },
  { key: 'goods_name', label: '商品' },
  { key: 'order_price', label: '金额' },
  { key: 'order_time', label: '下单时间' },
  { key: 'order_id', label: '订单号' },
];
const visible = reactive({ seq: true, nickname: true, goods_name: true, order_price: true, order_time: true, order_id: true });

const baseColumns = [
  { key: 'seq', title: '序号', dataIndex: 'seq', width: 72 },
  { key: 'nickname', title: '昵称', dataIndex: 'nickname', width: 130, ellipsis: true, tooltip: true },
  { key: 'goods_name', title: '商品', dataIndex: 'goods_name', minWidth: 160, ellipsis: true, tooltip: true },
  { key: 'order_price', title: '金额', dataIndex: 'order_price', width: 90 },
  { key: 'order_time', title: '下单时间', dataIndex: 'order_time', width: 170 },
  { key: 'order_id', title: '订单号', dataIndex: 'order_id', width: 180, ellipsis: true },
  { key: 'op', title: '操作', slotName: 'op', width: 96, align: 'center', fixed: 'right' },
];
const columns = computed(() =>
  baseColumns.filter((c) => c.key === 'op' || visible[c.key]),
);

// 重新打印：不静默直打，而是载入该单并切至打单台预览，确认后手动打印
function reprint(row) {
  fillTicket(row, false);
  Message.success(`已载入订单 #${row.seq}，在打单台预览后点击“打印该标签”`);
  router.push('/desk');
}
</script>

<template>
  <div class="section history-section">
    <div class="row-end" style="margin-bottom: 16px">
      <a-input-search
        v-model="keyword"
        placeholder="搜索昵称 / 订单号 / 商品"
        style="max-width: 300px"
        search-button
        button-text="查询"
        @search="searchHistory"
        @press-enter="searchHistory"
      />
      <a-range-picker
        v-model="historyTimeRange"
        :style="{ width: '260px' }"
        value-format="YYYY-MM-DD"
        allow-clear
        @change="onRangeChange"
      />
      <a-dropdown trigger="click" :popup-max-height="false">
        <a-button>列显示</a-button>
        <template #content>
          <div class="col-menu">
            <div class="col-menu-title">显示列</div>
            <a-checkbox v-for="t in togglable" :key="t.key" v-model="visible[t.key]" class="col-opt">{{ t.label }}</a-checkbox>
          </div>
        </template>
      </a-dropdown>
      <span class="tool-sep"></span>
      <a-button @click="exportCsvManual">导出 CSV</a-button>
      <a-button @click="openDataDir">打开数据文件夹</a-button>
    </div>

    <div class="table-wrap" ref="tableWrap">
    <a-table
      :columns="columns"
      :data="history"
      :pagination="false"
      :scroll="{ x: 760, y: tableY }"
      :border="{ wrapper: true, cell: false }"
      size="small"
      row-key="id"
    >
      <template #order_price="{ record }">
        <span class="mono">{{ record.order_price }}</span>
      </template>
      <template #order_time="{ record }">
        <span class="mono">{{ record.order_time }}</span>
      </template>
      <template #order_id="{ record }">
        <span class="mono">{{ record.order_id }}</span>
      </template>
      <template #op="{ record }">
        <span class="link-op" @click="reprint(record)">重新打印</span>
      </template>
      <template #empty>
        <div class="empty">暂无订单记录</div>
      </template>
    </a-table>
    </div>

    <div class="hist-pager">
      <a-pagination
        :current="historyPage"
        :page-size="historyPageSize"
        :total="historyTotal"
        :page-size-options="[10, 20, 50, 100]"
        show-total
        show-jumper
        show-page-size
        size="small"
        @change="onPageChange"
        @page-size-change="onPageSizeChange"
      />
    </div>
  </div>
</template>

<style scoped>
/* 行高收紧：Arco 默认单元格上下内边距较大，导致行偏高 */
:deep(.arco-table-element) { font-size: 13px; }
:deep(.arco-table-td), :deep(.arco-table-th) { padding-top: 5px; padding-bottom: 5px; }
:deep(.arco-table-td-content) { line-height: 1.4; }
/* 列显隐面板 */
.col-menu { padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; min-width: 130px; background: #fff; border-radius: 8px; }
.col-menu-title { font-size: 12px; color: var(--text-3); font-weight: 600; margin-bottom: 2px; }
.col-opt { display: flex; }
/* 填充 .main 剩余高度（不用 100vh 估算）：工具栏/分页钉住上下两端，表格居中填充并可局部滚动 */
.history-section { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
.history-section .row-end { flex: none; }
.table-wrap { flex: 1 1 auto; min-height: 0; overflow: hidden; }
/* 分页栏 */
.hist-pager { flex: none; display: flex; justify-content: flex-end; margin-top: 14px; }
.tool-sep { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }
/* 滚动条美化（局部纵向滚动需可见）：细、圆角、半透明，横纵统一 */
:deep(.arco-table-body)::-webkit-scrollbar { width: 8px; height: 8px; }
:deep(.arco-table-body)::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.16); border-radius: 6px; }
:deep(.arco-table-body)::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.28); }
:deep(.arco-table-body)::-webkit-scrollbar-track { background: transparent; }
</style>
