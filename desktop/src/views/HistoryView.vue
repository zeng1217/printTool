<script setup>
import { history, keyword, refreshHistory, fillTicket, doPrint } from '../store';

const columns = [
  { title: '序号', dataIndex: 'seq', width: 96 },
  { title: '昵称', dataIndex: 'nickname', width: 130, ellipsis: true, tooltip: true },
  { title: '商品', dataIndex: 'goods_name', ellipsis: true, tooltip: true },
  { title: '金额', dataIndex: 'order_price', width: 90 },
  { title: '下单时间', dataIndex: 'order_time', width: 170 },
  { title: '订单号', dataIndex: 'order_id', width: 180, ellipsis: true },
  { title: '操作', slotName: 'op', width: 96, align: 'center', fixed: 'right' },
];

function reprint(row) {
  fillTicket(row, true);
  doPrint();
}
</script>

<template>
  <div class="section">
    <div class="row-end" style="margin-bottom: 16px; justify-content: flex-start">
      <a-input-search
        v-model="keyword"
        placeholder="搜索昵称 / 订单号 / 商品"
        style="max-width: 320px"
        search-button
        button-text="查询"
        @search="refreshHistory"
        @press-enter="refreshHistory"
      />
    </div>

    <a-table
      :columns="columns"
      :data="history"
      :pagination="false"
      :scroll="{ x: 760 }"
      :border="{ wrapper: true, cell: false }"
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
</template>
